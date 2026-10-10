/**
 * The rule that picks a Node from declared ranges (PR-1a): the release-time answer for
 * everything Demo Builder ships (`npm run node:resolve`) and the runtime answer for a
 * custom integration that declares its own range. Pure: no network, no disk.
 *
 * @module core/shell/nodeRangeRule
 */

import * as semver from 'semver';

/** `engines.node` from a package.json's text, or undefined when it declares none. */
export function engineRangeOf(packageJsonText: string): string | undefined {
    try {
        const range: unknown = JSON.parse(packageJsonText)?.engines?.node;
        return typeof range === 'string' && range.trim() ? range : undefined;
    } catch {
        return undefined;
    }
}

/**
 * A `.nvmrc` / `.node-version` pin (`v22.11.0`, `22`) as a range, or undefined for one
 * that is not a version (`lts/*`, `node`).
 */
export function pinAsRange(pin: string | undefined): string | undefined {
    const text = pin?.trim().replace(/^v/, '');
    return text && semver.validRange(text) ? text : undefined;
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
 * The Node a custom integration runs on (PR-1a step 8): Demo Builder's
 * own if the repo's range accepts it; else a Node already in Demo Builder's Node folder that
 * it accepts (lowest first); else the lowest release it accepts (`chooseNode`). A repo
 * with no range takes Demo Builder's. A range nothing satisfies is refused, named.
 */
export function nodeForRepoRange(
    range: string | undefined,
    shared: string,
    folderMajors: string[],
    releases: NodeRelease[],
): RepoNodeChoice {
    if (!range || majorFits(shared, range, releases)) return { ok: true, major: shared };
    const inFolder = [...folderMajors]
        .sort((a, b) => Number(a) - Number(b))
        .find((major) => majorFits(major, range, releases));
    if (inFolder) return { ok: true, major: inFolder };
    const choice = chooseNode([{ id: 'repo', range }], releases);
    return choice.ok ? choice : { ok: false, range };
}
