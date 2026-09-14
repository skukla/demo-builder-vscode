/**
 * Reading a storefront that arrived as a zip file (shareable-demo step 10):
 * unpack it in memory, drop what a repository would not carry, and say whether
 * what is left is an Edge Delivery storefront, by the same rule the probe
 * applies to a repository.
 *
 * The 2026-09-12 stand-in was exactly this case: a colleague's storefront as a
 * 47 MB zip with 9,944 files, no `.git`, a `.npm-cache/` folder that must not be
 * pushed, and its own `.gitignore`. Kept, it was 3,475 files and 9.9 MB.
 *
 * @module features/eds/services/storefront/zipStorefrontImport
 */

import AdmZip from 'adm-zip';
import { BUNDLE_STOREFRONT_DIR } from '../demoPackage/demoBundle';
import { CANONICAL_STOREFRONT_FILES, classifyRepoForStorefront, type RepoReadiness } from './repoStorefrontReadiness';
import { normalizeRepositoryName } from '@/core/validation/normalizers';
import type { Logger } from '@/types/logger';

/** Dropped whatever the zip's own ignore file says: never part of a storefront's code. */
const ALWAYS_DROPPED = ['.git/', 'node_modules/', '.npm-cache/', '.DS_Store', '.env'];

export interface ZipStorefront {
    /** Repository-relative path → bytes, the single root folder stripped. */
    files: Map<string, Buffer>;
    /** The zip's root folder name, when it had one (the repository name's default). */
    rootName?: string;
    /** How many entries were dropped as ignored or never-committed. */
    dropped: number;
}

/**
 * One `.gitignore` line as a test over repository-relative paths. Covers what
 * storefront ignore files actually use: a name (`node_modules`, `*.bak`), a
 * directory (`logs/`, `coverage/*`), and a rooted path with globs
 * (`scripts/__dropins__/**\/*.map`). Negations (`!`) are not honoured: a file
 * the zip author un-ignored is rare, and dropping it is the safe direction.
 */
function ignoreRule(line: string): ((path: string) => boolean) | undefined {
    const rule = line.trim();
    if (!rule || rule.startsWith('#') || rule.startsWith('!')) return undefined;
    const dirOnly = /\/\*?$/.test(rule);
    const body = rule.replace(/\/\*?$/, '').replace(/^\//, '');
    if (!body) return undefined;
    // A slash inside the pattern roots it at the repository; a bare name matches
    // any path component (git's own rule).
    const rooted = body.includes('/');
    const regex = new RegExp(
        '^' +
            body
                .split('**')
                .map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
                .join('.*') +
            '$',
    );
    return (path: string): boolean => {
        const segments = path.split('/');
        const directories = segments.slice(0, -1);
        if (!rooted) {
            return (dirOnly ? directories : segments).some((segment) => regex.test(segment));
        }
        const prefixes = directories.map((_, i) => segments.slice(0, i + 1).join('/'));
        return (dirOnly ? prefixes : [path, ...prefixes]).some((candidate) => regex.test(candidate));
    };
}

function alwaysDropped(path: string): boolean {
    return ALWAYS_DROPPED.some((rule) =>
        rule.endsWith('/') ? path.startsWith(rule) || path.includes(`/${rule}`) : path === rule || path.endsWith(`/${rule}`),
    );
}

/**
 * Unpack a zip into repository-relative files.
 *
 * @param zipPath - The zip file on disk
 * @returns The files a repository would hold, and what was dropped
 */
export function readStorefrontZip(zipPath: string): ZipStorefront {
    const entries = new AdmZip(zipPath).getEntries().filter((entry) => !entry.isDirectory);
    const firstSegments = new Set(entries.map((entry) => entry.entryName.split('/')[0]));
    const rootName = firstSegments.size === 1 && entries.every((entry) => entry.entryName.includes('/')) ? [...firstSegments][0] : undefined;
    const strip = rootName ? rootName.length + 1 : 0;
    const relative = entries.map((entry) => ({ path: entry.entryName.slice(strip), entry }));

    const ignoreLines = relative.find((file) => file.path === '.gitignore')?.entry.getData().toString('utf-8').split('\n') ?? [];
    const rules = ignoreLines.map(ignoreRule).filter((rule): rule is (path: string) => boolean => rule !== undefined);

    const files = new Map<string, Buffer>();
    let dropped = 0;
    for (const { path, entry } of relative) {
        if (!path || alwaysDropped(path) || rules.some((rule) => rule(path))) {
            dropped += 1;
            continue;
        }
        files.set(path, entry.getData());
    }
    return { files: storefrontOfBundle(files), rootName, dropped };
}

/**
 * A demo bundle (what Export writes for "Send a file") keeps the storefront under
 * `storefront/`. When the zip is one, the repository is that folder; a bare
 * storefront zip is left as it is.
 */
function storefrontOfBundle(files: Map<string, Buffer>): Map<string, Buffer> {
    const atTop = CANONICAL_STOREFRONT_FILES.some((name) => files.has(name));
    const inBundle = CANONICAL_STOREFRONT_FILES.some((name) => files.has(`${BUNDLE_STOREFRONT_DIR}${name}`));
    if (atTop || !inBundle) return files;
    const storefront = new Map<string, Buffer>();
    for (const [path, bytes] of files) {
        if (path.startsWith(BUNDLE_STOREFRONT_DIR)) storefront.set(path.slice(BUNDLE_STOREFRONT_DIR.length), bytes);
    }
    return storefront;
}

/** The same verdict the probe gives a repository, over the unpacked files. */
export async function classifyZipStorefront(files: Map<string, Buffer>, logger: Logger): Promise<RepoReadiness> {
    return classifyRepoForStorefront(
        {
            getFileContent: async (_owner: string, _repo: string, path: string) => {
                const bytes = files.get(path);
                return bytes ? { content: bytes.toString('utf-8'), sha: '', path, encoding: 'utf-8' } : null;
            },
        },
        'zip',
        'zip',
        logger,
    );
}

/**
 * A repository name from the zip's root folder: `citisignal-b2b-summit-main` →
 * `citisignal-b2b-summit`; a bundle's `bodea-demo-bundle` → `bodea`.
 */
export function suggestRepoName(rootName: string | undefined, fallback: string): string {
    const base = (rootName ?? fallback).replace(/\.zip$/i, '').replace(/-demo-bundle$/i, '').replace(/-(main|master)$/i, '');
    return normalizeRepositoryName(base) || normalizeRepositoryName(fallback);
}

/** Bytes that cannot travel as inline text in a tree entry go through a blob. */
export function isBinary(bytes: Buffer): boolean {
    const sample = bytes.subarray(0, 8000);
    if (sample.includes(0)) return true;
    return sample.toString('utf-8').includes('�');
}
