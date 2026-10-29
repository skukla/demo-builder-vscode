/**
 * `configure_project` — the one tool that fills in what `create_project` leaves empty.
 *
 * `create_project` produces a structurally complete but UNCONFIGURED project: no
 * addons, no block libraries, no datapack, and no store scope unless the caller
 * passed one (`storeScope`, the same input as here — AI-11). Until now the
 * only way to fill those in was `update_project_config`, which rewrites a whole
 * file as a string — the one unguarded write on the surface.
 *
 * ## One wide tool, not five narrow ones (decided 2026-08-16)
 *
 * Configuring a project is one wizard step and one user intent. Five tools would
 * make it five model turns, five partial results, and five read-modify-write
 * wrappers over one saved project. The full reasoning is in the phase-4 plan;
 * the short version is that ROUND TRIPS dominate, not schema bytes.
 *
 * The narrow tools' one real advantage — invalid combinations being
 * unrepresentable in the schema — is bought back here instead:
 *
 *   - unknown keys are REJECTED, never ignored (a silently dropped field is the
 *     worst outcome for a configuration write);
 *   - store scope moves as a TRIPLE, because two of three codes is not a
 *     narrower scope, it is a broken one;
 *   - the result is the applied diff plus what is still unset, never a bare
 *     `{success: true}`.
 *
 * ## One save with the Configure screen (PL-76)
 *
 * Settings changes go through `stageSettingsChange`, the same staging the
 * Configure screen's Save uses: laid over the settings as they are now,
 * integration settings kept, the mesh AND the storefront marked out of date when
 * the change reaches them. The project is then saved and its `.env` files
 * regenerated. Before this, an agent's store scope left the storefront tile green
 * while `config.json` kept the old codes, and no `.env` was rewritten.
 *
 * What stays the screen's alone: renaming, the authoring choice and the prompts.
 * And two differences, stated plainly:
 *
 *   - SECRETS ARE REFUSED, not accepted and stored. A credential in a tool
 *     argument lands in the transcript and in whatever logs the agent keeps.
 *     Keys whose registry `type` is `password` return a `needsUser` handoff.
 *   - Mesh staleness is MARKED against the STORED settings, not detected against
 *     the deployed mesh. The screen fetches the deployed config over the `aio`
 *     CLI, which needs an org context and a network round trip. This is offline,
 *     and wrong only in the safe direction: it can over-report staleness, never
 *     under-report real drift.
 */

import { z } from 'zod';
import { needsUser } from './handoff';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import {
    NO_BACKEND_FOR_SCOPE,
    storeScopeEnv,
    storeScopeEnvKeys,
    storeScopeSchema,
    type StoreScope,
} from './storeScope';
import componentsConfig from '@/features/components/config/components.json';
import { componentRegistryFrom } from '@/features/components/services/componentRegistryAccess';
import { stageSettingsChange } from '@/features/dashboard/services/projectSettingsChange';
import { isStoreScopeChange } from '@/features/eds/services/storefront/storeScopeChange';
import type { MeshChanges } from '@/features/mesh/services/types';
import { regenerateProjectEnvFiles } from '@/features/project-creation/helpers/envFileRegeneration';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { getMeshComponentInstance } from '@/types/typeGuards';
import type { ComponentConfigs } from '@/types/webview';

const CONFIG = componentsConfig as unknown as Record<string, unknown>;

/** Env keys the registry marks `type: 'password'`. Read, never guessed. */
function secretKeys(): Set<string> {
    const registry = (CONFIG.envVars ?? {}) as Record<string, { type?: string }>;
    return new Set(
        Object.entries(registry)
            .filter(([, def]) => def?.type === 'password')
            .map(([key]) => key),
    );
}

/**
 * Env vars the project's mesh declares it depends on.
 *
 * Each mesh component lists them in `configuration.requiredEnvVars` — for
 * `eds-accs-mesh` that is the GraphQL endpoint plus the three store-scope codes,
 * which is exactly what this tool writes. Read from the registry, so a new mesh
 * or a changed dependency needs no edit here.
 */
function meshEnvDependencies(project: Project): Set<string> {
    const meshId = getMeshComponentInstance(project)?.id;
    if (!meshId) return new Set();

    const mesh = (
        (CONFIG.mesh ?? {}) as Record<string, { configuration?: { requiredEnvVars?: string[] } }>
    )[meshId];
    return new Set(mesh?.configuration?.requiredEnvVars ?? []);
}

const ACCEPTED = ['datapack', 'addons', 'blockLibraries', 'storeScope', 'env'] as const;

interface Applied {
    [field: string]: unknown;
}

/** What a freshly created project still lacks, so the agent knows what remains. */
function stillUnset(project: Project): string[] {
    const unset: string[] = [];
    if (!project.datapack) unset.push('datapack');
    if (!project.selectedBlockLibraries?.length) unset.push('blockLibraries');
    const backend = project.componentSelections?.backend;
    const backendConfig = backend ? project.componentConfigs?.[backend] : undefined;
    if (!backend || !backendConfig || !storeScopeEnvKeys(backend).every((k) => backendConfig[k])) {
        unset.push('storeScope');
    }
    return unset;
}

/**
 * The ids in an `env` payload that name one of the project's integrations or
 * systems. Their settings belong to the integration's tile (AB-21), and a change
 * reaches the app only through a redeploy, which this tool does not do. The mesh
 * is not one: its fields are project configuration.
 */
function integrationIdsIn(project: Project, env: Record<string, unknown>): string[] {
    return Object.keys(env).filter((id) => {
        const component = project.appBuilderComponents?.[id];
        return component !== undefined && component.kind !== 'mesh';
    });
}

/** The datapack, addons and block libraries: recorded on the project as given. */
function recordChoices(project: Project, input: Record<string, unknown>): Applied {
    const applied: Applied = {};
    if (input.datapack) {
        project.datapack = input.datapack as Project['datapack'];
        applied.datapack = project.datapack;
    }
    if (input.addons) {
        project.selectedAddons = input.addons as string[];
        applied.addons = project.selectedAddons;
    }
    if (input.blockLibraries) {
        project.selectedBlockLibraries = input.blockLibraries as string[];
        applied.blockLibraries = project.selectedBlockLibraries;
    }
    return applied;
}

/** A settings change built from the payload, before anything is applied. */
interface SettingsChange {
    /** Per component, only the values being set. */
    changes: ComponentConfigs;
    applied: Applied;
    /** Env keys whose VALUE differs from what the project stores. */
    changedKeys: Set<string>;
}

/**
 * The store scope and env vars of the payload, as a settings change.
 *
 * @returns the change, or an error when the payload cannot be applied at all
 */
function settingsChangeFrom(
    project: Project,
    input: Record<string, unknown>,
): SettingsChange | { error: string } {
    const changes: ComponentConfigs = {};
    const applied: Applied = {};
    // Rewriting a key with the value it already had is not a change, and must
    // not flag the mesh.
    const changedKeys = new Set<string>();
    const set = (componentId: string, key: string, value: string | boolean | number) => {
        if (project.componentConfigs?.[componentId]?.[key] !== value) changedKeys.add(key);
        changes[componentId] = { ...(changes[componentId] ?? {}), [key]: value };
    };

    if (input.storeScope) {
        const backend = project.componentSelections?.backend;
        if (!backend) return { error: NO_BACKEND_FOR_SCOPE };
        const scope = input.storeScope as StoreScope;
        // The key names the backend reads: SaaS and PaaS store them differently.
        for (const [key, value] of Object.entries(storeScopeEnv(scope, backend))) {
            set(backend, key, value);
        }
        applied.storeScope = scope;
    }

    if (input.env) {
        const env = input.env as Record<string, Record<string, string | boolean | number>>;
        const integrations = integrationIdsIn(project, env);
        if (integrations.length > 0) {
            return {
                error:
                    `${integrations.join(', ')} is an integration. Its settings are changed with ` +
                    'set_integration_settings (text) or in its Settings on its tile (secrets), ' +
                    'which also redeploy it; configure_project only sets project settings.',
            };
        }
        const envApplied: Record<string, string[]> = {};
        for (const [componentId, vars] of Object.entries(env)) {
            for (const [key, value] of Object.entries(vars ?? {})) set(componentId, key, value);
            envApplied[componentId] = Object.keys(vars ?? {});
        }
        // KEYS, not values. Echoing values back doubles a config payload and
        // puts anything the user typed into the transcript twice.
        applied.env = envApplied;
    }

    return { changes, applied, changedKeys };
}

/**
 * The mesh check this door makes: offline, against the STORED settings. A var the
 * mesh depends on whose value changed marks it out of date.
 */
function storedMeshChanges(project: Project, changedKeys: Set<string>): MeshChanges {
    const meshKeys = meshEnvDependencies(project);
    const changedEnvVars = [...changedKeys].filter((key) => meshKeys.has(key)).sort();
    const hasChanges = changedEnvVars.length > 0;
    return { hasChanges, envVarsChanged: hasChanges, sourceFilesChanged: false, changedEnvVars };
}

/**
 * Put a settings change on the project the way the Configure screen does, then
 * write the `.env` files from it.
 *
 * @returns what the change reached, and a reason when the `.env` files were not written
 */
async function applySettingsChange(
    ctx: HandlerContext,
    project: Project,
    change: SettingsChange,
): Promise<{ mesh: MeshChanges; storefrontVars: string[] }> {
    const staged = await stageSettingsChange(project, change.changes, {
        secrets: ctx.context.secrets,
        detectMeshChanges: async () => storedMeshChanges(project, change.changedKeys),
        log: (line) => ctx.logger.info(`[configure_project] ${line}`),
        warn: (line) => ctx.logger.warn(`[configure_project] ${line}`),
    });
    return {
        mesh: staged.meshChanges,
        storefrontVars: staged.storefrontChanges.hasChanges
            ? staged.storefrontChanges.changedEnvVars
            : [],
    };
}

/** Rewrite the project's `.env` files; a failure is reported, not thrown. */
async function regenerateEnvFiles(ctx: HandlerContext, project: Project): Promise<string | undefined> {
    try {
        const registry = await componentRegistryFrom(ctx).loadRegistry();
        await regenerateProjectEnvFiles(project, registry, ctx.logger, ctx.context.secrets);
        return undefined;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

/** What `republish` will also do when the change moved the storefront to another store (EDS-44). */
const STORE_CHANGE_NOTE =
    "The store changed, so republish also replaces the storefront's product and category pages with the new store's.";

/** What the agent must do next for the change to reach what is live. */
function nextSteps(mesh: boolean, storefrontVars: string[]): { note?: string } {
    const storefront = storefrontVars.length > 0;
    const steps = [
        mesh ? 'call deploy_mesh to redeploy the mesh' : '',
        storefront ? 'call republish to apply them to the storefront' : '',
    ].filter(Boolean);
    if (steps.length === 0) return {};
    const note = `These settings are now marked config-changed: ${steps.join(', then ')}.`;
    return { note: isStoreScopeChange(storefrontVars) ? `${note} ${STORE_CHANGE_NOTE}` : note };
}

export function registerConfigureProjectTool(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'configure_project',
        {
            needsAuth: false,
            annotations: { readOnlyHint: false, destructiveHint: false },
            description:
                'Configure the current project: datapack, addons, block libraries, store scope and non-secret env vars. Returns what changed and what is still unset. Secrets must be entered by the user.',
            // A STRICT z.object, not a raw shape. The SDK accepts both, but a raw
            // shape is zod's default `.strip()` — it SILENTLY DROPS unknown keys
            // before the handler ever runs, so the rejection below could never
            // fire and a payload of {addons, stroeScope} would apply the addons
            // and discard the typo without a word. `additionalProperties: false`
            // in the published schema only protects clients that validate; the
            // server must not depend on that. Found by probing live: a misspelled
            // key came back as "Nothing to apply" instead of naming the key.
            inputSchema: z
                .object({
                    datapack: z
                        .object({
                            name: z.string(),
                            version: z.string(),
                            store: z
                                .enum(['installer', 'library'])
                                .optional()
                                .describe('Which store holds the pack, as find_datapacks lists it; the Data Installer when absent'),
                        })
                        .optional()
                        .describe('Datapack that seeds this project, and the store that holds it (recorded, not imported)'),
                    addons: z
                        .array(z.string())
                        .optional()
                        .describe('Addon component ids, e.g. adobe-commerce-aco'),
                    blockLibraries: z
                        .array(z.string())
                        .optional()
                        .describe(
                            'Block library ids to enable. This records the choice; on an existing storefront, apply_updates then installs the blocks',
                        ),
                    storeScope: storeScopeSchema.optional(),
                    env: z
                        .record(z.record(z.union([z.string(), z.boolean(), z.number()])))
                        .optional()
                        .describe(
                            'Non-secret env vars, keyed by component id then var name. See get_component_requirements',
                        ),
                })
                .strict(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const input = (args ?? {}) as Record<string, unknown>;

            // Reject, never ignore. A configuration write that silently drops a
            // field leaves the agent believing something is set that is not.
            //
            // In production this branch is UNREACHABLE and that is fine. The
            // schema above is `.strict()`, and `strictifyWriteSchema` in
            // inExtensionMcpServer now applies the same to every write tool, so
            // the SDK rejects an unknown key with `isError: true` before the
            // handler runs (measured against the real SDK 2026-08-24). Kept as
            // the fallback for any registration path that does not pass through
            // that wrapper, and because its message names the accepted fields
            // where the SDK's names only the offending one. Its unit test calls
            // this handler directly, so it exercises the contract rather than
            // the live path.
            const unknown = Object.keys(input).filter(
                (k) => !(ACCEPTED as readonly string[]).includes(k),
            );
            if (unknown.length) {
                return asText({
                    error: `Unknown field(s): ${unknown.join(', ')}. Accepted: ${ACCEPTED.join(', ')}.`,
                });
            }
            if (Object.keys(input).length === 0) {
                return asText({
                    error: `Nothing to apply. Pass one or more of: ${ACCEPTED.join(', ')}.`,
                });
            }

            const ctx = ctxFactory();
            const project = await ctx.stateManager.getCurrentProject();
            if (!project) {
                return asText({
                    error: 'No current project. Use list_projects and select one first.',
                });
            }

            // Secrets are refused BEFORE anything is applied, so a payload mixing
            // a secret with valid fields does not half-apply.
            const secrets = secretKeys();
            const offered = Object.values(
                (input.env ?? {}) as Record<string, Record<string, unknown>>,
            )
                .flatMap((vars) => Object.keys(vars ?? {}))
                .filter((key) => secrets.has(key));
            if (offered.length) {
                return asText(
                    needsUser({
                        reason: 'secret-entry',
                        what: `Enter ${offered.join(', ')} in Demo Builder`,
                        where: { command: 'demoBuilder.configureProject' },
                        tellUser:
                            `${offered.join(', ')} ${offered.length === 1 ? 'is a secret' : 'are secrets'} and must not be sent through the agent. ` +
                            'Open Configure Project in Demo Builder and enter the value there; nothing else in this call was applied.',
                        resumeWith: 'get_project_status',
                    }),
                );
            }

            const change = settingsChangeFrom(project, input);
            if ('error' in change) return asText(change);
            const applied = { ...recordChoices(project, input), ...change.applied };

            // Only a call that changes settings is staged: one that records a
            // datapack, addons or block libraries rewrites nothing it did not touch.
            const reached = Object.keys(change.changes).length
                ? await applySettingsChange(ctx, project, change)
                : undefined;

            await ctx.stateManager.saveProject(project);
            const envNotWritten = reached ? await regenerateEnvFiles(ctx, project) : undefined;

            const meshMarkedStale = reached?.mesh.changedEnvVars ?? [];
            const storefrontMarkedStale = reached?.storefrontVars ?? [];
            return asText({
                applied,
                stillUnset: stillUnset(project),
                ...(meshMarkedStale.length ? { meshMarkedStale } : {}),
                ...(storefrontMarkedStale.length ? { storefrontMarkedStale } : {}),
                ...nextSteps(meshMarkedStale.length > 0, storefrontMarkedStale),
                ...(envNotWritten ? { envFilesNotWritten: envNotWritten } : {}),
            });
        },
    );
}
