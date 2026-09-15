/**
 * What a file in a GitHub archive needs to reach a tree intact: its bytes
 * decide text or blob, its stored unix mode decides the tree entry's mode.
 *
 * Reset read every archived file with `toString('utf-8')` and wrote it with mode
 * `100644`, so favicons, fonts and images were corrupted and scripts lost their
 * executable bit (found 2026-09-15). GitHub's archives store the unix mode in
 * each entry's external attributes (read off `skukla/citisignal-nextjs`:
 * `.husky/pre-commit` 100755, `src/app/favicon.ico` none).
 *
 * @module features/eds/services/github/archiveFile
 */

import type { GitHubTreeInput } from '../types';

/** Bytes that cannot travel as inline text in a tree entry go through a blob. */
export function isBinary(bytes: Buffer): boolean {
    const sample = bytes.subarray(0, 8000);
    if (sample.includes(0)) return true;
    return sample.toString('utf-8').includes('�');
}

/**
 * The tree mode for an archive entry's external attributes: a symlink stays a
 * symlink, a regular file with any execute bit is `100755`, anything else
 * (including an archive that stores no mode) is `100644`.
 */
export function archiveFileMode(attr: number): GitHubTreeInput['mode'] {
    const unix = attr >>> 16;
    const type = unix & 0o170000;
    if (type === 0o120000) return '120000';
    return type === 0o100000 && (unix & 0o111) !== 0 ? '100755' : '100644';
}
