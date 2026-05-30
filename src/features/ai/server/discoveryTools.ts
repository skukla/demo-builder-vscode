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

import componentsConfig from '@/features/components/config/components.json';
import { loadDemoPackages } from '@/features/project-creation/services/demoPackageLoader';
import { loadStacks } from '@/features/project-creation/ui/helpers/brandStackLoader';

/** Component sections worth surfacing to an agent (selectable building blocks). */
const COMPONENT_SECTIONS = ['frontends', 'backends', 'mesh', 'integrations', 'appBuilderApps', 'addons'] as const;

function listComponentSection(section: string): Array<{ id: string; name: string }> {
    const entries = (componentsConfig as Record<string, unknown>)[section];
    if (!entries || typeof entries !== 'object') return [];
    return Object.entries(entries as Record<string, { name?: string }>).map(([id, def]) => ({
        id,
        name: def?.name ?? id,
    }));
}

/**
 * Register the discovery tools on `server`.
 * @param server McpServer (typed `any`; see registerProjectTools docstring).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerDiscoveryTools(server: any): void {
    server.registerTool(
        'list_stacks',
        {
            title: 'List Stacks',
            description: 'List available architecture stacks (frontend+backend) for project creation',
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
            return { content: [{ type: 'text' as const, text: JSON.stringify(lean) }] };
        },
    );

    server.registerTool(
        'list_demo_packages',
        {
            title: 'List Demo Packages',
            description: 'List demo packages (brands) and the stacks each supports, for project creation',
            inputSchema: {},
        },
        async () => {
            const packages = await loadDemoPackages();
            const lean = packages.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                // The keys of the storefronts map ARE the valid stacks for this package.
                availableStacks: Object.keys(p.storefronts ?? {}),
            }));
            return { content: [{ type: 'text' as const, text: JSON.stringify(lean) }] };
        },
    );

    server.registerTool(
        'list_components',
        {
            title: 'List Components',
            description: 'List available project components grouped by type (frontends, backends, mesh, etc.)',
            inputSchema: {},
        },
        async () => {
            const lean = Object.fromEntries(
                COMPONENT_SECTIONS.map((section) => [section, listComponentSection(section)]),
            );
            return { content: [{ type: 'text' as const, text: JSON.stringify(lean) }] };
        },
    );
}
