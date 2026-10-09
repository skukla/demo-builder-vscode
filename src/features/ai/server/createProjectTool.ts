/**
 * create_project (Phase 3b) — headless, parameterized project creation for both
 * headless and EDS stacks.
 *
 * Reuses the wizard's own `buildProjectConfig` to assemble the exact creation
 * config (no divergence) and runs `executeProjectCreation`. Creation never
 * anchors the window to the project (the always-root home model keeps the
 * window at the projects root, so the live MCP session is never killed).
 * Returns the new project's name/path; the agent keeps working via
 * name-addressed tools, and can offer `open_view` to surface it.
 *
 * EDS stacks additionally run the existing storefront-setup orchestration
 * (`storefront-setup-start` → creates the GitHub repo from template, DA.live
 * content, Helix config) via a CAPTURING context, so the single tool call returns
 * the full per-phase progress timeline for the agent to narrate. Failures return
 * a structured, re-runnable result (the orchestration skips already-created
 * resources on retry).
 *
 * Validation follows the "validate, agent may choose" rule. All Adobe/GitHub/
 * DA.live auth is pre-flighted silently; a missing/expired session returns a
 * `needsAuth` handoff (agent → sign_in) instead of proceeding.
 *
 * LIVE-VERIFICATION (mocked in tests): the real `storefront-setup-start` run
 * (cloud-resource creation), its exact context needs, the edsConfig field
 * threading into `buildProjectConfig`, and cross-phase idempotency on re-run must
 * be validated against a real GitHub/DA.live/Adobe environment.
 */

import * as path from 'path';
import { z } from 'zod';
import { getAdobeTarget, runWithAdobeTarget } from './adobeTargetStore';
import { isOrgMismatchError, orgMismatchResult } from './adobeTools';
import { resolvePackage } from './createProjectPackage';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import {
    lastCompleteData,
    toPhaseTimeline,
    withCapturedProgress,
    type CapturedEvent,
} from './progressCapture';
import {
    NO_BACKEND_FOR_SCOPE,
    storeScopeEnv,
    storeScopeSchema,
    type StoreScope,
} from './storeScope';
import { ACCS_GRAPHQL_ENDPOINT } from '@/core/config/envVarKeys';
import { isMeshComponentId } from '@/core/constants';
import { dispatchHandler } from '@/core/handlers/dispatchHandler';
import { resolveProjectsRoot } from '@/core/utils/projectsRoot';
import {
    getAutoSelectedOptionalDependencies,
    getResolvedMeshRequirement,
    getStackById,
} from '@/features/components/services/demoPackageLoader';
import { projectRowOf } from '@/features/components/services/storefrontResolver';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import {
    buildProjectConfig,
    type ProjectConfigSource,
} from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { DemoPackage, Storefront } from '@/types/demoPackages';
import type { HandlerContext } from '@/types/handlers';
import type { AddedDemo } from '@/types/projectFile';
import type { WizardState } from '@/types/webview';
import type { StorefrontSetupCompletePayload } from '@/types/webviewPayloads';

/** Project a possibly-undefined org down to the lean `{ id, name }` surfaced on a mismatch. */
function leanOrg(
    org: WizardState['adobeOrg'] | undefined,
): { id: string; name?: string } | undefined {
    return org?.id ? { id: org.id, name: org.name } : undefined;
}

function projectsDir(): string {
    return resolveProjectsRoot();
}

/**
 * The backend's Commerce endpoint, recorded where the wizard's Connection step
 * records it: `componentConfigs[<backend id>].ACCS_GRAPHQL_ENDPOINT`.
 *
 * Until 2026-09-30 `accsEndpoint` reached only the storefront's `config.json`,
 * so an agent-created project had a Commerce store scope and no Commerce
 * endpoint — the REST tools, the mesh env and the admin link all read the
 * backend's config and found nothing (AB-53, project `justrite`).
 */
function backendEndpointConfig(
    stackId: string,
    accsEndpoint: string | undefined,
    storeScope?: StoreScope,
): ProjectConfigSource['componentConfigs'] {
    const backend = getStackById(stackId)?.backend;
    if (!backend || (!accsEndpoint && !storeScope)) return {};
    return {
        [backend]: {
            ...(accsEndpoint ? { [ACCS_GRAPHQL_ENDPOINT]: accsEndpoint } : {}),
            // The scope the caller chose (AI-11), where configure_project writes it,
            // so the config.json creation generates names it from the start.
            ...(storeScope ? storeScopeEnv(storeScope) : {}),
        },
    };
}

/**
 * Check a `storeScope` argument the way `configure_project`'s schema does, before
 * anything is created: all three codes, as text, and a backend to hold them.
 *
 * @returns the scope (undefined when none was given), or the refusal
 */
export function parseStoreScope(
    stackId: string,
    raw: unknown,
): { storeScope?: StoreScope } | { error: string } {
    if (raw === undefined) return {};
    const parsed = storeScopeSchema.safeParse(raw);
    if (!parsed.success) {
        return { error: 'storeScope needs all three codes as text: website, store and storeView.' };
    }
    if (!getStackById(stackId)?.backend) return { error: NO_BACKEND_FOR_SCOPE };
    return { storeScope: parsed.data };
}

const NEEDS_ADOBE = {
    needsAuth: 'adobe',
    message:
        'Adobe sign-in required (this project deploys an API Mesh). Use get_auth_status, then sign_in(provider:"adobe", confirm:true).',
};

/** Resolve current Adobe context, or a structured handoff/precondition error. */
async function requireAdobeWorkspace(ctx: HandlerContext): Promise<
    | {
          org: WizardState['adobeOrg'];
          project: WizardState['adobeProject'];
          workspace: WizardState['adobeWorkspace'];
      }
    | { error: unknown }
> {
    const mgr = ctx.authManager;
    if (!mgr || !(await mgr.isAuthenticated())) return { error: NEEDS_ADOBE };

    // Prefer the MCP SESSION target.
    //
    // The refusal below tells the agent to run select_org → select_project →
    // select_workspace. Those write `adobeTargetStore` and deliberately do NOT
    // run `aio console select` (see adobeTools.ts's header). `getCurrentWorkspace()`
    // resolves through `aio console where` — the machine-global selection — so
    // following that instruction changed nothing here, and creation recorded
    // whatever another window or an earlier session last selected.
    //
    // `runWithAdobeTarget` already wraps EXECUTION with the session target, so
    // reading it here is what makes the recorded context and the executed context
    // the same thing.
    const stored = getAdobeTarget();
    if (stored?.orgId && stored.projectId && stored.workspaceId) {
        return {
            org: {
                id: stored.orgId,
                code: stored.orgCode ?? '',
                name: stored.orgName ?? '',
            } as WizardState['adobeOrg'],
            project: {
                id: stored.projectId,
                name: stored.projectName ?? '',
            } as WizardState['adobeProject'],
            workspace: {
                id: stored.workspaceId,
                name: stored.workspaceName ?? '',
            } as WizardState['adobeWorkspace'],
        };
    }

    // No session selection — fall back to the resolved context. Correct when the
    // agent never selected anything, and the only answer available then.
    const workspace = (await mgr.getCurrentWorkspace()) as WizardState['adobeWorkspace'];
    if (!workspace) {
        return {
            error: {
                error: 'An Adobe workspace is required for API Mesh. Select one first: select_org → select_project → select_workspace.',
            },
        };
    }
    return {
        org: (await mgr.getCurrentOrganization()) as WizardState['adobeOrg'],
        project: (await mgr.getCurrentProject()) as WizardState['adobeProject'],
        workspace,
    };
}

/**
 * Pre-flight GitHub + DA.live auth. Answers a needsAuth handoff, or the
 * signed-in GitHub login: the account the repository is created under when
 * the caller names no organization. The wizard fills the same field from its
 * auth status; without it storefront setup refuses with "GitHub owner not
 * configured" — which is what every agent creation of an EDS project did
 * until 2026-09-12, found live.
 */
async function edsAuthHandoff(
    ctx: HandlerContext,
): Promise<{ handoff: Record<string, unknown> } | { login: string | undefined }> {
    // Declared without an initializer on purpose: both arms below assign, so a
    // starting value would be a store nothing can read.
    let githubOk: boolean;
    let login: string | undefined;
    try {
        const validation = await getGitHubServices(
            ctx.context.secrets,
        ).tokenService.validateToken();
        githubOk = validation.valid;
        login = validation.user?.login;
    } catch {
        githubOk = false;
    }
    if (!githubOk) {
        return {
            handoff: {
                needsAuth: 'github',
                message:
                    'GitHub sign-in required to create the storefront repo. Check get_auth_status, then sign_in(provider:"github", confirm:true).',
            },
        };
    }
    let daLiveOk: boolean;
    try {
        daLiveOk = await getDaLiveAuthService(ctx.context).isAuthenticated();
    } catch {
        daLiveOk = false;
    }
    if (!daLiveOk) {
        return {
            handoff: {
                needsAuth: 'dalive',
                message:
                    'DA.live sign-in required for content setup. sign_in(provider:"dalive", confirm:true), paste the token in VS Code, then retry.',
            },
        };
    }
    return { login };
}

/**
 * What an exported project file adds to a creation: the inputs `create_project`
 * leaves at their defaults. Built by `create_project_from_file`; the creation
 * path is the same one either way.
 */
export type CreationSeed = Partial<
    Pick<
        ProjectConfigSource,
        | 'componentConfigs'
        | 'selectedAddons'
        | 'selectedBlockLibraries'
        | 'customBlockLibraries'
        | 'selectedAppBuilderComponents'
        | 'appBuilderComponentSources'
        | 'selectedConsoleApis'
        | 'datapack'
        | 'storeDiscoveryData'
    >
>;

/** What the two creation paths share: the ids, and the row when the package is an added demo (D2). */
interface CreateArgs {
    projectName: string;
    pkgId: string;
    stackId: string;
    demo?: AddedDemo;
    seed?: CreationSeed;
    /** The store scope the caller chose, already checked by `parseStoreScope` (AI-11). */
    storeScope?: StoreScope;
    /** The user accepted Demo Builder's fixes for an added demo (EDS-13f). */
    applyFixes?: boolean;
    /** Added to a successful answer (what a file brought, what is still needed). */
    report?: Record<string, unknown>;
}

type AdobeContext = Exclude<Awaited<ReturnType<typeof requireAdobeWorkspace>>, { error: unknown }>;

/**
 * The Adobe workspace the creation deploys into, when it deploys anything: a
 * mesh the package + stack requires, or the integrations a project file names.
 * A creation that deploys nothing needs no Adobe sign-in and gets none.
 */
async function adobeIfDeploying(
    ctx: HandlerContext,
    args: CreateArgs,
    pkg: DemoPackage,
): Promise<{ adobe?: AdobeContext } | { error: unknown }> {
    const deploys =
        getResolvedMeshRequirement(pkg, args.stackId) === true ||
        (args.seed?.selectedAppBuilderComponents?.length ?? 0) > 0;
    if (!deploys) return {};
    const resolved = await requireAdobeWorkspace(ctx);
    return 'error' in resolved ? resolved : { adobe: resolved };
}

/** A file's settings under the call's own: a value the call states wins. */
function mergedConfigs(
    seeded: ProjectConfigSource['componentConfigs'],
    stated: ProjectConfigSource['componentConfigs'],
): ProjectConfigSource['componentConfigs'] {
    const merged = { ...(seeded ?? {}) };
    for (const [id, config] of Object.entries(stated ?? {})) {
        merged[id] = { ...(merged[id] ?? {}), ...config };
    }
    return merged;
}

/** The creation inputs with a project file's selections laid in. No seed, no change. */
function withSeed(state: ProjectConfigSource, seed: CreationSeed | undefined): ProjectConfigSource {
    if (!seed) return state;
    return {
        ...state,
        componentConfigs: mergedConfigs(seed.componentConfigs, state.componentConfigs),
        selectedAppBuilderComponents: [
            ...new Set([
                ...(seed.selectedAppBuilderComponents ?? []),
                ...(state.selectedAppBuilderComponents ?? []),
            ]),
        ],
        appBuilderComponentSources: seed.appBuilderComponentSources,
        selectedConsoleApis: seed.selectedConsoleApis,
        selectedAddons: seed.selectedAddons ?? state.selectedAddons,
        selectedBlockLibraries: seed.selectedBlockLibraries ?? state.selectedBlockLibraries,
        customBlockLibraries: seed.customBlockLibraries ?? state.customBlockLibraries,
        datapack: seed.datapack,
        storeDiscoveryData: seed.storeDiscoveryData,
    };
}

/** Headless (non-EDS) creation path. */

async function createHeadless(
    ctx: HandlerContext,
    args: CreateArgs,
    pkg: DemoPackage,
    packages: DemoPackage[],
) {
    const resolved = await adobeIfDeploying(ctx, args, pkg);
    if ('error' in resolved) return asText(resolved.error);
    const { adobe } = resolved;

    const wizardState: ProjectConfigSource = {
        projectName: args.projectName,
        selectedPackage: args.pkgId,
        selectedStack: args.stackId,
        // Mesh ids ride selectedAppBuilderComponents (D3) — buildProjectConfig
        // derives the wire's dependencies list from them.
        selectedAppBuilderComponents: await getAutoSelectedOptionalDependencies(
            args.pkgId,
            args.stackId,
            packages,
        ),
        demo: args.demo,
        adobeOrg: adobe?.org,
        adobeProject: adobe?.project,
        adobeWorkspace: adobe?.workspace,
        componentConfigs: backendEndpointConfig(args.stackId, undefined, args.storeScope),
        selectedAddons: [],
        selectedBlockLibraries: [],
        customBlockLibraries: [],
    };

    const config = buildProjectConfig(withSeed(wizardState, args.seed), null, packages);
    try {
        // Run creation under the stored session org context so any `aio` work
        // targets the selected org/workspace via env (no global mutation).
        await runWithAdobeTarget(() => executeProjectCreation(ctx, config));
    } catch (err) {
        if (isOrgMismatchError(err)) return orgMismatchResult(leanOrg(adobe?.org));
        return asText({ created: false, error: err instanceof Error ? err.message : String(err) });
    }
    return asText({
        created: true,
        name: args.projectName,
        path: path.join(projectsDir(), args.projectName),
        // Not the block tools or sync_storefront: both need an Edge Delivery storefront.
        hint: 'Operate on it by name with the project tools (get_project_status, start_demo, update_project_config, …).',
        ...args.report,
    });
}

/** The part of a seed storefront setup reads, in the payload's own field names. */
function seededSetup(args: CreateArgs & { accsEndpoint?: string }): Record<string, unknown> {
    const { seed } = args;
    if (!seed) return {};
    return {
        componentConfigs: mergedConfigs(
            seed.componentConfigs,
            backendEndpointConfig(args.stackId, args.accsEndpoint, args.storeScope),
        ),
        selectedAddons: seed.selectedAddons,
        selectedBlockLibraries: seed.selectedBlockLibraries,
        customBlockLibraries: seed.customBlockLibraries,
    };
}

/** EDS creation path: provision the storefront (captured), then create the project. */
async function createEds(
    ctx: HandlerContext,
    args: CreateArgs & {
        repoName?: string;
        githubOwner?: string;
        daLiveOrg?: string;
        daLiveSite?: string;
        accsEndpoint?: string;
    },
    pkg: DemoPackage,
    storefront: Storefront,
    packages: DemoPackage[],
) {
    if (!args.repoName || !args.daLiveOrg || !args.daLiveSite) {
        return asText({ error: 'EDS projects require repoName, daLiveOrg, and daLiveSite.' });
    }
    if (args.stackId.endsWith('-accs') && !args.accsEndpoint) {
        return asText({
            error: 'EDS + ACCS projects require accsEndpoint (the Adobe Commerce Cloud GraphQL endpoint).',
        });
    }

    // Adobe is required only when this package + stack actually deploys a mesh —
    // the same question `createHeadless` asks. Unconditionally, this refused EVERY
    // EDS creation an agent attempted: all EDS packages except BuildRight declare
    // `requiresMesh: false`, and the refusal named API Mesh for projects that
    // declare they need none, which sends the reader hunting a mesh that is not
    // there. GitHub + DA.live are required for EDS regardless, below.
    const resolved = await adobeIfDeploying(ctx, args, pkg);
    if ('error' in resolved) return asText(resolved.error);
    const { adobe } = resolved;
    const auth = await edsAuthHandoff(ctx);
    if ('handoff' in auth) return asText(auth.handoff);
    const githubOwner = args.githubOwner ?? auth.login;
    if (!githubOwner) {
        return asText({
            error: 'GitHub did not name the signed-in account; pass githubOwner (your login or an organization you belong to).',
        });
    }

    const events: CapturedEvent[] = [];
    const capturing = withCapturedProgress(ctx, events);

    const edsConfigInput = {
        repoName: args.repoName,
        repoMode: 'new' as const,
        githubOwner,
        daLiveOrg: args.daLiveOrg,
        daLiveSite: args.daLiveSite,
        accsEndpoint: args.accsEndpoint,
        templateOwner: storefront.templateOwner,
        templateRepo: storefront.templateRepo,
        contentSource: storefront.contentSource,
    };

    // Phase 1: storefront setup (repo + DA.live content + Helix), reusing the
    // wizard's orchestration; progress is captured into `events`. Run under the
    // stored session org context so any `aio` work (mesh) targets the selected
    // org/workspace via env (no global mutation).
    const setupDeps = await getAutoSelectedOptionalDependencies(args.pkgId, args.stackId, packages);
    const setupRes = await runWithAdobeTarget(() =>
        dispatchHandler(edsHandlers, capturing, 'storefront-setup-start', {
            projectName: args.projectName,
            selectedPackage: args.pkgId,
            // Rehydration of package-derived config (brandAssets, codePatches,
            // …) requires BOTH the package and the stack id.
            selectedStack: args.stackId,
            dependencies: [
                ...new Set([
                    ...setupDeps,
                    ...(args.seed?.selectedAppBuilderComponents ?? []).filter(isMeshComponentId),
                ]),
            ],
            // A project file's settings and libraries, which the wizard sends
            // here too; absent for a plain create_project.
            ...seededSetup(args),
            // The row rides too: the phases read it for the repo branch, the
            // pages and the dry check, exactly as the wizard sends it.
            demo: args.demo,
            ...(args.applyFixes === true ? { applyDemoFixes: true } : {}),
            edsConfig: edsConfigInput,
        }),
    );
    if (!setupRes.success) {
        return asText({
            created: false,
            stage: 'storefront-setup',
            error: setupRes.error ?? 'Storefront setup did not complete.',
            phases: toPhaseTimeline(events),
            rerunSafe: true,
            hint: 'Fix the cause (e.g. re-auth via sign_in) and call create_project again — already-created resources (the repo) are skipped on retry.',
        });
    }
    // The completion payload names the repository `githubRepo` (typed on
    // StorefrontSetupCompletePayload); `repoUrl` was an invented key, read as
    // undefined for every agent creation until 2026-09-12, so the project was
    // saved without its repository and reset refused it.
    const complete: Partial<StorefrontSetupCompletePayload> = lastCompleteData(events) ?? {};
    const repoUrl = complete.githubRepo;
    // What the setup said about the storefront, in the words the wizard's card shows:
    // an added demo's caveats and the offer of Demo Builder's fixes (EDS-13f). The
    // agent never heard them before; the card was the only reader.
    const caveats = complete.warnings;
    // Recorded on the project for the Storefront Report, as the wizard does.
    const brokenLinks = complete.brokenLinks;

    // Phase 2: create the project, with preflight results threaded in.
    const wizardState: ProjectConfigSource = {
        projectName: args.projectName,
        selectedPackage: args.pkgId,
        selectedStack: args.stackId,
        // Mesh ids ride selectedAppBuilderComponents (D3), same as createHeadless.
        selectedAppBuilderComponents: await getAutoSelectedOptionalDependencies(
            args.pkgId,
            args.stackId,
            packages,
        ),
        demo: args.demo,
        adobeOrg: adobe?.org,
        adobeProject: adobe?.project,
        adobeWorkspace: adobe?.workspace,
        componentConfigs: backendEndpointConfig(args.stackId, args.accsEndpoint, args.storeScope),
        selectedAddons: [],
        selectedBlockLibraries: [],
        customBlockLibraries: [],
        edsConfig: {
            ...edsConfigInput,
            accsHost: args.accsEndpoint,
            contentPatches: storefront.contentPatches,
            repoUrl,
            preflightComplete: true,
            ...(brokenLinks?.length ? { brokenLinks } : {}),
            // Recorded on THIS project by creation, as the wizard does (EDS-37).
            installedBlockLibraries: complete.installedBlockLibraries,
        },
    };

    const config = buildProjectConfig(withSeed(wizardState, args.seed), null, packages);
    try {
        await runWithAdobeTarget(() => executeProjectCreation(capturing, config));
    } catch (err) {
        if (isOrgMismatchError(err)) return orgMismatchResult(leanOrg(adobe?.org));
        return asText({
            created: false,
            stage: 'project-creation',
            error: err instanceof Error ? err.message : String(err),
            phases: toPhaseTimeline(events),
            rerunSafe: true,
            hint: 'The storefront was provisioned but project finalization failed. Re-run create_project — provisioning is skipped on retry.',
        });
    }

    return asText({
        created: true,
        name: args.projectName,
        path: path.join(projectsDir(), args.projectName),
        repoUrl,
        ...(caveats?.length ? { caveats } : {}),
        phases: toPhaseTimeline(events),
        hint: 'Operate on it by name (list_blocks, sync_storefront, …).',
        ...args.report,
    });
}

/** One creation, as either door states it: `create_project`'s arguments, or a project file's. */
interface CreationRequest {
    projectName: string;
    pkgId: string;
    stackId: string;
    link?: string;
    repoName?: string;
    githubOwner?: string;
    daLiveOrg?: string;
    daLiveSite?: string;
    accsEndpoint?: string;
    /** Already checked by `parseStoreScope`. */
    storeScope?: StoreScope;
    /** The user accepted Demo Builder's fixes for an added demo (EDS-13f); never defaulted on. */
    applyFixes?: boolean;
    seed?: CreationSeed;
    report?: Record<string, unknown>;
}

/**
 * Create the project. The ONE creation path on the agent surface: `create_project`
 * and `create_project_from_file` both end here, so they cannot assemble or run a
 * creation differently.
 *
 * @param ctx     Headless HandlerContext for this call.
 * @param request What to build, already validated and consented to.
 * @returns the tool result
 */
export async function runProjectCreation(ctx: HandlerContext, request: CreationRequest) {
    const { pkgId, stackId, link, ...rest } = request;
    const resolved = await resolvePackage(ctx, { pkgId, stackId, link });
    if ('error' in resolved) return asText(resolved.error);
    const { pkg, storefront, packages, demo } = resolved;
    // A project row never carries the card's zip record.
    // An added demo whose package names its Commerce instance needs no endpoint
    // from the caller (EDS-22); one the caller passes still wins.
    const accsEndpoint = rest.accsEndpoint ?? demo?.configDefaults?.[ACCS_GRAPHQL_ENDPOINT];
    const args = { ...rest, accsEndpoint, pkgId: pkg.id, stackId, demo: projectRowOf(demo) };

    return stackId.startsWith('eds-')
        ? createEds(ctx, args, pkg, storefront, packages)
        : createHeadless(ctx, args, pkg, packages);
}

/**
 * Register `create_project`.
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext per call.
 */
export function registerCreateProjectTool(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'create_project',
        {
            needsAuth: ['github', 'dalive'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Create Project',
            description:
                "Create a new Demo Builder project headlessly from a package + stack. The package is a shipped brand id, an added demo's id (added:owner/repo, from list_demo_packages), or a colleague's demo given as link (probed and added first). EDS stacks also provision a GitHub repo + DA.live content. storeScope sets the store codes at creation, as configure_project does. Can pause for the user mid-run (a new repo needs the AEM Code Sync GitHub App, which only they can install): they are prompted in VS Code and the call resumes by itself, up to 30 minutes — tell them, and do not retry while it runs. Requires confirm:true",
            inputSchema: {
                projectName: z.string().describe('Name for the new project'),
                package: z
                    .string()
                    .optional()
                    .describe(
                        'Demo package / brand id, or an added demo id (from list_demo_packages). Omit when passing link.',
                    ),
                link: z
                    .string()
                    .optional()
                    .describe(
                        "A colleague's demo: a GitHub link or its site address. Added to your list first, then built on. Omit when passing package.",
                    ),
                stack: z.string().describe('Architecture stack id (from list_stacks)'),
                repoName: z
                    .string()
                    .optional()
                    .describe('EDS only: name for the new GitHub storefront repo'),
                githubOwner: z
                    .string()
                    .optional()
                    .describe(
                        'EDS only: the GitHub account or organization to create the repo under (default: the signed-in account)',
                    ),
                daLiveOrg: z.string().optional().describe('EDS only: DA.live organization'),
                daLiveSite: z.string().optional().describe('EDS only: DA.live site name'),
                accsEndpoint: z
                    .string()
                    .optional()
                    .describe(
                        "EDS + ACCS only: Adobe Commerce Cloud GraphQL endpoint (default: an added demo's own, when its package names one)",
                    ),
                // The same input configure_project takes (AI-11), so the demo's codes
                // need not be published first and corrected after.
                storeScope: storeScopeSchema.optional(),
                applyFixes: z
                    .boolean()
                    .optional()
                    .describe(
                        "Added demos only: apply the Demo Builder fixes that fit the demo's code (one commit to the new repo). " +
                            'Only when the user said yes to them; the default offers them and writes none',
                    ),
                confirm: z
                    .boolean()
                    .optional()
                    .describe(
                        'Must be true — creates a project (clones repos, installs deps; EDS also creates a real GitHub repo + DA.live content)',
                    ),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const projectName = String(args?.projectName ?? '').trim();
            const link = args?.link ? String(args.link) : undefined;
            const pkgId = String(args?.package ?? '');
            const stackId = String(args?.stack ?? '');
            if (!projectName || (!pkgId && !link) || !stackId) {
                return asText({
                    error: 'projectName, package (or link), and stack are all required.',
                });
            }
            const scope = parseStoreScope(stackId, args?.storeScope);
            if ('error' in scope) return asText(scope);
            if (args?.confirm !== true) {
                return asText({
                    error: 'create_project requires confirm:true — it installs dependencies and, for EDS, creates a real GitHub repo + DA.live content. Ask the user to confirm.',
                });
            }

            return runProjectCreation(ctxFactory(), {
                projectName,
                pkgId,
                stackId,
                link,
                repoName: args.repoName ? String(args.repoName) : undefined,
                githubOwner: args.githubOwner ? String(args.githubOwner) : undefined,
                daLiveOrg: args.daLiveOrg ? String(args.daLiveOrg) : undefined,
                daLiveSite: args.daLiveSite ? String(args.daLiveSite) : undefined,
                accsEndpoint: args.accsEndpoint ? String(args.accsEndpoint) : undefined,
                storeScope: scope.storeScope,
                ...(args.applyFixes === true ? { applyFixes: true } : {}),
            });
        },
    );
}
