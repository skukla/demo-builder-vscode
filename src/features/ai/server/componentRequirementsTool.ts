/**
 * `get_component_requirements` — what one component actually needs.
 *
 * `list_components` returns `{id, name}`, so an agent can name a component but
 * not find out which env vars, services or other components it requires. This
 * closes that, and is the natural second call after `list_components`.
 *
 * ## Why it reads the config directly instead of the components handler
 *
 * The first version was a descriptor row over `get-components-data`, narrowing
 * the handler's catalog in `shape`. It worked and it was wrong: that handler is
 * backed by `ComponentRegistryManager`, which has **no addons concept**, while
 * `list_components` reads `components.json` directly and advertises an `addons`
 * section. So `list_components` offered `adobe-commerce-aco` and this tool
 * answered `No component "adobe-commerce-aco"` — a dead end on the primary path,
 * found by probing the live server (2026-08-17).
 *
 * Reading the same file through the same `COMPONENT_SECTIONS` constant its
 * sibling uses makes the two consistent BY CONSTRUCTION. A section added to one
 * is added to both; there is no second list to forget.
 *
 * Raw config, deliberately: `enhanceComponent`'s transform exists to feed wizard
 * cards, and `configuration` — the part that answers this question — passes
 * through it unchanged anyway.
 */

import { z } from 'zod';
import { COMPONENT_SECTIONS } from './discoveryTools';
import componentsConfig from '@/features/components/config/components.json';

/** A component as `components.json` stores it — keyed by id, with no `id` field. */
interface RawComponent {
    name?: string;
    description?: string;
    configuration?: Record<string, unknown>;
    dependencies?: { required?: string[]; optional?: string[] };
}

/** An env-var definition from the top-level `envVars` registry. */
interface EnvVarDef {
    label?: string;
    type?: string;
    description?: string;
}

const CONFIG = componentsConfig as unknown as Record<string, unknown>;

function stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function sectionEntries(section: string): Array<[string, RawComponent]> {
    const entries = CONFIG[section];
    if (!entries || typeof entries !== 'object') return [];
    return Object.entries(entries as Record<string, RawComponent>);
}

/**
 * Resolve env-var KEYS to their definitions.
 *
 * The keys alone are not an answer — `ACCS_GRAPHQL_ENDPOINT` does not tell an
 * agent what to put in it, and the registry has a label, type and description for
 * each. Attaching them here saves a second call whose only purpose is to find out
 * what the first call's output meant.
 *
 * Only for the keys asked about: the registry is 30 entries and 9,236 of the
 * catalog's 14,931 bytes (measured 2026-08-17), so passing it whole would make a
 * one-component question cost the catalog.
 */
function describeEnvVars(keys: string[]): unknown[] {
    const registry = (CONFIG.envVars ?? {}) as Record<string, EnvVarDef>;
    return keys.map((key) => {
        const def = registry[key];
        // A key with no definition is kept as a bare key. Dropping it would
        // under-report what the component needs, which is worse than terse.
        if (!def) return { key };
        return { key, label: def.label, type: def.type, description: def.description };
    });
}

export function registerComponentRequirementsTool(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
): void {
    server.registerTool(
        'get_component_requirements',
        {
            description:
                'What one component needs: its required/optional env vars (with what each one means), required services, and dependencies. list_components only returns ids and names.',
            // ZOD, not raw JSON Schema. The SDK rejects a plain object with
            // "inputSchema must be a Zod schema or raw shape", and that throw
            // happens inside `registerExtraTools` — so it takes down registration
            // for EVERY tool, leaving a server that binds its socket and never
            // answers a handshake. Shipped that way in e26bd01e and found by the
            // probe hanging; no offline check saw it, because the test's fake
            // server ignores the schema argument entirely.
            inputSchema: {
                componentId: z
                    .string()
                    .describe('Component id, e.g. eds-storefront (see list_components)'),
            },
        },
        async (args: { componentId?: string }) => {
            const wanted = String(args?.componentId ?? '');
            const known: string[] = [];

            for (const section of COMPONENT_SECTIONS) {
                for (const [id, def] of sectionEntries(section)) {
                    known.push(id);
                    if (id !== wanted) continue;

                    const config = def.configuration ?? {};
                    return json({
                        id,
                        category: section,
                        name: def.name,
                        description: def.description,
                        requiredEnvVars: describeEnvVars(stringList(config.requiredEnvVars)),
                        optionalEnvVars: describeEnvVars(stringList(config.optionalEnvVars)),
                        requiredServices: stringList(config.requiredServices),
                        dependencies: def.dependencies,
                    });
                }
            }

            // The known ids ARE the fix for this error, and the catalog is small
            // enough to list them, so a miss costs no extra call.
            return json({ error: `No component "${wanted}".`, known: known.sort() });
        },
    );
}

function json(body: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(body) }] };
}
