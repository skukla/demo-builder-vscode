/**
 * One Adobe sign-in at a time, judged by whether the user ends up signed in.
 *
 * Every sign-in is an `aio auth login` that opens its own browser tab and listens
 * only to that tab. On 2026-09-19 two ran at once — the Integrations screen's and
 * the sign-in helper's. The user finished the helper's tab; the screen's never
 * answered, timed out a minute later, and the screen reported "Session expired"
 * over a token valid for 24 hours.
 *
 * Two rules fix it:
 * - A request while a sign-in is running JOINS it: one tab, and every caller gets
 *   the answer the moment the user finishes it. (The caller's own "finish in your
 *   browser" notice still shows, which is the right thing to tell them.) The one
 *   exception is a FORCED request during a normal sign-in: an org switch needs the
 *   account chooser only a forced sign-in shows, so it runs after, not with, it.
 * - A normal sign-in that gives up asks once whether the user is signed in anyway —
 *   a sign-in finished elsewhere, such as `aio login` in a terminal, counts. A FORCED
 *   sign-in is an org switch and is not rescued: a token for the old org is not a
 *   switch.
 *
 * @module features/authentication/services/signInGate
 */

import type { Logger } from '@/types/logger';

export interface SignInGateDeps {
    /** Run one sign-in: open the browser and wait for it. */
    run: (force: boolean) => Promise<boolean>;
    /** Is there a valid sign-in right now, read fresh? */
    signedInNow: () => Promise<boolean>;
    /** Take up a sign-in made elsewhere, as a successful `run` would (clear stale caches). */
    adoptSignIn: () => void;
    logger: Logger;
}

/**
 * Build the gate the auth service signs in through.
 *
 * @returns `signIn(force)`, resolving to whether the user is signed in
 */
export function createSignInGate(deps: SignInGateDeps): (force: boolean) => Promise<boolean> {
    let inFlight: { force: boolean; promise: Promise<boolean> } | undefined;

    const signInOnce = async (force: boolean): Promise<boolean> => {
        if (await deps.run(force)) return true;
        if (force || !(await deps.signedInNow())) return false;
        deps.logger.info('[Auth] That sign-in gave up, but you are signed in (finished elsewhere)');
        deps.adoptSignIn();
        return true;
    };

    const start = (force: boolean, after?: Promise<boolean>): Promise<boolean> => {
        // Waiting on the one before only when there is one: the first starts at once.
        const run = after
            ? after.then(
                  () => signInOnce(force),
                  () => signInOnce(force),
              )
            : signInOnce(force);
        const promise = run.finally(() => {
            if (inFlight?.promise === promise) inFlight = undefined;
        });
        inFlight = { force, promise };
        return promise;
    };

    return (force: boolean): Promise<boolean> => {
        if (!inFlight) return start(force);
        // A forced sign-in (org switch) needs the account chooser; a normal one does
        // not show it, so a forced request never joins one — it runs after it.
        if (force && !inFlight.force) return start(true, inFlight.promise);
        deps.logger.info('[Auth] A sign-in is already open in your browser; waiting for that one');
        return inFlight.promise;
    };
}
