/**
 * The wizard state both EDS auth-hook suites share, and the shared WebviewClient double's
 * handles they read.
 *
 * `useDaLiveAuth` and `useGitHubAuth` carried a byte-identical copy of the `WebviewClient`
 * mock and of `createDefaultState` (2026-09-02). The mock is now the house double,
 * `tests/helpers/webviewClientMock.ts` (PL-115): this file imports it, so importing this
 * file still registers the mock, and it must come before the suite's import of its hook.
 * Pinned by `tests/sop/mock-wall-import-order.test.ts`, which counts a helper that imports
 * a wall as a wall.
 */

import { mockPostMessage, webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import type { WizardState, EDSConfig } from '@/types/webview';

/**
 * Re-exported from the shared double: `mockPostMessage` is the calls the hook made
 * through the client (assert on it, not on the mock module), and
 * `webviewClientHandlers` holds the handlers the hook registered, by message type.
 * A suite fires a push by calling the entry it wants.
 */
export { mockPostMessage, webviewClientHandlers };

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
