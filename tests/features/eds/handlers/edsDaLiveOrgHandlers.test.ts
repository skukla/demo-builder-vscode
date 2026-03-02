/**
 * EDS DA.live Org Handlers Tests
 *
 * Tests for handleListDaLiveOrgs:
 * - Token validation (missing, invalid, expired)
 * - Org discovery via GET /list/
 * - Write-access filtering via HEAD /list/{org} + X-da-actions header
 * - Single writable org, multiple orgs, no writable orgs
 * - Network errors
 */

import { handleListDaLiveOrgs } from '@/features/eds/handlers/edsDaLiveOrgHandlers';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mock Setup
// =============================================================================

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(''),
        }),
    },
    ConfigurationTarget: { Global: 1 },
}), { virtual: true });

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}));

// =============================================================================
// Test Helpers
// =============================================================================

/** Build a minimal valid DA.live JWT (client_id=darkalley, not expired) */
function makeDaLiveToken(overrides: Record<string, unknown> = {}): string {
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        client_id: 'darkalley',
        email: 'user@adobe.com',
        created_at: Date.now(),
        expires_in: 86_400_000, // 24h
        ...overrides,
    };
    const encode = (obj: unknown) =>
        Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `${encode(header)}.${encode(payload)}.fakesig`;
}

function makeExpiredToken(): string {
    return makeDaLiveToken({
        created_at: Date.now() - 200_000,
        expires_in: 100_000, // expired 100s ago
    });
}

function makeNonDaLiveToken(): string {
    return makeDaLiveToken({ client_id: 'other-app' });
}

function createMockContext(): HandlerContext {
    return {
        logger: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        },
        debugLogger: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        },
        context: {
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as unknown as HandlerContext['context'],
        panel: undefined,
        stateManager: {} as HandlerContext['stateManager'],
        communicationManager: undefined,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: { isAuthenticating: false },
    };
}

/** Mock a successful GET /list/ returning org entries */
function mockOrgListResponse(orgs: string[], files: string[] = []) {
    const entries = [
        ...orgs.map((name) => ({ name })),
        ...files.map((name) => ({ name, ext: 'html' })),
    ];
    return {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(entries),
    };
}

/** Mock HEAD /list/{org} with X-da-actions header */
function mockHeadResponse(actions: string) {
    return {
        ok: true,
        status: 200,
        headers: {
            get: jest.fn((header: string) =>
                header.toLowerCase() === 'x-da-actions' ? actions : null,
            ),
        },
    };
}

function mockHeadForbidden() {
    return {
        ok: false,
        status: 403,
        headers: { get: jest.fn().mockReturnValue(null) },
    };
}

// =============================================================================
// Tests
// =============================================================================

describe('handleListDaLiveOrgs', () => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = createMockContext();
    });

    // -------------------------------------------------------------------------
    // Payload validation
    // -------------------------------------------------------------------------

    it('should return error when token is missing', async () => {
        const result = await handleListDaLiveOrgs(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Token is required');
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [],
            error: 'Token is required',
        });
    });

    it('should return error when token is empty string', async () => {
        const result = await handleListDaLiveOrgs(context, { token: '' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Token is required');
    });

    // -------------------------------------------------------------------------
    // Token validation
    // -------------------------------------------------------------------------

    it('should reject invalid token format', async () => {
        const result = await handleListDaLiveOrgs(context, { token: 'not-a-jwt' });

        expect(result.success).toBe(false);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [],
            error: expect.stringContaining('Invalid token'),
        });
        // Should NOT call fetch — validation happens before network call
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject expired token', async () => {
        const result = await handleListDaLiveOrgs(context, { token: makeExpiredToken() });

        expect(result.success).toBe(false);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [],
            error: expect.stringContaining('expired'),
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject non-DA.live token', async () => {
        const result = await handleListDaLiveOrgs(context, { token: makeNonDaLiveToken() });

        expect(result.success).toBe(false);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [],
            error: expect.stringContaining('not from DA.live'),
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Org discovery — single writable org
    // -------------------------------------------------------------------------

    it('should return single writable org', async () => {
        const token = makeDaLiveToken();

        mockFetch
            // GET /list/ — returns one org
            .mockResolvedValueOnce(mockOrgListResponse(['my-org']))
            // HEAD /list/my-org — writable
            .mockResolvedValueOnce(mockHeadResponse('/=read,write'));

        const result = await handleListDaLiveOrgs(context, { token });

        expect(result.success).toBe(true);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [{ name: 'my-org' }],
            email: 'user@adobe.com',
        });
    });

    // -------------------------------------------------------------------------
    // Org discovery — multiple orgs with mixed access
    // -------------------------------------------------------------------------

    it('should filter to writable orgs only', async () => {
        const token = makeDaLiveToken();

        mockFetch
            // GET /list/ — returns 3 orgs
            .mockResolvedValueOnce(mockOrgListResponse(['owned-org', 'read-only-org', 'another-owned']))
            // HEAD checks (parallel, but Jest resolves in order)
            .mockResolvedValueOnce(mockHeadResponse('/=read,write'))   // owned-org
            .mockResolvedValueOnce(mockHeadResponse('/=read'))          // read-only-org
            .mockResolvedValueOnce(mockHeadResponse('/=read,write'));   // another-owned

        const result = await handleListDaLiveOrgs(context, { token });

        expect(result.success).toBe(true);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [{ name: 'owned-org' }, { name: 'another-owned' }],
            email: 'user@adobe.com',
        });
    });

    // -------------------------------------------------------------------------
    // Org discovery — no writable orgs
    // -------------------------------------------------------------------------

    it('should return empty array when no orgs are writable', async () => {
        const token = makeDaLiveToken();

        mockFetch
            .mockResolvedValueOnce(mockOrgListResponse(['collab-org']))
            .mockResolvedValueOnce(mockHeadResponse('/=read'));

        const result = await handleListDaLiveOrgs(context, { token });

        expect(result.success).toBe(true);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [],
            email: 'user@adobe.com',
        });
    });

    it('should return empty array when org list is empty', async () => {
        const token = makeDaLiveToken();

        mockFetch.mockResolvedValueOnce(mockOrgListResponse([]));

        const result = await handleListDaLiveOrgs(context, { token });

        expect(result.success).toBe(true);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [],
            email: 'user@adobe.com',
        });
    });

    // -------------------------------------------------------------------------
    // File filtering
    // -------------------------------------------------------------------------

    it('should exclude files (entries with ext) from org list', async () => {
        const token = makeDaLiveToken();

        mockFetch
            // GET /list/ — returns orgs + files
            .mockResolvedValueOnce(mockOrgListResponse(['real-org'], ['config.json', 'readme.md']))
            // HEAD for real-org only (files should be filtered out)
            .mockResolvedValueOnce(mockHeadResponse('/=read,write'));

        const result = await handleListDaLiveOrgs(context, { token });

        expect(result.success).toBe(true);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [{ name: 'real-org' }],
            email: 'user@adobe.com',
        });
        // 1 GET + 1 HEAD (only for the org, not for files)
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // -------------------------------------------------------------------------
    // HEAD failures treated as non-writable
    // -------------------------------------------------------------------------

    it('should treat HEAD 403 as non-writable', async () => {
        const token = makeDaLiveToken();

        mockFetch
            .mockResolvedValueOnce(mockOrgListResponse(['forbidden-org']))
            .mockResolvedValueOnce(mockHeadForbidden());

        const result = await handleListDaLiveOrgs(context, { token });

        expect(result.success).toBe(true);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [],
            email: 'user@adobe.com',
        });
    });

    it('should treat HEAD network error as non-writable', async () => {
        const token = makeDaLiveToken();

        mockFetch
            .mockResolvedValueOnce(mockOrgListResponse(['flaky-org']))
            .mockRejectedValueOnce(new Error('Network error'));

        const result = await handleListDaLiveOrgs(context, { token });

        expect(result.success).toBe(true);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [],
            email: 'user@adobe.com',
        });
    });

    // -------------------------------------------------------------------------
    // GET /list/ errors
    // -------------------------------------------------------------------------

    it('should return error when GET /list/ fails', async () => {
        const token = makeDaLiveToken();

        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
        });

        const result = await handleListDaLiveOrgs(context, { token });

        expect(result.success).toBe(false);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [],
            error: expect.stringContaining('401'),
        });
    });

    it('should return error when GET /list/ throws', async () => {
        const token = makeDaLiveToken();

        mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

        const result = await handleListDaLiveOrgs(context, { token });

        expect(result.success).toBe(false);
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-orgs-listed', {
            orgs: [],
            error: 'Connection refused',
        });
    });

    // -------------------------------------------------------------------------
    // Correct API calls
    // -------------------------------------------------------------------------

    it('should call GET /list/ with Bearer token', async () => {
        const token = makeDaLiveToken();

        mockFetch.mockResolvedValueOnce(mockOrgListResponse([]));

        await handleListDaLiveOrgs(context, { token });

        expect(mockFetch).toHaveBeenCalledWith(
            'https://admin.da.live/list/',
            expect.objectContaining({
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            }),
        );
    });

    it('should call HEAD /list/{org}/ for each org', async () => {
        const token = makeDaLiveToken();

        mockFetch
            .mockResolvedValueOnce(mockOrgListResponse(['org-a', 'org-b']))
            .mockResolvedValueOnce(mockHeadResponse('/=read,write'))
            .mockResolvedValueOnce(mockHeadResponse('/=read'));

        await handleListDaLiveOrgs(context, { token });

        // HEAD calls for each org
        expect(mockFetch).toHaveBeenCalledWith(
            'https://admin.da.live/list/org-a/',
            expect.objectContaining({ method: 'HEAD' }),
        );
        expect(mockFetch).toHaveBeenCalledWith(
            'https://admin.da.live/list/org-b/',
            expect.objectContaining({ method: 'HEAD' }),
        );
    });
});
