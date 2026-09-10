/**
 * Discovery tools (Phase 3a).
 *
 * Read-only tools that expose the creation choice space so an agent can pick
 * valid values (and so `create_project` can validate against them). They call
 * the existing config loaders directly — no handler map, no vscode — and emit
 * compact JSON.
 *
 * Imports config loaders (which read the bundled JSON), so this module is wired
 * in from `extension.ts` like the handler-backed descriptors.
 */

import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import appBuilderCatalog from '@/features/components/config/app-builder-components.json';
import componentsConfig from '@/features/components/config/components.json';
import { getSelectablePackages } from '@/features/components/services/demoPackageLoader';
import { loadStacks } from '@/features/project-creation/ui/helpers/brandStackLoader';

/**
 * Component sections worth surfacing to an agent (selectable building blocks).
 *
 * EXPORTED because `get_component_requirements` must look in exactly the sections
 * `list_components` advertises. They were separate lists once, and the drift was
 * immediate: `list_components` offered `adobe-commerce-aco` from `addons` while
 * the other tool — reading the registry manager, which has no addons concept —
 * answered "No component". An agent following the obvious path hit a dead end on
 * a component the surface had just handed it (found live, 2026-08-17).
 */
export const COMPONENT_SECTIONS = [
    'frontends',
    'backends',
    'mesh',
    'integrations',
    'addons',
] as const;

/** The shape `list_components` reads: section id -> the entries in that section. */
type ComponentRegistry = Record<string, unknown>;

function listComponentSection(
    section: string,
    registry: ComponentRegistry,
): Array<{ id: string; name: string }> {
    const entries = registry[section];
    if (!entries || typeof entries !== 'object') return [];
    return Object.entries(entries as Record<string, { name?: string }>).map(([id, def]) => ({
        id,
        name: def?.name ?? id,
    }));
}

/**
 * Register the discovery tools on `server`.
 * @param server McpServer (typed `any`; see registerProjectTools docstring).
 * @param registry Injectable component registry; defaults to the bundled
 *   components.json. Tests pass a fixture here instead of mocking the JSON leaf
 *   module (the seam-injection standard — see tests/sop/no-config-leaf-mocks).
 */
export function registerDiscoveryTools(
    server: McpToolServer,
    registry: ComponentRegistry = componentsConfig as ComponentRegistry,
): void {
    server.registerTool(
        'list_stacks',
        {
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'List Stacks',
            description:
                'List available architecture stacks (frontend+backend) for project creation',
            inputSchema: {},
        },
        async () => {
            const stacks = await loadStacks();
            const lean = stacks.map((s) => ({
                id: s.id,
                name: s.name,
                frontend: s.frontend,
                backend: s.backend,
                requiresGitHub: s.requiresGitHub ?? false,
                requiresDaLive: s.requiresDaLive ?? false,
            }));
            return asText(lean);
        },
    );

    server.registerTool(
        'list_demo_packages',
        {
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'List Demo Packages',
            description:
                'List demo packages (brands) and the stacks each supports, for project creation',
            inputSchema: {},
        },
        async () => {
            const packages = await getSelectablePackages();
            const lean = packages.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                // The keys of the storefronts map ARE the valid stacks for this package.
                availableStacks: Object.keys(p.storefronts ?? {}),
            }));
            return asText(lean);
        },
    );

    server.registerTool(
        'list_components',
        {
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'List Components',
            description:
                'List available project components grouped by type (frontends, backends, mesh, ' +
                'appBuilderIntegrations for add_integration, etc.)',
            inputSchema: {},
        },
        async () => {
            const lean: Record<string, unknown> = Object.fromEntries(
                COMPONENT_SECTIONS.map((section) => [
                    section,
                    listComponentSection(section, registry),
                ]),
            );
            // The App Builder catalog — where add_integration ids come from. Its
            // own description sends agents HERE for ids, and until 2026-08-27
            // this listing did not carry them (traced live: the documented
            // discovery route dead-ended).
            lean.appBuilderIntegrations = appBuilderCatalog.appBuilderComponents.map((entry) => ({
                id: entry.id,
                name: entry.name,
            }));
            return asText(lean);
        },
    );
}
