/**
 * GitHub OAuth Service Tests
 *
 * Tests for OAuth flow methods extracted from GitHubService.
 */

import * as vscode from 'vscode';

import { TIMEOUTS } from '@/core/utils/timeoutConfig';

// Mock timeoutConfig - uses semantic categories
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        LONG: 5000, // Short timeout for tests (normally AUTH.OAUTH but using LONG for test speed)
        AUTH: {
            OAUTH: 5000, // OAuth flow timeout (short for tests)
        },
    },
}));

// Mock logger

/** Drain the microtask queue — deep enough for a rejection to cross the race. */
async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('GitHub OAuth Service', () => {
    // Import after mocks are set up
    let GitHubOAuthService: any;
    let mockSecretStorage: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        // FAKE timers for the whole file. The flow arms a real OAuth timeout, and
        // a test that leaves one pending rejects an orphaned promise seconds after
        // the file finished — an unhandled rejection that takes the whole worker
        // down (seen killing a Stryker worker, 2026-09-06). Under fake timers an
        // uncleared timer simply never fires.
        jest.useFakeTimers();
        // Note: Don't reset modules - it clears the mock setup

        // Create mock secret storage
        mockSecretStorage = {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
        };

        // Dynamic import after mocks
        const module = await import('@/features/eds/services/github/githubOAuthService');
        GitHubOAuthService = module.GitHubOAuthService;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    describe('startOAuthFlow', () => {
        it('should throw error when browser fails to open', async () => {
            // Given: Browser fails to open
            const service = new GitHubOAuthService(mockSecretStorage);
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(false);

            // When/Then: Should throw OAuth cancelled error
            await expect(
                service.startOAuthFlow('test-client-id', 'vscode://redirect')
            ).rejects.toThrow('OAuth flow cancelled');
        });

        it('should build OAuth URL with correct parameters', async () => {
            // Given: A configured OAuth service that captures the URL
            const service = new GitHubOAuthService(mockSecretStorage);
            let capturedUrl: string = '';
            (vscode.Uri.parse as jest.Mock).mockImplementation((url: string) => {
                capturedUrl = url;
                return url;
            });
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(false);

            // When: Starting OAuth flow (will fail but URL gets built)
            try {
                await service.startOAuthFlow('test-client-id', 'vscode://redirect');
            } catch {
                // Expected to throw
            }

            // Then: URL should be built correctly
            expect(capturedUrl).toContain('client_id=test-client-id');
            expect(capturedUrl).toContain('redirect_uri=');
            expect(capturedUrl).toContain('scope=');
            expect(capturedUrl).toContain('state=');
        });

        it('should include required scopes in OAuth URL', async () => {
            // Given: A configured OAuth service that captures the URL
            const service = new GitHubOAuthService(mockSecretStorage);
            let capturedUrl: string = '';
            (vscode.Uri.parse as jest.Mock).mockImplementation((url: string) => {
                capturedUrl = url;
                return url;
            });
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(false);

            // When: Starting OAuth flow
            try {
                await service.startOAuthFlow('test-client-id', 'vscode://redirect');
            } catch {
                // Expected to throw
            }

            // Then: URL should include scopes (URL-encoded as "repo%20user%3Aemail" or plain)
            expect(capturedUrl).toContain('scope=');
            // Check for either encoded or non-encoded version
            const hasRepoScope = capturedUrl.includes('repo') || capturedUrl.includes('repo%20');
            expect(hasRepoScope).toBe(true);
        });
    });

    /**
     * The flow's two ways of settling, and the timer it arms to guarantee one of
     * them. Nothing above drives a flow that actually completes: every test lets
     * `openExternal` fail, so the callback, the timeout and the cleanup were all
     * unconstrained.
     */
    describe('startOAuthFlow — settling the pending flow', () => {
        it('resolves with the params handleOAuthCallback hands over', async () => {
            const service = new GitHubOAuthService(mockSecretStorage);
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(true);

            // The callback promise is armed synchronously, so the callback can
            // arrive before the browser round-trip has settled.
            const flow = service.startOAuthFlow('test-client-id', 'vscode://redirect');
            service.handleOAuthCallback({ code: 'auth-code-42', state: 'csrf-state' });

            await expect(flow).resolves.toEqual({ code: 'auth-code-42', state: 'csrf-state' });
        });

        it('rejects with a timeout only once the configured OAuth window elapses', async () => {
            const service = new GitHubOAuthService(mockSecretStorage);
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(true);

            const flow = service.startOAuthFlow('test-client-id', 'vscode://redirect');
            // Hold the outcome BEFORE advancing: asserting on a promise that is
            // still in flight scores as a runtime error rather than a result.
            let settled: string | undefined;
            const outcome = flow.then(
                () => {
                    settled = 'resolved';
                },
                (error: Error) => {
                    settled = error.message;
                }
            );

            jest.advanceTimersByTime(TIMEOUTS.LONG - 1);
            // A rejection travels several microtask hops to get here — the race,
            // the async function, then this handler. Two ticks were not enough,
            // and the shortfall read as "the timer has not fired yet".
            await flushMicrotasks();
            expect(settled).toBeUndefined();

            jest.advanceTimersByTime(1);
            await outcome;
            expect(settled).toBe('OAuth flow timed out');
        });

        it('unrefs the OAuth timer and clears it with the handle it was given', async () => {
            // The timer must not hold the extension host's event loop open, and it
            // must not outlive the flow — a leaked timer rejects an orphaned
            // promise long after the flow settled.
            const unref = jest.fn();
            const handle = { unref } as unknown as NodeJS.Timeout;
            jest.spyOn(global, 'setTimeout').mockReturnValue(handle);
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            const service = new GitHubOAuthService(mockSecretStorage);
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(false);

            await expect(
                service.startOAuthFlow('test-client-id', 'vscode://redirect')
            ).rejects.toThrow('OAuth flow cancelled');

            expect(unref).toHaveBeenCalled();
            expect(clearTimeoutSpy).toHaveBeenCalledWith(handle);
        });

        it('tolerates a host whose setTimeout returns a bare id with no unref', async () => {
            // Browser-shaped hosts return a number. Calling `.unref()` on it
            // throws inside the timeout promise's executor, which rejects that
            // promise — so the flow blows up with a TypeError instead of waiting
            // for its callback. That is what the typeof guard is for.
            const bareId = 7 as unknown as NodeJS.Timeout;
            jest.spyOn(global, 'setTimeout').mockReturnValue(bareId);
            const service = new GitHubOAuthService(mockSecretStorage);
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(true);

            const flow = service.startOAuthFlow('test-client-id', 'vscode://redirect');
            let settled: string | undefined;
            const outcome = flow.then(
                () => {
                    settled = 'resolved';
                },
                (error: Error) => {
                    settled = error.message;
                }
            );

            await flushMicrotasks();
            expect(settled).toBeUndefined();

            // Finish it, so nothing is left pending on the way out.
            service.handleOAuthCallback({ code: 'auth-code-42', state: 'csrf-state' });
            await outcome;
            expect(settled).toBe('resolved');
        });
    });

    describe('handleOAuthCallback', () => {
        it('should be no-op when no pending OAuth flow', () => {
            // Given: No pending OAuth flow
            const service = new GitHubOAuthService(mockSecretStorage);

            // When/Then: Callback should not throw
            expect(() => {
                service.handleOAuthCallback({ code: 'test', state: 'test' });
            }).not.toThrow();
        });
    });

    describe('generateState', () => {
        it('should generate 32-character hex string', () => {
            // Given: OAuth service
            const service = new GitHubOAuthService(mockSecretStorage);

            // When: Generating state
            const state = service.generateState();

            // Then: Should be valid hex string of correct length
            expect(state).toHaveLength(32);
            expect(/^[0-9a-f]+$/i.test(state)).toBe(true);
        });

        it('should generate unique state strings', () => {
            // Given: OAuth service
            const service = new GitHubOAuthService(mockSecretStorage);

            // When: Generating multiple states
            const states = new Set<string>();
            for (let i = 0; i < 10; i++) {
                states.add(service.generateState());
            }

            // Then: All states should be unique
            expect(states.size).toBe(10);
        });
    });
});
