/**
 * The canonical `webviewClient` double, and the handles that drive it.
 *
 * PL-38's answer for this module. 54 test files mocked `WebviewClient` in 33
 * different bodies, and the divergence was shallow: nearly all were subsets of
 * the same members, and most "different implementations" were the identical
 * pattern — delegate to a local `jest.fn` so the test can drive it — written out
 * per suite. 31 of them now import this instead; 23 files and 14 walls remain,
 * each keeping its own for a reason below.
 *
 * IMPORT THIS BEFORE the component under test: `jest.mock` hoists above the
 * imports of the module it appears in, not across modules. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 *
 * EVERY EXPORT IS NAMED `mock…`, AND THAT IS LOAD-BEARING. Jest only lets a
 * `jest.mock` factory reference out-of-scope variables whose names begin with
 * `mock`. A first version named them `client…`; the factory then never
 * registered, suites silently received the REAL client, and 41 of them failed on
 * errors that pointed at the double's shape rather than its name. Nothing warns
 * about this — the only symptom is a mock that quietly is not there.
 *
 * A SUITE CANNOT OVERRIDE WHAT THIS FILE DECLARES: the imported wall registers
 * last and wins. Configure behaviour on the handles in a `beforeEach`
 * — `mockRequest.mockResolvedValue(x)` — never with a second `jest.mock`.
 *
 * `onMessage` RECORDS into `webviewClientHandlers`. The inert version several
 * suites carried (`jest.fn(() => jest.fn())`) is a strict subset: both return an
 * unsubscribe, and a suite that never reads the map cannot tell the difference.
 *
 * THE MEMBER LIST IS THE UNION of all 54 walls, not the common subset. Building
 * it from the five members most walls shared failed every suite that called one
 * of the other seven. A spare member on a double costs nothing; a missing one
 * crashes.
 *
 * WHO DOES NOT USE THIS, and why — 23 files keep their own wall:
 *   - 21 whose wall delegates to suite-local handles they assert on. Converting
 *     them means renaming those handles across the suite and its consumers, and
 *     is worth doing separately from this change.
 *   - `ProjectDashboardScreen.testUtils` and its consumers: this double's
 *     `ready` RESOLVES, where that suite's wall omits `ready` entirely, so
 *     adopting it settles a promise outside `act()` and trips the console gate.
 *     A real behavioural difference, left alone rather than papered over.
 */

export const mockPostMessage = jest.fn();
export const mockRequest = jest.fn();
export const mockRequestAuth = jest.fn();
export const mockReady = jest.fn().mockResolvedValue(undefined);
export const mockGetState = jest.fn();
export const mockSetState = jest.fn();
export const mockRequestValidation = jest.fn();
export const mockReportProgress = jest.fn();
export const mockRequestProjects = jest.fn();
export const mockCreateProject = jest.fn();
export const mockLog = jest.fn();

export const webviewClientHandlers = new Map<string, (data: unknown) => void>();

export const mockOnMessage = jest.fn((type: string, handler: (data: unknown) => void) => {
    webviewClientHandlers.set(type, handler);
    return () => webviewClientHandlers.delete(type);
});

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: mockPostMessage,
        request: mockRequest,
        requestAuth: mockRequestAuth,
        ready: mockReady,
        onMessage: mockOnMessage,
        getState: mockGetState,
        setState: mockSetState,
        requestValidation: mockRequestValidation,
        reportProgress: mockReportProgress,
        requestProjects: mockRequestProjects,
        createProject: mockCreateProject,
        log: mockLog,
    },
}));
