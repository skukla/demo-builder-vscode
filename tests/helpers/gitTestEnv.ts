/**
 * The environment a test's own git commands run with: this process's, WITHOUT any `GIT_*`
 * variable, plus a fixed identity.
 *
 * A git hook exports `GIT_DIR` (and friends) pointing at the real repository, and the
 * pre-push gate runs the suite from inside one. Inherited, they send a test's `git init`,
 * `config`, `add` and `commit` in a temp folder into the REAL repository instead. It has
 * happened twice: on 2026-09-15 a pre-push run committed a tree deleting every file and set
 * `core.bare = true` on the shared config; on 2026-10-28 one wrote a fake `user.name` and
 * `user.email` into Demo Builder's git config and staged a file into a worktree's index.
 *
 * @param home - When given, `HOME` and `XDG_CONFIG_HOME` point there too, so the user's own
 *   git config is not read either
 */
export function gitTestEnv(home?: string): NodeJS.ProcessEnv {
    const inherited = Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'));
    return {
        ...Object.fromEntries(inherited),
        ...(home ? { HOME: home, XDG_CONFIG_HOME: home } : {}),
        GIT_AUTHOR_NAME: 'test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
    };
}
