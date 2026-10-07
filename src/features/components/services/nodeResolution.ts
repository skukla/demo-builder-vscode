/**
 * Which Node Demo Builder runs on, worked out from what each component declares
 * (PR-1a, owner 2026-10-07). Demo Builder keeps no Node version of its own: every
 * component it ships already states the Node it accepts in its own `package.json`
 * `engines.node`, and this module says WHERE to read those ranges and HOW to pick one
 * Node from them.
 *
 * Two callers. The release script (`scripts/resolve-node-version.mjs`) reads every
 * source listed here and writes the answer into `node-version.generated.json`; the
 * add door (step 8) applies the same rule to an integration from an SC's own repo.
 * Pure: no network, no disk.
 *
 * @module features/components/services/nodeResolution
 */

import * as semver from 'semver';
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

/** The `components.json` sections that hold installable things (the same list the register reads). */
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

/** `engines.node` from a package.json's text, or undefined when it declares none. */
export function engineRangeOf(packageJsonText: string): string | undefined {
    try {
        const range: unknown = JSON.parse(packageJsonText)?.engines?.node;
        return typeof range === 'string' && range.trim() ? range : undefined;
    } catch {
        return undefined;
    }
}

/** One entry of nodejs.org's release index (`dist/index.json`). */
export interface NodeRelease {
    version: string;
    lts: string | false;
}

export type NodeChoice =
    | { ok: true; major: string }
    | { ok: false; blocking: string[] };

/** The newest release of each major, LTS majors first then the rest, each ascending. */
function candidates(releases: NodeRelease[]): NodeRelease[] {
    const newest = new Map<number, NodeRelease>();
    for (const release of releases) {
        const major = semver.major(release.version);
        const known = newest.get(major);
        if (!known || semver.gt(release.version, known.version)) newest.set(major, release);
    }
    const byMajor = [...newest.values()].sort((a, b) => semver.compare(a.version, b.version));
    return [...byMajor.filter((r) => r.lts), ...byMajor.filter((r) => !r.lts)];
}

/**
 * The one Node every range accepts: the LOWEST long-term-support major whose newest
 * release satisfies them all; if no LTS major does, the lowest regular major that
 * does (a component needing a Node newer than any LTS yet). Lowest, not newest, so
 * the answer rises only when a range's floor rises. A source with no range accepts
 * anything. When nothing fits, `blocking` names the ranges the best candidate fails.
 */
export function chooseNode(ranges: Array<{ id: string; range?: string }>, releases: NodeRelease[]): NodeChoice {
    const declared = ranges.filter((r): r is { id: string; range: string } => Boolean(r.range));
    const pool = candidates(releases);
    const fit = pool.find((release) => declared.every((r) => semver.satisfies(release.version, r.range)));
    if (fit) return { ok: true, major: String(semver.major(fit.version)) };

    const best = pool
        .filter((release) => release.lts)
        .reduce<NodeRelease | undefined>((top, release) => {
            const count = (r: NodeRelease | undefined) =>
                r ? declared.filter((d) => semver.satisfies(r.version, d.range)).length : -1;
            return count(release) > count(top) ? release : top;
        }, undefined);
    return {
        ok: false,
        blocking: declared
            .filter((r) => !best || !semver.satisfies(best.version, r.range))
            .map((r) => `${r.id} (${r.range})`),
    };
}

/** `fnm list-remote` output as releases: a line is `v24.21.0 (Krypton)`, the codename marking LTS. */
export function parseFnmReleases(stdout: string): NodeRelease[] {
    return stdout
        .split('\n')
        .map((line) => /^\s*(v\d+\.\d+\.\d+)(?:\s+\(([^)]+)\))?/.exec(line))
        .filter((match): match is RegExpExecArray => match !== null)
        .map((match) => ({ version: match[1], lts: match[2] ?? false }));
}

/**
 * The newest release of `major` satisfies `range`. With no release list for that major
 * (offline), whether the range admits any of it at all.
 */
function majorFits(major: string, range: string, releases: NodeRelease[]): boolean {
    const newest = releases
        .filter((release) => String(semver.major(release.version)) === major)
        .sort((a, b) => semver.rcompare(a.version, b.version))[0];
    return newest ? semver.satisfies(newest.version, range) : semver.intersects(range, `${major}.x`);
}

export type RepoNodeChoice = { ok: true; major: string } | { ok: false; range: string };

/**
 * The Node an integration from an SC's own repo runs on (PR-1a step 8): Demo Builder's
 * own if the repo's range accepts it; else a Node already in Demo Builder's folder that
 * it accepts (lowest first); else the lowest release it accepts (`chooseNode`). A repo
 * with no range takes Demo Builder's. A range nothing satisfies is refused, named.
 */
export function nodeForRepoRange(
    range: string | undefined,
    shared: string,
    storeMajors: string[],
    releases: NodeRelease[],
): RepoNodeChoice {
    if (!range || majorFits(shared, range, releases)) return { ok: true, major: shared };
    const inStore = [...storeMajors]
        .sort((a, b) => Number(a) - Number(b))
        .find((major) => majorFits(major, range, releases));
    if (inStore) return { ok: true, major: inStore };
    const choice = chooseNode([{ id: 'repo', range }], releases);
    return choice.ok ? choice : { ok: false, range };
}
