/**
 * Which Node version runs the Adobe I/O CLI.
 *
 * The catalog names one Node major for `aio` (`infrastructure['adobe-cli'].configuration
 * .nodeVersion` in components.json). That version wins whenever `aio` is installed under it.
 * Only when it is not, and some other version has `aio`, does another version run it — the
 * newest one, so a machine that still carries an old Node does not drift back to it.
 *
 * Before 2026-10-28 the scan took the first directory listed, which in practice was the
 * OLDEST Node with `aio`, and the catalog's version was trusted without checking `aio` was
 * there at all.
 *
 * @module core/shell/aioNodeVersion
 */

import * as fsSync from 'fs';
import * as path from 'path';

/** Where a node manager keeps its versions, and where `aio` sits inside one of them. */
interface NodeManagerLayout {
    basePath: string;
    binSubpath: string;
}

/** What the choice was, and whether it had to leave the catalog's version. */
interface AioNodeChoice {
    version: string | null;
    /** True when the catalog named a version but `aio` was found only under others. */
    fellBack: boolean;
}

/**
 * The Node majors under `layout` that have `aio` installed, newest first.
 *
 * @param layout - The node manager's version directory and its `aio` path
 * @returns Majors as strings (e.g. `['24', '20']`), empty when none or unreadable
 */
export function majorsWithAio(layout: NodeManagerLayout): string[] {
    if (!fsSync.existsSync(layout.basePath)) return [];
    try {
        const majors = fsSync.readdirSync(layout.basePath)
            .filter((dir) => fsSync.existsSync(path.join(layout.basePath, dir, layout.binSubpath)))
            .map((dir) => /v?(\d+)/.exec(dir)?.[1])
            .filter((major): major is string => major !== undefined);
        return [...new Set(majors)].sort((a, b) => Number(b) - Number(a));
    } catch {
        return [];
    }
}

/**
 * Pick the Node version `aio` runs under.
 *
 * @param preferred - The catalog's version for `aio`, or null when it names none
 * @param installed - Majors that have `aio`, newest first
 * @returns The version, and whether it had to fall back from the catalog's
 */
export function chooseAioNodeVersion(preferred: string | null, installed: string[]): AioNodeChoice {
    if (preferred && installed.includes(preferred)) {
        return { version: preferred, fellBack: false };
    }
    if (installed.length > 0) {
        return { version: installed[0], fellBack: preferred !== null };
    }
    // Nothing has aio yet: the catalog's version is where the prerequisites step installs it.
    return { version: preferred, fellBack: false };
}
