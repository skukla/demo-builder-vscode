/**
 * What each check the SC or an agent was shown covers, by its token: the websites, and the warning
 * when another local project uses one (datapack-simplification step 06, owner review 2026-11-13).
 *
 * `clear_demo_data` is handed only that token, so its consent dialog reads this to name what it
 * clears (`agentAlertCopy.ts`), rather than an unnamed "this project's demo data". The check handler
 * records each answer it gives (`demoDataHandlers.ts`). Words only: the plan itself stays in the
 * handler, which holds the clearing to it.
 *
 * The newest check is also what Fix with AI on Clear Demo Data's window reads (step 06, C2b): the
 * types it could not read, with Commerce's words, so the prompt says what happened.
 *
 * @module features/data-installer/services/demoDataWipe/shownClears
 */

import type { ClearUnread } from '@/types/demoDataWipe';

/** A data type the check could not read: how (`ClearUnread`), and Commerce's own words. */
export interface ShownUnread {
    kind: ClearUnread;
    detail: string;
}

/** What one shown check covers, as the consent dialog names it. */
export interface ShownClear {
    /** The websites, by code. */
    websites: string[];
    /** Another local project uses one of them: the sentence naming it. */
    warning?: string;
    /** The types it could not read, for Fix with AI's prompt (`importFixHandlers.ts`). */
    unread?: Record<string, ShownUnread>;
}

/** As many as the handler keeps plans: one is shown per question, so a few is plenty. */
const KEPT = 10;

const shown = new Map<string, ShownClear>();

/** Note what the check with this token covers. */
export function rememberShownClear(token: string, clear: ShownClear): void {
    shown.delete(token);
    shown.set(token, clear);
    while (shown.size > KEPT) shown.delete(shown.keys().next().value as string);
}

/** What the check with this token covered, when one answered with it. */
export function shownClearFor(token: unknown): ShownClear | undefined {
    return typeof token === 'string' ? shown.get(token) : undefined;
}

/** The newest check answered, when there is one. */
export function latestShownClear(): ShownClear | undefined {
    return [...shown.values()].pop();
}
