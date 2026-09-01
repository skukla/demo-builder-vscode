/**
 * `configure_project` — the one tool that fills in what `create_project` leaves empty.
 *
 * `create_project` produces a structurally complete but UNCONFIGURED project: it
 * hardcodes `componentConfigs: {}`, `selectedAddons: []`,
 * `selectedBlockLibraries: []`, no datapack and no store scope. Until now the
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
 * ## What this deliberately does NOT do
 *
 * It is not a re-implementation of the Configure screen's `save-configuration`
 * (`configure.ts:234`). That closure also renames the project, splits secrets
 * into SecretStorage, runs mesh-change detection under an org context, and
 * prompts for redeployment — behaviour that belongs to a UI with a person in
 * front of it. This writes project fields and stops.
 *
 * Two consequences worth stating plainly:
 *
 *   - SECRETS ARE REFUSED, not accepted and stored. A credential in a tool
 *     argument lands in the transcript and in whatever logs the agent keeps.
 *     Keys whose registry `type` is `password` return a `needsUser` handoff.
 *   - Mesh staleness is MARKED, not detected. The Configure screen fetches the
 *     DEPLOYED mesh config over the `aio` CLI to diff against, which needs an
 *     org context and a network round trip. This compares against the STORED
 *     config instead: offline, and wrong only in the safe direction — it can
 *     over-report staleness (deploy, edit a value back, still marked stale),
 *     never under-report real drift. It writes the same `'stale'` the dashboard
 *     writes, so `deriveMeshStatus` renders it as `config-changed` on both
 *     surfaces without either knowing this tool exists.
 */

import { z } from 'zod';
import { needsUser } from './handoff';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import type { StateManager } from '@/core/state/stateManager';
import componentsConfig from '@/features/components/config/components.json';
import type { Project } from '@/types/base';
import { getMeshComponentInstance } from '@/types/typeGuards';

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

/** The three codes that locate a storefront in a Commerce hierarchy. */
const SCOPE_KEYS = ['website', 'store', 'storeView'] as const;

/** Env-var name each scope code is stored under, per backend family. */
const SCOPE_ENV: Record<(typeof SCOPE_KEYS)[number], string> = {
    website: 'ACCS_WEBSITE_CODE',
    store: 'ACCS_STORE_CODE',
    storeView: 'ACCS_STORE_VIEW_CODE',
};

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
    if (!backendConfig || !SCOPE_KEYS.every((k) => backendConfig[SCOPE_ENV[k]])) {
        unset.push('storeScope');
    }
    return unset;
}

/**
 * Apply the payload to `project` in place.
 *
 * Extracted from the tool body purely to keep it under the complexity ceiling;
 * it is one cohesive step (write the fields, record what actually changed) and
 * splitting it further would scatter the change-tracking that mesh staleness
 * depends on.
 *
 * @returns the applied diff, plus the env keys whose VALUE actually changed, or
 *          an error when the payload cannot be applied at all.
 */
function applyToProject(
    project: Project,
    input: Record<string, unknown>,
): { applied: Applied; changedKeys: Set<string> } | { error: string } {
    const applied: Applied = {};
    // Rewriting a key with the value it already had is not a change, and must
    // not flag the mesh.
    const changedKeys = new Set<string>();
    const noteChange = (componentId: string, key: string, value: unknown) => {
        if (project.componentConfigs?.[componentId]?.[key] !== value) changedKeys.add(key);
    };

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

    // Store scope and env both land in componentConfigs, keyed by component.
    const backend = project.componentSelections?.backend;
    if (input.storeScope) {
        if (!backend) {
            return {
                error: 'Cannot set store scope: this project has no backend component selected.',
            };
        }
        const scope = input.storeScope as Record<string, string>;
        project.componentConfigs = project.componentConfigs ?? {};
        const target = { ...(project.componentConfigs[backend] ?? {}) };
        for (const key of SCOPE_KEYS) {
            noteChange(backend, SCOPE_ENV[key], scope[key]);
            target[SCOPE_ENV[key]] = scope[key];
        }
        project.componentConfigs[backend] = target;
        applied.storeScope = scope;
    }

    if (input.env) {
        project.componentConfigs = project.componentConfigs ?? {};
        const envApplied: Record<string, string[]> = {};
        for (const [componentId, vars] of Object.entries(
            input.env as Record<string, Record<string, string | boolean | number>>,
        )) {
            for (const [key, value] of Object.entries(vars ?? {})) {
                noteChange(componentId, key, value);
            }
            project.componentConfigs[componentId] = {
                ...(project.componentConfigs[componentId] ?? {}),
                ...vars,
            };
            envApplied[componentId] = Object.keys(vars ?? {});
        }
        // KEYS, not values. Echoing values back doubles a config payload and
        // puts anything the user typed into the transcript twice.
        applied.env = envApplied;
    }

    return { applied, changedKeys };
}

export function registerConfigureProjectTool(
    server: McpToolServer,
    stateManager: StateManager,
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
                        .object({ name: z.string(), version: z.string() })
                        .optional()
                        .describe('Datapack that seeds this project (recorded, not imported)'),
                    addons: z
                        .array(z.string())
                        .optional()
                        .describe('Addon component ids, e.g. adobe-commerce-aco'),
                    blockLibraries: z
                        .array(z.string())
                        .optional()
                        .describe('Block library ids to enable'),
                    storeScope: z
                        .object({
                            website: z.string(),
                            store: z.string(),
                            storeView: z.string(),
                        })
                        .optional()
                        .describe(
                            'All THREE codes together, from discover_store_structure. Two of three is a broken scope, not a narrower one',
                        ),
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

            const project = await stateManager.getCurrentProject();
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

            const outcome = applyToProject(project, input);
            if ('error' in outcome) return asText(outcome);
            const { applied, changedKeys } = outcome;

            // MARK the mesh stale when a var it declares a dependency on actually
            // changed. This is a mark, not the Configure screen's detection: that
            // one fetches the DEPLOYED config over the aio CLI to diff against,
            // which needs an org context and a network round trip. Comparing
            // against the STORED config is offline and cannot be wrong in the
            // dangerous direction — it can over-report staleness after a
            // deploy-then-edit-back, never under-report a real drift.
            //
            // 'stale' is the same value the dashboard writes, and `deriveMeshStatus`
            // maps it to 'config-changed' for both surfaces, so get_project_status
            // and the dashboard agree without either knowing about this tool.
            const meshKeys = meshEnvDependencies(project);
            const meshAffecting = [...changedKeys].filter((k) => meshKeys.has(k));
            if (meshAffecting.length) {
                project.meshStatusSummary = 'stale';
            }

            await stateManager.saveProject(project);

            return asText({
                applied,
                stillUnset: stillUnset(project),
                ...(meshAffecting.length
                    ? {
                          meshMarkedStale: meshAffecting.sort(),
                          note: 'The mesh depends on these vars and is now marked config-changed. Call deploy_mesh to redeploy it.',
                      }
                    : {}),
            });
        },
    );
}
