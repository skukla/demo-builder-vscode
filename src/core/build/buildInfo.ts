/**
 * Build stamp — lets the RUNNING extension say which checkout it was built from.
 *
 * On 2026-08-12 two complete `dist/` trees existed on one machine (a main
 * checkout and a worktree). `launch.json` passes
 * `--extensionDevelopmentPath=${workspaceFolder}`, so F5 silently binds the
 * Extension Dev Host to whichever WINDOW had focus — and every change built into
 * the other tree was invisible. Nothing anywhere named the loaded build: not the
 * UI, not the logs, not Diagnostics. Two reload-and-look cycles went by, and the
 * first diagnosis blamed a second watcher that did not exist.
 *
 * `esbuild.config.js` writes `dist/build-info.json` on every build; this module
 * reads it back. Everything here degrades to `undefined` rather than throwing:
 * a diagnostic that can break activation is worse than no diagnostic.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';

export interface BuildInfo {
    /** Absolute path of the checkout this bundle was built from. */
    checkoutPath: string;
    /** Git branch at build time. */
    branch: string;
    /** Short commit SHA at build time. */
    commit: string;
    /** True when the working tree had uncommitted changes. */
    dirty: boolean;
    /** ISO timestamp of the build. */
    builtAt: string;
}

/** Path of the stamp, relative to the extension root. */
export const BUILD_INFO_RELATIVE = path.join('dist', 'build-info.json');

function isBuildInfo(value: unknown): value is BuildInfo {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    // Branch without commit would report an identity nothing can be checked
    // against, which is the failure this module exists to prevent.
    return (
        typeof v.checkoutPath === 'string' &&
        typeof v.branch === 'string' &&
        typeof v.commit === 'string' &&
        typeof v.builtAt === 'string'
    );
}

/**
 * Read the stamp written beside the bundles.
 *
 * @param extensionPath Extension root (`context.extensionPath`).
 * @returns The stamp, or undefined when absent, unreadable or malformed.
 */
export async function readBuildInfo(extensionPath: string): Promise<BuildInfo | undefined> {
    try {
        const raw = await fsPromises.readFile(
            path.join(extensionPath, BUILD_INFO_RELATIVE),
            'utf-8',
        );
        const parsed: unknown = JSON.parse(raw);
        if (!isBuildInfo(parsed)) return undefined;
        return { ...parsed, dirty: parsed.dirty === true };
    } catch {
        return undefined;
    }
}

/** One line naming the build: identity first, then the checkout that produced it. */
export function describeBuildInfo(info: BuildInfo): string {
    const commit = info.dirty ? `${info.commit}+` : info.commit;
    return `${info.branch}@${commit} built ${info.builtAt} from ${info.checkoutPath}`;
}

/**
 * Whether a source file is newer than the build — i.e. `dist/` is behind `src/`.
 *
 * Unknown source mtime reports NOT stale on purpose: a false alarm sends someone
 * rebuilding to chase a problem that lives somewhere else.
 */
export function isDistStale(info: BuildInfo, newestSourceMtimeMs: number | undefined): boolean {
    if (newestSourceMtimeMs === undefined) return false;
    return newestSourceMtimeMs > Date.parse(info.builtAt);
}

/**
 * Newest mtime of any file under `dir`, or undefined when it cannot be read.
 *
 * Called on demand (status-bar click, Diagnostics) rather than at activation —
 * walking `src/` is not worth doing on every window load.
 */
export async function newestMtimeUnder(dir: string): Promise<number | undefined> {
    let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
    try {
        entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
        return undefined;
    }

    let newest: number | undefined;
    for (const entry of entries) {
        const child = path.join(dir, entry.name);
        let candidate: number | undefined;
        if (entry.isDirectory()) {
            candidate = await newestMtimeUnder(child);
        } else if (entry.isFile()) {
            try {
                candidate = (await fsPromises.stat(child)).mtimeMs;
            } catch {
                candidate = undefined;
            }
        }
        if (candidate !== undefined && (newest === undefined || candidate > newest)) {
            newest = candidate;
        }
    }
    return newest;
}
