/**
 * An update's checkout, read and written the way the storefront repairs read and write GitHub.
 *
 * Until 2026-10-30 an Adobe boilerplate update ran Demo Builder's repairs (head.html, 404.html,
 * the old scripts out of delayed.js, Quick Edit) against GitHub BEFORE it knew whether its own
 * change would apply. On JustRite the change then stopped on a clash, and those commits were
 * already on GitHub while the update said nothing had changed. Handing the same repairs this
 * object instead puts their writes in the clone, where a stopped update throws them away and a
 * finished one pushes them once, with the update.
 *
 * @module features/updates/services/checkoutFiles
 */

import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { RepoFileAccess } from '@/features/eds/services/github/githubFileOperations';

/** The absolute path of `file` inside `repoDir`; refuses one that would land outside it. */
function inside(repoDir: string, file: string): string {
    const root = path.resolve(repoDir);
    const full = path.resolve(root, file);
    if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
        throw new Error(`${file} is outside the checkout`);
    }
    return full;
}

/**
 * The checkout at `repoDir` as file access. The owner and repository arguments are ignored:
 * the checkout is that repository. A file's `sha` is a hash of its text, so a writer handing
 * it back gets nothing checked against it; the checkout has no other writer to race.
 */
export function checkoutFiles(repoDir: string): RepoFileAccess {
    return {
        async getFileContent(_owner, _repo, file) {
            try {
                const content = await fs.readFile(inside(repoDir, file), 'utf8');
                const sha = createHash('sha1').update(content).digest('hex');
                return { content, sha, path: file, encoding: 'utf-8' };
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
                throw error;
            }
        },
        async createOrUpdateFile(_owner, _repo, file, content) {
            const full = inside(repoDir, file);
            await fs.mkdir(path.dirname(full), { recursive: true });
            await fs.writeFile(full, content);
            return { sha: createHash('sha1').update(content).digest('hex'), commitSha: '' };
        },
    };
}
