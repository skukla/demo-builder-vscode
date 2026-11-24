/**
 * Reads block code from GitHub, read-only, at the ref Demo Builder installs it from, with every
 * file cached on disk under the system temp folder.
 *
 * - The B2B template: the commit the patches repo's newest release names in its last-known-good
 *   file (the package's `codePatchSource.lkgFile`), as `templateCommitResolver.ts` reads it.
 * - A block library: its newest release when its repository ships by release
 *   (`RELEASED_REPOS`, as `refOfSource` decides), else its branch.
 *
 * Every ref is turned into a commit SHA first, so a cached file can never be stale. A token in
 * GITHUB_TOKEN or GH_TOKEN, or from `gh auth token`, is used when present; anonymous otherwise.
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const CACHE = join(tmpdir(), 'demo-builder-block-examples');
const B2B_TEMPLATE = 'adobe-commerce/boilerplate-b2b-template';

function token() {
    const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (fromEnv) return fromEnv;
    try {
        return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return '';
    }
}

/** A GitHub reader with the given request timeout (ms). */
export function githubReader(timeoutMs) {
    const auth = token();
    const headers = auth ? { Authorization: `Bearer ${auth}` } : {};
    const missing = new Set();

    async function api(path) {
        const response = await fetch(`${API}${path}`, {
            headers: { ...headers, Accept: 'application/vnd.github+json' },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`GitHub ${path} answered HTTP ${response.status}`);
        return response.json();
    }

    async function commitOf(repo, ref) {
        return (await api(`/repos/${repo}/commits/${encodeURIComponent(ref)}`)).sha;
    }

    async function newestReleaseTag(repo) {
        const releases = await api(`/repos/${repo}/releases?per_page=20`);
        const release = releases.find((entry) => !entry.draft);
        if (!release) throw new Error(`${repo} has no release`);
        return release.tag_name;
    }

    /** A file's text at a commit, or undefined when the repository has no such file. */
    async function file(repo, sha, path) {
        const cached = join(CACHE, repo, sha, path);
        if (existsSync(cached)) return readFileSync(cached, 'utf8');
        const key = `${repo}@${sha}:${path}`;
        if (missing.has(key)) return undefined;
        const response = await fetch(`${RAW}/${repo}/${sha}/${path}`, {
            headers, signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status === 404) {
            missing.add(key);
            return undefined;
        }
        if (!response.ok) throw new Error(`${RAW}/${repo}/${sha}/${path} answered HTTP ${response.status}`);
        const body = Buffer.from(await response.arrayBuffer());
        mkdirSync(dirname(cached), { recursive: true });
        writeFileSync(cached, body);
        return body.toString('utf8');
    }

    /** The same file as bytes (images, fonts), or undefined when absent. */
    async function bytes(repo, sha, path) {
        const text = await file(repo, sha, path);
        return text === undefined ? undefined : readFileSync(join(CACHE, repo, sha, path));
    }

    return { api, commitOf, newestReleaseTag, file, bytes };
}

/** The B2B template's repository and the commit storefronts are built from. */
export async function templateCode(github, demoPackages) {
    const storefront = demoPackages.packages
        .flatMap((pkg) => Object.values(pkg.storefronts ?? {}))
        .find((entry) => `${entry.templateOwner}/${entry.templateRepo}` === B2B_TEMPLATE
            && entry.codePatchSource?.lkgFile);
    if (!storefront) throw new Error(`No package names ${B2B_TEMPLATE} with a last-known-good file`);
    const { owner, repo, lkgFile } = storefront.codePatchSource;
    const patches = `${owner}/${repo}`;
    const tag = await github.newestReleaseTag(patches);
    const patchesSha = await github.commitOf(patches, tag);
    const lkg = (await github.file(patches, patchesSha, lkgFile))?.trim();
    if (!lkg || !/^[0-9a-f]{40}$/.test(lkg)) throw new Error(`${patches}@${tag}:${lkgFile} holds no commit`);
    return { repo: B2B_TEMPLATE, ref: lkg, sha: lkg, how: `${patches} ${tag} ${lkgFile}` };
}

/** A block library's repository and the commit its install reads. */
export async function libraryCode(github, library, releasedRepos) {
    const repo = `${library.source.owner}/${library.source.repo}`;
    const ref = releasedRepos.includes(repo)
        ? await github.newestReleaseTag(repo)
        : library.source.branch;
    return { repo, ref, sha: await github.commitOf(repo, ref), how: releasedRepos.includes(repo) ? 'newest release' : 'branch' };
}
