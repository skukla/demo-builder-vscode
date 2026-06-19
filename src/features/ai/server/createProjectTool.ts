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

import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { runWithAdobeTarget } from './adobeTargetStore';
import { isOrgMismatchError, orgMismatchResult } from './adobeTools';
import {
    lastCompleteData,
    toPhaseTimeline,
    withCapturedProgress,
    type CapturedEvent,
} from './progressCapture';
import { dispatchHandler } from '@/core/handlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import {
    getAutoSelectedOptionalDependencies,
    getAvailableStacksForPackage,
    getResolvedMeshRequirement,
    getStorefrontForStack,
    getSelectablePackages,
} from '@/features/project-creation/services/demoPackageLoader';
import { buildProjectConfig } from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { DemoPackage, Storefront } from '@/types/demoPackages';
import type { HandlerContext } from '@/types/handlers';
import type { WizardState } from '@/types/webview';

function asText(value: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/** Project a possibly-undefined org down to the lean `{ id, name }` surfaced on a mismatch. */
function leanOrg(org: WizardState['adobeOrg'] | undefined): { id: string; name?: string } | undefined {
    return org?.id ? { id: org.id, name: org.name } : undefined;
}

function projectsDir(): string {
    return process.env.DEMO_BUILDER_PROJECTS_DIR ?? path.join(os.homedir(), '.demo-builder', 'projects');
}

const NEEDS_ADOBE = {
    needsAuth: 'adobe',
    message: 'Adobe sign-in required (this project deploys an API Mesh). Use get_auth_status, then sign_in(provider:"adobe", confirm:true).',
};

/** Resolve current Adobe context, or a structured handoff/precondition error. */
async function requireAdobeWorkspace(
    ctx: HandlerContext,
): Promise<{ org: WizardState['adobeOrg']; project: WizardState['adobeProject']; workspace: WizardState['adobeWorkspace'] } | { error: unknown }> {
    const mgr = ctx.authManager;
    if (!mgr || !(await mgr.isAuthenticated())) return { error: NEEDS_ADOBE };
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

/** Pre-flight GitHub + DA.live auth; return a needsAuth handoff or null. */
async function edsAuthHandoff(ctx: HandlerContext): Promise<Record<string, unknown> | null> {
    let githubOk = false;
    try {
        githubOk = (await getGitHubServices(ctx).tokenService.validateToken()).valid;
    } catch {
        githubOk = false;
    }
    if (!githubOk) {
        return {
            needsAuth: 'github',
            message: 'GitHub sign-in required to create the storefront repo. Check get_auth_status, then sign_in(provider:"github", confirm:true).',
        };
    }
    let daLiveOk = false;
    try {
        daLiveOk = await getDaLiveAuthService(ctx.context).isAuthenticated();
    } catch {
        daLiveOk = false;
    }
    if (!daLiveOk) {
        return {
            needsAuth: 'dalive',
            message: 'DA.live sign-in required for content setup. sign_in(provider:"dalive", confirm:true), paste the token in VS Code, then retry.',
        };
    }
    return null;
}

/** Headless (non-EDS) creation path. */
async function createHeadless(
    ctx: HandlerContext,
    args: { projectName: string; pkgId: string; stackId: string },
    pkg: DemoPackage,
    packages: DemoPackage[],
) {
    let adobe: { org: WizardState['adobeOrg']; project: WizardState['adobeProject']; workspace: WizardState['adobeWorkspace'] } | undefined;
    if (getResolvedMeshRequirement(pkg, args.stackId) === true) {
        const resolved = await requireAdobeWorkspace(ctx);
        if ('error' in resolved) return asText(resolved.error);
        adobe = resolved;
    }

    const wizardState = {
        projectName: args.projectName,
        selectedPackage: args.pkgId,
        selectedStack: args.stackId,
        selectedOptionalDependencies: await getAutoSelectedOptionalDependencies(args.pkgId, args.stackId),
        adobeOrg: adobe?.org,
        adobeProject: adobe?.project,
        adobeWorkspace: adobe?.workspace,
        componentConfigs: {},
        selectedAddons: [],
        selectedBlockLibraries: [],
        customBlockLibraries: [],
    } as unknown as WizardState;

    const config = buildProjectConfig(wizardState, null, packages) as unknown as Record<string, unknown>;
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
        hint: 'Operate on it by name with the project tools (list_blocks, update_project_config, sync_storefront, …).',
    });
}

/** EDS creation path: provision the storefront (captured), then create the project. */
async function createEds(
    ctx: HandlerContext,
    args: { projectName: string; pkgId: string; stackId: string; repoName?: string; daLiveOrg?: string; daLiveSite?: string; accsEndpoint?: string },
    pkg: DemoPackage,
    storefront: Storefront,
    packages: DemoPackage[],
) {
    if (!args.repoName || !args.daLiveOrg || !args.daLiveSite) {
        return asText({ error: 'EDS projects require repoName, daLiveOrg, and daLiveSite.' });
    }
    if (args.stackId.endsWith('-accs') && !args.accsEndpoint) {
        return asText({ error: 'EDS + ACCS projects require accsEndpoint (the Adobe Commerce Cloud GraphQL endpoint).' });
    }

    // Adobe (mesh) + GitHub + DA.live must all be authenticated before we create
    // real cloud resources.
    const adobe = await requireAdobeWorkspace(ctx);
    if ('error' in adobe) return asText(adobe.error);
    const handoff = await edsAuthHandoff(ctx);
    if (handoff) return asText(handoff);

    const events: CapturedEvent[] = [];
    const capturing = withCapturedProgress(ctx, events);

    const edsConfigInput = {
        repoName: args.repoName,
        repoMode: 'new' as const,
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
    const setupDeps = await getAutoSelectedOptionalDependencies(args.pkgId, args.stackId);
    const setupRes = await runWithAdobeTarget(() =>
        dispatchHandler(edsHandlers, capturing, 'storefront-setup-start', {
            projectName: args.projectName,
            selectedPackage: args.pkgId,
            dependencies: setupDeps,
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
    const repoUrl = lastCompleteData(events)?.repoUrl as string | undefined;

    // Phase 2: create the project, with preflight results threaded in.
    const wizardState = {
        projectName: args.projectName,
        selectedPackage: args.pkgId,
        selectedStack: args.stackId,
        selectedOptionalDependencies: await getAutoSelectedOptionalDependencies(args.pkgId, args.stackId),
        adobeOrg: adobe.org,
        adobeProject: adobe.project,
        adobeWorkspace: adobe.workspace,
        componentConfigs: {},
        selectedAddons: [],
        selectedBlockLibraries: [],
        customBlockLibraries: [],
        edsConfig: {
            ...edsConfigInput,
            accsHost: args.accsEndpoint,
            contentPatches: storefront.contentPatches,
            repoUrl,
            preflightComplete: true,
        },
    } as unknown as WizardState;

    const config = buildProjectConfig(wizardState, null, packages) as unknown as Record<string, unknown>;
    try {
        await runWithAdobeTarget(() => executeProjectCreation(capturing, config));
    } catch (err) {
        if (isOrgMismatchError(err)) return orgMismatchResult(leanOrg(adobe.org));
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
        phases: toPhaseTimeline(events),
        hint: 'Operate on it by name (list_blocks, sync_storefront, …).',
    });
}

/**
 * Register `create_project`.
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext per call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCreateProjectTool(server: any, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'create_project',
        {
            title: 'Create Project',
            description: 'Create a new Demo Builder project headlessly from a package + stack. EDS stacks also provision a GitHub repo + DA.live content. Requires confirm:true',
            inputSchema: {
                projectName: z.string().describe('Name for the new project'),
                package: z.string().describe('Demo package / brand id (from list_demo_packages)'),
                stack: z.string().describe('Architecture stack id (from list_stacks)'),
                repoName: z.string().optional().describe('EDS only: name for the new GitHub storefront repo'),
                daLiveOrg: z.string().optional().describe('EDS only: DA.live organization'),
                daLiveSite: z.string().optional().describe('EDS only: DA.live site name'),
                accsEndpoint: z.string().optional().describe('EDS + ACCS only: Adobe Commerce Cloud GraphQL endpoint'),
                confirm: z.boolean().optional().describe('Must be true — creates a project (clones repos, installs deps; EDS also creates a real GitHub repo + DA.live content)'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const projectName = String(args?.projectName ?? '').trim();
            const pkgId = String(args?.package ?? '');
            const stackId = String(args?.stack ?? '');
            if (!projectName || !pkgId || !stackId) {
                return asText({ error: 'projectName, package, and stack are all required.' });
            }
            if (args?.confirm !== true) {
                return asText({
                    error: 'create_project requires confirm:true — it installs dependencies and, for EDS, creates a real GitHub repo + DA.live content. Ask the user to confirm.',
                });
            }

            const packages = await getSelectablePackages();
            const pkg = packages.find((p) => p.id === pkgId);
            if (!pkg) {
                return asText({ error: `Unknown package: ${pkgId}`, validPackages: packages.map((p) => p.id) });
            }
            const storefront = await getStorefrontForStack(pkgId, stackId);
            if (!storefront) {
                return asText({
                    error: `Package "${pkgId}" has no "${stackId}" storefront.`,
                    validStacksForPackage: await getAvailableStacksForPackage(pkgId),
                });
            }

            const ctx = ctxFactory();
            const baseArgs = {
                projectName,
                pkgId,
                stackId,
                repoName: args.repoName ? String(args.repoName) : undefined,
                daLiveOrg: args.daLiveOrg ? String(args.daLiveOrg) : undefined,
                daLiveSite: args.daLiveSite ? String(args.daLiveSite) : undefined,
                accsEndpoint: args.accsEndpoint ? String(args.accsEndpoint) : undefined,
            };

            return stackId.startsWith('eds-')
                ? createEds(ctx, baseArgs, pkg, storefront, packages)
                : createHeadless(ctx, baseArgs, pkg, packages);
        },
    );
}
