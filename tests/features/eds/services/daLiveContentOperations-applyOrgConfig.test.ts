/**
 * DA.live Content Operations Tests — applyOrgConfig 401 handling
 *
 * Covers the first-time-DA.live-user fix: when GET /config/<org>/ returns
 * 401 (because the config sheet has never been written for the user), the
 * code now probes write access via HEAD /list/<org>/ before treating the
 * 401 as "create fresh." Write-access confirmed → create fresh. Write
 * access denied → refuse, no skeleton config written (don't erase
 * someone else's permissions sheet).
 *
 * Test surface:
 *   - 401 + write access → POST happens with merged updates
 *   - 401 + no write access → returns failure, no POST
 *   - 401 + HEAD network failure → returns failure, no POST
 *   - 404 → unchanged (regression check for the existing "create fresh" path)
 */

import { DaLiveContentOperations, type TokenProvider } from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
    },
}));

jest.mock('@/core/utils/timeFormatting', () => ({
    formatDuration: jest.fn().mockReturnValue('0ms'),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// applyOrgConfig calls hasWriteAccess from daLiveOrgOperations on the 401
// branch. Mock it here so each test can control the write-access probe
// outcome independently of the GET/POST fetches.
const mockHasWriteAccess = jest.fn();
jest.mock('@/features/eds/services/daLiveOrgOperations', () => ({
    hasWriteAccess: (...args: unknown[]) => mockHasWriteAccess(...args),
}));

describe('DaLiveContentOperations.applyOrgConfig — 401 first-time-user handling', () => {
    let service: DaLiveContentOperations;
    let mockTokenProvider: TokenProvider;
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('test-token'),
        };

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        service = new DaLiveContentOperations(mockTokenProvider, mockLogger);
    });

    it('treats 401 as first-time-owner when write access is confirmed and writes a fresh config with the merged updates', async () => {
        // GET /config/<org>/ → 401 (config has never been written)
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: jest.fn(),
        });
        // HEAD /list/<org>/ → returns write access (the user IS the owner,
        // just first-time on /config/)
        mockHasWriteAccess.mockResolvedValueOnce(true);
        // POST /config/<org> → success
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({}),
        });

        const result = await service.applyOrgConfig('leahrayard', {
            'aem.repositoryId': 'author-p158081-e1683323.adobeaemcloud.com',
        });

        expect(result.success).toBe(true);
        expect(mockHasWriteAccess).toHaveBeenCalledWith('leahrayard', 'test-token');

        // Verify the POST happened (second fetch call) and included our merged update
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const postCall = mockFetch.mock.calls[1];
        expect(postCall[0]).toContain('/config/leahrayard');
        expect(postCall[1].method).toBe('POST');

        // POST body is FormData where `config` is appended as a JSON string
        // (formData.append('config', JSON.stringify(configData))). Reading it
        // back gives the string directly.
        const formData = postCall[1].body as FormData;
        const configText = formData.get('config') as string;
        const configJson = JSON.parse(configText);
        const rows = configJson.data.data as Array<{ key: string; value: string }>;
        expect(rows).toContainEqual({
            key: 'aem.repositoryId',
            value: 'author-p158081-e1683323.adobeaemcloud.com',
        });
    });

    it('refuses to write skeleton config when 401 is returned and write access is denied (prevents erasing a permissions sheet on an org someone else owns)', async () => {
        // GET → 401
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: jest.fn(),
        });
        // HEAD → no write access
        mockHasWriteAccess.mockResolvedValueOnce(false);

        const result = await service.applyOrgConfig('some-other-org', {
            'aem.repositoryId': 'author-p158081-e1683323.adobeaemcloud.com',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('401');
        expect(result.error).toContain('ownership');
        expect(result.error).toContain('some-other-org');

        // No POST happened — only the one GET
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('refuses to write when the HEAD probe itself fails (safe-by-default — the helper returns false on network errors)', async () => {
        // GET → 401
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: jest.fn(),
        });
        // hasWriteAccess returns false on any network error (per its
        // signature — wraps a try/catch). Simulate that directly.
        mockHasWriteAccess.mockResolvedValueOnce(false);

        const result = await service.applyOrgConfig('leahrayard', {
            'aem.repositoryId': 'author-p158081-e1683323.adobeaemcloud.com',
        });

        expect(result.success).toBe(false);
        expect(mockFetch).toHaveBeenCalledTimes(1); // GET only, no POST
    });

    it('regression check: 404 still creates fresh config without invoking the write-access probe (unchanged behavior)', async () => {
        // GET → 404 (existing branch, predates this fix)
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: jest.fn(),
        });
        // POST → success
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({}),
        });

        const result = await service.applyOrgConfig('skukla', {
            'aem.repositoryId': 'author-p158081-e1683323.adobeaemcloud.com',
        });

        expect(result.success).toBe(true);
        // 404 path does NOT need the write-access probe — the original code's
        // comment ("safe to create fresh — no permissions to lose") justifies
        // the skip. This regression check pins that behavior.
        expect(mockHasWriteAccess).not.toHaveBeenCalled();
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });
});
