/**
 * Do not tell a user their session expired when it has 23 hours left.
 *
 * From Jon's debug log (2026-08-17), the sequence that cost him three sign-ins:
 *
 *     15:19:55.581  [Token] Token valid, expires in 23h 22m
 *     15:19:55.586  [Auth SDK] SDK initialized successfully
 *     15:19:55.831  [Entity Fetcher] SDK unavailable, using slower CLI fallback
 *     15:19:59.341  Process exited with code 2
 *     15:19:59.341  AUTH_EXPIRED: Your Adobe I/O session has expired. Please sign in again.
 *
 * He signed in. It recurred at 15:20:11 and again at 15:20:20.
 *
 * Three defects meet here, and each hid the next:
 *
 * 1. **The SDK failed on every org read and said why at `trace`.** `trace` is
 *    priority 4; the default `demoBuilder.logLevel` is `debug` (3), so it never
 *    emits. His log has ZERO trace lines. "SDK initialized successfully" followed
 *    120ms later by "SDK unavailable" was the only visible trace of it.
 *
 * 2. **AUTH_EXPIRED is asserted from `stderr.includes('401')`** — a substring
 *    match — without consulting the token state that had just been validated four
 *    seconds earlier. The message names the one thing that was demonstrably fine,
 *    so the obvious remedy was the one that could not work.
 *
 * 3. **The raw stdout/stderr dump sits AFTER the 401/403 throws**, so for exactly
 *    the failures that matter we never record what the CLI said.
 */

// The fetcher logs through the module-level `getLogger()`, NOT its injected
// logger — so that is the object these tests have to watch. (Name must start with
// `mock` for jest to allow the reference inside a hoisted factory.)
const mockDebugLogger = createMockLogger();

jest.mock('@/core/logging', () => ({ getLogger: () => mockDebugLogger }));

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

let fetcher: AdobeEntityFetcher;
let mockCommandExecutor: jest.Mocked<CommandExecutor>;
let mockSDKClient: jest.Mocked<AdobeSDKClient>;
let mockLogger: jest.Mocked<Logger>;

/** stderr shaped like the real 401 the CLI emits. */
const UNAUTHORIZED = ' ›   Error: [CoreConsoleAPISDK] 401 - Unauthorized';

function build(config: Record<string, unknown> = {}) {
    mockCommandExecutor = createMockCommandExecutor({ execute: jest.fn() });
    mockSDKClient = {
        isInitialized: jest.fn().mockReturnValue(false),
        getClient: jest.fn(),
        ensureInitialized: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<AdobeSDKClient>;
    mockLogger = createMockLogger() as unknown as jest.Mocked<Logger>;

    fetcher = new AdobeEntityFetcher(
        mockCommandExecutor,
        mockSDKClient,
        {
            getCachedOrgList: jest.fn().mockReturnValue(undefined),
            setCachedOrgList: jest.fn(),
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
            getCachedProject: jest.fn().mockReturnValue(undefined),
        } as unknown as jest.Mocked<AuthCacheManager>,
        mockLogger,
        { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>,
        config,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    build();
});

/**
 * Every log line a DEFAULT install would actually show.
 *
 * `trace` is deliberately excluded: it is priority 4 against a default logLevel of
 * `debug` (3), so anything written there is invisible in the field. A diagnostic
 * that only appears at trace has not been recorded.
 */
function visibleLines(): string {
    return [
        mockDebugLogger.warn,
        mockDebugLogger.error,
        mockDebugLogger.info,
        mockDebugLogger.debug,
    ]
        .flatMap((fn) => fn.mock.calls)
        .map((args) => args.map((a: unknown) => String(a)).join(' '))
        .join('\n');
}

describe('a 401 from the CLI', () => {
    it('does NOT claim the session expired when the token is valid', async () => {
        // The defect that cost three sign-ins. A valid token plus a CLI 401 means
        // something else is wrong — org access, targeting, a transient gateway —
        // and "sign in again" is the one remedy guaranteed not to help.
        build({ isTokenValid: async () => true });
        mockCommandExecutor.execute.mockResolvedValue({
            code: 2,
            stdout: '',
            stderr: UNAUTHORIZED,
        } as never);

        await expect(fetcher.getOrganizations()).rejects.not.toThrow(/AUTH_EXPIRED/);
    });

    it('STILL reports expiry when the token really is invalid', async () => {
        build({ isTokenValid: async () => false });
        mockCommandExecutor.execute.mockResolvedValue({
            code: 2,
            stdout: '',
            stderr: UNAUTHORIZED,
        } as never);

        await expect(fetcher.getOrganizations()).rejects.toThrow(/AUTH_EXPIRED/);
    });

    it('reports expiry when nothing can vouch for the token', async () => {
        // No checker supplied — every existing caller. Behaviour must be unchanged.
        mockCommandExecutor.execute.mockResolvedValue({
            code: 2,
            stdout: '',
            stderr: UNAUTHORIZED,
        } as never);

        await expect(fetcher.getOrganizations()).rejects.toThrow(/AUTH_EXPIRED/);
    });
});

describe('what the logs must show', () => {
    it('records the raw CLI output even when it throws AUTH_EXPIRED', async () => {
        // The dump used to sit after the 401 branch, so the failures worth
        // diagnosing were the ones that recorded nothing.
        mockCommandExecutor.execute.mockResolvedValue({
            code: 2,
            stdout: 'not json',
            stderr: UNAUTHORIZED,
        } as never);

        await expect(fetcher.getOrganizations()).rejects.toThrow();

        expect(visibleLines()).toMatch(/Raw organizations (stdout|stderr)/);
    });

    it('records the raw CLI output even when it throws ORG_MISMATCH', async () => {
        mockCommandExecutor.execute.mockResolvedValue({
            code: 2,
            stdout: '',
            stderr: ' ›   Error: 403 - Forbidden',
        } as never);

        await expect(fetcher.getOrganizations()).rejects.toThrow();

        expect(visibleLines()).toMatch(/Raw organizations (stdout|stderr)/);
    });
});
