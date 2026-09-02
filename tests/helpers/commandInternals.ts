/**
 * Reach the PROTECTED and PRIVATE surface of a command under test.
 *
 * Webview commands keep their template methods protected — `getWebviewContent`,
 * `getInitialData`, `getWebviewTitle` — and their state private. Several suites exist
 * precisely to exercise those: what the command PUTS on screen, what initial data it
 * hands the webview, whether it disposes its panel. That reach is deliberate, and
 * TypeScript is right to object to it, so a cast has to exist.
 *
 * WHAT IT REPLACED. 28 `(command as any).getWebviewContent()` across 8 files, plus
 * two local copies of this same helper written in two more. `as any` disables
 * checking of the ENTIRE statement to reach one member — so a typo creates a new
 * property, the stub is never installed, and the test passes having asserted nothing.
 * That is not hypothetical for stubs: `(command as any).refreshProjectsList = jest.fn()`
 * misspelt does not fail, it just leaves the real method in place.
 *
 * THE MEMBER LIST IS THE MEASURED UNION of every member actually reached anywhere in
 * `tests/` on 2026-09-01 — not a guess at a base class's shape. Members belong to
 * different commands; no single command has all of them, which is fine for a
 * test-side view whose only job is to name what is being reached.
 *
 * Adding one is fine: add it here, and every suite gets it checked.
 */

/** The protected/private members suites reach on a command. */
export interface CommandInternals {
    // BaseWebviewCommand — panel lifecycle
    panel: unknown;
    createOrRevealPanel(): Promise<unknown>;
    disposeActivePanel(): void;
    initializeCommunication(): Promise<unknown>;
    communicationManager: unknown;
    webviewDisposables: unknown;

    // BaseWebviewCommand — the template methods a subclass implements
    getWebviewContent(): Promise<string>;
    getWebviewId(): string;
    getWebviewTitle(): string;
    getLoadingMessage(): string;
    getLoadingHeader(): unknown;
    /**
     * GENERIC, defaulting to a bag of unknowns.
     *
     * These suites read named fields off the result — `data.hasMesh`,
     * `data.wizardSteps` — and a bare `Promise<unknown>` makes every one of those an
     * error. The default keeps the reads legal while still refusing arithmetic or a
     * method call on a field nobody has described; a suite that wants more can say
     * `getInitialData<{ hasMesh: boolean }>()` and have that field checked.
     */
    getInitialData<T = Record<string, unknown>>(): Promise<T>;

    // Per-command state and helpers these suites drive
    editProject: unknown;
    refreshProjectsList: jest.Mock;
    refreshConfig: jest.Mock;
    registerProgrammaticWrites: jest.Mock;
    regenerateEnvFiles: jest.Mock;
    showPostSaveNotifications: jest.Mock;
    updateSidebarWizardContext: jest.Mock;
}

/**
 * The command's internals, typed.
 *
 * `object` rather than a command base type on purpose: these suites hold subclasses
 * of two different bases, and narrowing the parameter would buy nothing — the cast
 * inside is the whole point, and it is written once, here.
 */
export function internals(command: object): CommandInternals {
    return command as unknown as CommandInternals;
}
