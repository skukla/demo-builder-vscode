/**
 * The files a storefront never ships, whichever door it leaves by: the zip
 * import (a zip → a new GitHub repository), the demo bundle (a repository → a
 * zip handed to someone else), and Sync (a local folder → `git push`).
 *
 * One list on purpose. The zip import used to drop `.env` but keep `.env.local`,
 * `.env.production` and every other variant, so a secret in a colleague's zip
 * would have been committed to a new repository (found 2026-10-03).
 *
 * The secret rule is every file whose NAME starts with `.env`, at any depth —
 * `.env.example` and `.env.sample` included: nothing here treated an example
 * file as safe, and dropping one is the safe direction.
 *
 * @module features/eds/services/storefront/neverShippedFiles
 */

/** Every file whose name starts with this may hold a secret. */
const SECRET_FILE_PREFIX = '.env';

/** Folders a repository never carries, as path prefixes. */
const NEVER_SHIPPED_DIRS = ['.git/', 'node_modules/', '.npm-cache/'];

/** Names a repository never carries, at any depth. */
const NEVER_SHIPPED_NAMES = ['.DS_Store'];

/** Whether a file of this name may hold a secret (`.env`, `.env.local`, `.envrc`, ...). */
function isSecretFile(path: string): boolean {
    const name = path.split('/').pop() ?? '';
    return name.startsWith(SECRET_FILE_PREFIX);
}

/**
 * Whether a repository-relative path is never shipped: a secret file, a
 * never-committed folder, or OS litter.
 *
 * @param path - repository-relative, `/`-separated
 */
export function isNeverShipped(path: string): boolean {
    if (isSecretFile(path)) return true;
    const name = path.split('/').pop() ?? '';
    if (NEVER_SHIPPED_NAMES.includes(name)) return true;
    return NEVER_SHIPPED_DIRS.some((dir) => path.startsWith(dir) || path.includes(`/${dir}`));
}

/**
 * The same secret rule as a git pathspec, for `git add -A -- . <this>`: stage
 * every change except a secret file at any depth (`**\/` matches the root too).
 */
export const SECRET_FILES_PATHSPEC_EXCLUDE = `:(exclude,glob)**/${SECRET_FILE_PREFIX}*`;
