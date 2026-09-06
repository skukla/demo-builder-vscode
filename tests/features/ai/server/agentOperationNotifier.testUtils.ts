/**
 * Shared setup for the agent consent/notification suites.
 *
 * Both suites drive `createAgentConsentGate` and then read the dialog back out
 * of `showWarningMessage`'s recorded call, which is a three-part shape —
 * `(title, {modal, detail}, ...buttons)` — that neither suite should have to
 * re-derive by index. It was written out seven times in one file and twice in
 * the other before this existed.
 *
 * The `jest.mock('vscode', …)` calls stay in the suites: a factory only hoists
 * above the imports of the module it appears in, so moving one here registers
 * it too late. That is why this file holds READERS, not mocks.
 */

/** The detail body VS Code was asked to show — the consequence plus the target. */
export function consentDetail(call: unknown[]): string {
    return String((call[1] as { detail?: string }).detail);
}

/** The dialog's title line. */
export function consentTitle(call: unknown[]): string {
    return String(call[0]);
}

/** The buttons offered, which is everything after the options object. */
export function consentButtons(call: unknown[]): string[] {
    return call.slice(2) as string[];
}
