/**
 * Which Node Demo Builder runs on, worked out from what each component declares
 * (PR-1a, owner 2026-10-07). Demo Builder keeps no Node version of its own: every
 * component it ships already states the Node it accepts in its own `package.json`
 * `engines.node`, and this module says WHERE to read those ranges and HOW to pick one
 * Node from them.
 *
 * Release-time only: the release script (`scripts/resolve-node-version.mjs`) reads
 * every source listed here and writes the answer into `node-version.generated.json`,
 * and the house check pins that the file covers exactly these sources. The rule that
 * picks the Node is `core/shell/nodeRangeRule.ts`. Pure: no network, no disk.
 *
 * @module features/components/services/nodeResolution
 */

import appBuilderCatalog from '@/features/components/config/app-builder-components.json';
import componentsConfig from '@/features/components/config/components.json';
import { getAllStorefronts, getStackById } from '@/features/components/services/demoPackageLoader';
import prerequisitesConfig from '@/features/prerequisites/config/prerequisites.json';
import aiDefaultsConfig from '@/features/project-creation/config/ai-defaults.json';

/** One place a Node range is read from: a GitHub repo at the ref Demo Builder installs, or an npm package. */
export interface NodeSource {
    /** What it is, for a person reading the generated file. */
    id: string;
    from: 'github' | 'npm';
    /** `owner/repo@ref` for GitHub; `package@range` for npm. */
    ref: string;
}

/** A source left out on purpose, with the reason the generated file prints. */
export interface ExcludedNodeSource {
    id: string;
    reason: string;
}

/**
 * Sources read on purpose by nothing. Each names why, and goes when the reason does.
 */
const EXCLUDED: Record<string, string> = {
    'commerce-demo-ingestion':
        'Private repo, unreadable; nothing calls the tool today, and DI-4 decides whether it stays',
};

/** The parts of a `components.json` git source this reads. */
interface GitSource {
    url?: string;
    branch?: string;
    gitOptions?: { tag?: string; branch?: string; [key: string]: unknown };
    [key: string]: unknown;
}

type CatalogEntry = { source?: GitSource | null; [key: string]: unknown };

/** The `components.json` sections that hold installable things. */
const SECTIONS = ['infrastructure', 'frontends', 'backends', 'mesh', 'dependencies', 'integrations', 'addons', 'tools'] as const;

/** `owner/repo` from a GitHub URL, or undefined for anything else. */
function githubRepoOf(url: string | undefined): string | undefined {
    return url?.match(/^https:\/\/github\.com\/([^/]+\/[^/.]+)/)?.[1];
}

/** The ref Demo Builder clones: a tag, else a branch, else the default branch. */
function refOf(source: GitSource): string {
    return source.gitOptions?.tag ?? source.gitOptions?.branch ?? source.branch ?? 'HEAD';
}

function componentSources(): NodeSource[] {
    const sections: Partial<Record<(typeof SECTIONS)[number], Record<string, CatalogEntry>>> = componentsConfig;
    const found: NodeSource[] = [];
    for (const name of SECTIONS) {
        for (const [id, entry] of Object.entries(sections[name] ?? {})) {
            const repo = githubRepoOf(entry?.source?.url);
            if (repo && entry.source && !(id in EXCLUDED)) {
                found.push({ id, from: 'github', ref: `${repo}@${refOf(entry.source)}` });
            }
        }
    }
    return found;
}

function appBuilderSources(): NodeSource[] {
    return appBuilderCatalog.appBuilderComponents.map((entry) => ({
        id: entry.id,
        from: 'github' as const,
        ref: `${entry.source.owner}/${entry.source.repo}@${entry.source.branch ?? 'HEAD'}`,
    }));
}

/** Frontends Demo Builder runs Node for locally (an EDS storefront installs nothing). */
function frontendsRunLocally(): Set<string> {
    const frontends: Record<string, { configuration?: { skipNpmInstall?: boolean; [key: string]: unknown } }> =
        componentsConfig.frontends;
    return new Set(
        Object.entries(frontends)
            .filter(([, entry]) => entry.configuration?.skipNpmInstall !== true)
            .map(([id]) => id),
    );
}

async function storefrontSources(): Promise<NodeSource[]> {
    const local = frontendsRunLocally();
    const found: NodeSource[] = [];
    for (const { packageId, stackId, storefront } of await getAllStorefronts()) {
        const repo = githubRepoOf(storefront.source?.url);
        const frontend = getStackById(stackId)?.frontend;
        if (repo && frontend && local.has(frontend)) {
            // A storefront names a branch, never a tag.
            const ref = storefront.source?.branch ?? 'HEAD';
            found.push({ id: `${packageId}/${stackId}`, from: 'github', ref: `${repo}@${ref}` });
        }
    }
    return found;
}

/** npm packages the prerequisites install: `npm install -g <pkg>` and `aio plugins:install <pkg>`. */
function prerequisitePackages(): NodeSource[] {
    const commands = JSON.stringify(prerequisitesConfig.prerequisites).match(
        /(?:npm install -g|aio plugins:install) (@?[a-z0-9][\w./-]*)/g,
    ) ?? [];
    return commands.map((command) => {
        const pkg = command.split(' ').pop() as string;
        return { id: pkg, from: 'npm' as const, ref: `${pkg}@latest` };
    });
}

function aiToolPackages(): NodeSource[] {
    return aiDefaultsConfig.mcpServers.map((server) => ({
        id: server.package,
        from: 'npm' as const,
        ref: `${server.package}@${server.version}`,
    }));
}

/**
 * Every source whose Node range decides Demo Builder's Node, read from the catalogs
 * themselves so the list cannot drift from what ships. One entry per distinct ref.
 */
export async function listNodeSources(): Promise<NodeSource[]> {
    const all = [
        ...componentSources(),
        ...appBuilderSources(),
        ...(await storefrontSources()),
        ...prerequisitePackages(),
        ...aiToolPackages(),
    ];
    const seen = new Set<string>();
    return all.filter((source) => !seen.has(source.ref) && seen.add(source.ref));
}

/** Sources deliberately not read, with why. */
export function excludedNodeSources(): ExcludedNodeSource[] {
    return Object.entries(EXCLUDED).map(([id, reason]) => ({ id, reason }));
}

// The rule itself runs at runtime too (a custom integration's Node), so it lives in core;
// re-exported here because the release script bundles this module as its one entry.
export { chooseNode, engineRangeOf } from '@/core/shell/nodeRangeRule';
