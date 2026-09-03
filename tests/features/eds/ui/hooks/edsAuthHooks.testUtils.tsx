/**
 * The wall and the wizard state both EDS auth-hook suites share.
 *
 * `useDaLiveAuth` and `useGitHubAuth` carried a byte-identical copy of the
 * `WebviewClient` mock, the two handles the hoisted factory closes over, and
 * `createDefaultState` (hashed 2026-09-02 with comments stripped — same digest
 * for both files, both blocks).
 *
 * IMPORTING THIS FILE REGISTERS THE MOCK, so it must come before the suite's
 * import of its hook: `jest.mock` hoists above the imports of the module it
 * appears in, not across modules. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 *
 * SCOPE. This is the two-suite cluster, not a house helper. 47 files across the
 * tree mock `WebviewClient`, in 33 DIFFERENT bodies — measured the same day —
 * and picking one canonical shape for all of them is a decision, not a
 * de-duplication. Filed rather than smuggled in here.
 */

import type { WizardState, EDSConfig } from '@/types/webview';

/** Calls the hook made through the client. Assert on this, not on the mock module. */
export const mockPostMessage = jest.fn();

/**
 * Handlers the hook registered, by message type.
 *
 * Module-level because the factory below is hoisted above every statement in
 * the importing suite and cannot close over anything a test creates later. A
 * suite fires a push by calling the entry it wants.
 */
export const messageHandlers: Map<string, (data: unknown) => void> = new Map();

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: mockPostMessage,
        onMessage: jest.fn((type: string, handler: (data: unknown) => void) => {
            messageHandlers.set(type, handler);
            return () => messageHandlers.delete(type);
        }),
        ready: jest.fn().mockResolvedValue(undefined),
    },
}));

/**
 * A wizard state parked on the storefront-setup step with Adobe auth done.
 *
 * @param overrides - the EDS fields this test needs different.
 */
export const createDefaultState = (overrides?: Partial<EDSConfig>): WizardState => ({
    currentStep: 'storefront-setup',
    projectName: 'test-project',
    adobeAuth: { isAuthenticated: true, isChecking: false },
    edsConfig: {
        accsHost: 'https://accs.example.com',
        storeViewCode: 'default',
        customerGroup: 'general',
        repoName: '',
        daLiveOrg: '',
        daLiveSite: '',
        ...overrides,
    },
});
