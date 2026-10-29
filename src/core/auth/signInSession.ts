/**
 * The Adobe sign-in running now: the link it prints, and a way to stop it.
 *
 * `aio auth login` tries to open a browser and, either way, prints the sign-in link
 * for when it does not. On 2026-10-23 no browser opened, the extension had thrown the
 * link away, and the SC was left with "Opening a browser window" and nothing to click.
 * The sign-in runs four calls below whatever is showing the wait, so the two meet
 * here rather than threading a callback through every layer between them.
 *
 * There is one Adobe session, and the sign-in gate already lets only one sign-in run
 * at a time, so this holds one.
 *
 * @module core/auth/signInSession
 */

/** One running sign-in, as the code that runs it sees it. */
export interface SignInRun {
    /** Aborts the sign-in command when the SC cancels. */
    signal: AbortSignal;
    /** The command printed its link. */
    announceLink: (link: string) => void;
    /** The command ended, however it ended. */
    end: () => void;
}

interface Running {
    link?: string;
    controller: AbortController;
}

let running: Running | undefined;

/** The latest sign-in was stopped by the SC. */
let cancelled = false;

/**
 * Waiting for the next link. Not kept on a run: whatever shows the wait starts
 * waiting before the sign-in under it has begun.
 */
let waiters: Array<(link: string) => void> = [];

/**
 * Start a sign-in. Call `end` when its command returns.
 *
 * @returns the run's signal, and how to report its link and its end
 */
export function beginSignIn(): SignInRun {
    const run: Running = { controller: new AbortController() };
    running = run;
    cancelled = false;
    return {
        signal: run.controller.signal,
        announceLink: (link) => {
            if (run.link) return;
            run.link = link;
            const waiting = waiters;
            waiters = [];
            for (const resolve of waiting) resolve(link);
        },
        end: () => {
            if (running === run) running = undefined;
        },
    };
}

/**
 * The sign-in link, as soon as the running sign-in (or the next one) prints it.
 *
 * @returns the link; never resolves when no sign-in prints one, so race it against
 *   the sign-in itself
 */
export function signInLink(): Promise<string> {
    return new Promise((resolve) => {
        if (running?.link) {
            resolve(running.link);
            return;
        }
        waiters.push(resolve);
    });
}

/** Stop the running sign-in: the SC cancelled it. */
export function cancelSignIn(): void {
    if (!running) return;
    cancelled = true;
    running.controller.abort();
}

/**
 * Whether the SC cancelled the latest sign-in, so a guard can answer "cancelled"
 * rather than "failed" (a Cancel is not a failure to report).
 */
export function signInWasCancelled(): boolean {
    return cancelled;
}

/**
 * The sign-in link in what `aio auth login` printed so far: the line after "Visit
 * this url to log in:", or after "Login URI (…):" from the library underneath it.
 *
 * @param printed - the command's output so far
 * @returns the link, or undefined until it has been printed
 */
export function signInLinkIn(printed: string): string | undefined {
    return /(?:log in|login uri)[^\n]*:\s*(https:\/\/\S+)/i.exec(printed)?.[1];
}
