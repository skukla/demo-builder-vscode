/**
 * The register of Node versions (PR-1a): the one place that answers which Node a
 * thing runs on, and which Nodes a project needs.
 *
 * Every catalog declares its own version in one field, `nodeVersion`:
 *
 * | Catalog | Where |
 * |---|---|
 * | `components.json` | `<section>.<id>.configuration.nodeVersion` (the Adobe CLI is `infrastructure.adobe-cli`) |
 * | `app-builder-components.json` | `appBuilderComponents[].nodeVersion` |
 * | `ai-defaults.json` | top-level `nodeVersion` (the AI tools, AI-13) |
 *
 * One rule decides the rest: a thing that declares nothing runs on the Adobe CLI's
 * Node, which is the extension's one default. So a mesh, which runs through `aio`,
 * declares nothing and follows the CLI; there are no fallback literals anywhere
 * else. Before this, versions were declared in four files, copied into two
 * constants, and backed by five hardcoded "20"s, and the two lookups meant to read
 * the mesh's never found the file (they asked VS Code for the extension under a
 * name it does not have), so mesh always ran on the fallback.
 *
 * Reads the bundled JSON imports, never the extension folder on disk. Pure.
 *
 * @module features/components/services/nodeRequirements
 */

import aiDefaultsConfig from '@/features/project-creation/config/ai-defaults.json';
import componentsConfig from '@/features/components/config/components.json';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { aiDefaultsEntryApplies } from '@/features/project-creation/services/aiBundle/aiToolingGate';
import type { AiDefaults } from '@/types/aiDefaults';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';

/** The Adobe CLI's id in `components.json` `infrastructure`. */
export const ADOBE_CLI_ID = 'adobe-cli';

/** The `components.json` sections that hold installable or runnable things. */
const SECTIONS = [
    'infrastructure',
    'frontends',
    'backends',
    'mesh',
    'dependencies',
    'integrations',
    'addons',
    'tools',
] as const;

type ComponentSection = Record<string, { configuration?: { nodeVersion?: string; [key: string]: unknown } }>;

const sections: Partial<Record<(typeof SECTIONS)[number], ComponentSection>> = componentsConfig;
// The same single assertion every reader of ai-defaults.json makes (its `requires` is a union).
const aiDefaults = aiDefaultsConfig as AiDefaults;

/** A `components.json` entry's own declaration, or undefined when it declares none. */
function declaredComponentVersion(id: string): string | undefined {
    for (const section of SECTIONS) {
        const entry = sections[section]?.[id];
        if (entry) return entry.configuration?.nodeVersion;
    }
    return undefined;
}

/**
 * The Node the Adobe CLI runs on, for every `aio` call, and the extension's default
 * for anything that declares none (owner, 2026-10-07: one Node for the CLI).
 */
export function adobeCliNodeVersion(): string {
    const declared = declaredComponentVersion(ADOBE_CLI_ID);
    if (!declared) {
        throw new Error('components.json declares no Node for the Adobe CLI (infrastructure.adobe-cli)');
    }
    return declared;
}

/**
 * The Node a `components.json` thing (a frontend, backend, mesh, tool...) runs on:
 * its own declaration, else the extension default.
 */
export function nodeForComponent(id: string): string {
    return declaredComponentVersion(id) ?? adobeCliNodeVersion();
}

/** The Node an App Builder catalog entry (integration or system) installs and deploys on. */
export function nodeForAppBuilderEntry(entry: Pick<AppBuilderComponentCatalogEntry, 'nodeVersion'>): string {
    return entry.nodeVersion ?? adobeCliNodeVersion();
}

/** The Node the AI tools install, update and run on (AI-13). */
export function aiToolsNodeVersion(): string {
    return aiDefaults.nodeVersion;
}

/** The App Builder entry behind a project's component, by catalog id or recorded `catalogId`. */
function appBuilderEntryOf(id: string, catalogId: string | undefined): AppBuilderComponentCatalogEntry | undefined {
    const catalog = getAppBuilderComponentCatalog();
    return catalog.find((entry) => entry.id === id) ?? catalog.find((entry) => entry.id === catalogId);
}

/**
 * Every Node major this project needs, ascending: its installed components, its App
 * Builder components (an entry the catalog no longer knows runs on the default), the
 * AI tools when any apply, and the Adobe CLI's when anything in it runs through `aio`
 * (a mesh, an App Builder component, or an Adobe project to talk to).
 */
export function nodesFor(project: Project): string[] {
    const majors = new Set<string>();
    for (const id of Object.keys(project.componentInstances ?? {})) {
        majors.add(nodeForComponent(id));
    }
    const appBuilder = project.appBuilderComponents ?? {};
    for (const [id, state] of Object.entries(appBuilder)) {
        const entry = appBuilderEntryOf(id, state.catalogId);
        majors.add(entry ? nodeForAppBuilderEntry(entry) : adobeCliNodeVersion());
    }
    if (aiDefaults.mcpServers.some((server) => aiDefaultsEntryApplies(server, project))) {
        majors.add(aiToolsNodeVersion());
    }
    if (Object.keys(appBuilder).length > 0 || project.adobe) {
        majors.add(adobeCliNodeVersion());
    }
    return [...majors].sort((a, b) => Number(a) - Number(b));
}
