/**
 * signInNotices — what a sign-in did BESIDES signing in, handed to the caller that
 * asked for it instead of to a dialog.
 *
 * Measured 2026-10-28: a forced Adobe sign-in (`aio auth login -f`) also ends the
 * DA.live sign-in, because it sends the browser through Adobe's logout first. The
 * check that notices runs deep inside the sign-in (`runAdobeLogin`), far below the
 * caller. A person at a button is told with a notification. An agent's `sign_in` call
 * must get it in its RESULT, so the agent can say it and offer the DA.live sign-in,
 * rather than a dialog appearing in a window the agent cannot see.
 *
 * Same mechanism as `agentPhaseChannel` and `callTagContext`: `AsyncLocalStorage`,
 * so a caller collects without threading anything through the sign-in's signature,
 * and two concurrent calls each hear only their own.
 *
 * Lives in core because both ends need it and core cannot import features: the
 * agent's tool (features/ai) collects, the DA.live check (features/eds) reports.
 *
 * @module core/auth/signInNotices
 */

import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage<string[]>();

/**
 * Run a sign-in and collect every notice reported inside it, however deep.
 *
 * @param signIn - the sign-in to run
 * @returns what it resolved to, and the notices, in the order reported
 */
export async function collectSignInNotices<T>(signIn: () => Promise<T>): Promise<{ result: T; notices: string[] }> {
    const notices: string[] = [];
    const result = await storage.run(notices, signIn);
    return { result, notices };
}

/**
 * Hand a notice to the caller collecting them, if there is one.
 *
 * @param notice - one sentence for the SC
 * @returns true when a caller collected it; false when nobody is collecting, and the
 *   reporter must tell the SC itself
 */
export function reportSignInNotice(notice: string): boolean {
    const notices = storage.getStore();
    if (!notices) return false;
    notices.push(notice);
    return true;
}
