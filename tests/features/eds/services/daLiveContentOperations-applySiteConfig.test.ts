/**
 * DA.live Content Operations Tests — applySiteConfig
 *
 * Covers the AEM-Assets-panel fix: da.live's Library reads the
 * `aem.repositoryId` binding from the per-SITE config (/config/<org>/<site>),
 * not the org config. applySiteConfig writes the merged data sheet to the
 * site-scoped config URL while preserving ALL other sheets (the block library
 * lives in a `library` sheet, permissions in a `permissions` sheet — neither
 * may be clobbered by writing aem.repositoryId).
 *
 * Mirrors the applyOrgConfig harness: mock global.fetch, mock hasWriteAccess
 * from daLiveOrgOperations, same timeoutConfig/timeFormatting mocks, construct
 * DaLiveContentOperations directly.
 *
 * Test surface:
 *   - POST URL is /config/<org>/<site>, method POST, body carries aem.repositoryId
 *   - SHEET PRESERVATION: existing library + permissions sheets survive the write
 *   - 401 + hasWriteAccess(org)=true → creates fresh + POST happens; probe uses ORG
 *   - 401 + hasWriteAccess=false → no POST, returns failure
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

// applySiteConfig shares the 401 ownership-probe path with applyOrgConfig:
// org ownership governs site writes, so the probe is called with the ORG.
const mockHasWriteAccess = jest.fn();
jest.mock('@/features/eds/services/daLiveOrgOperations', () => ({
    hasWriteAccess: (...args: unknown[]) => mockHasWriteAccess(...args),
}));

describe('DaLiveContentOperations.applySiteConfig — site-scoped config write', () => {
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

    it('POSTs to the site-scoped config URL with the merged aem.repositoryId update', async () => {
        // GET /config/<org>/<site> → existing config with just a data sheet
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                ':version': 3,
                ':names': ['data'],
                ':type': 'multi-sheet',
                data: { total: 0, offset: 0, limit: 0, data: [] },
            }),
        });
        // POST → success
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({}),
        });

        const result = await service.applySiteConfig('leahrayard', 'leah-b2b-demo', {
            'aem.repositoryId': 'author-p158081-e1683323.adobeaemcloud.com',
        });

        expect(result.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(2);

        const postCall = mockFetch.mock.calls[1];
        expect(postCall[0]).toContain('/config/leahrayard/leah-b2b-demo');
        expect(postCall[1].method).toBe('POST');

        const formData = postCall[1].body as FormData;
        const configText = formData.get('config') as string;
        const configJson = JSON.parse(configText);
        const rows = configJson.data.data as Array<{ key: string; value: string }>;
        expect(rows).toContainEqual({
            key: 'aem.repositoryId',
            value: 'author-p158081-e1683323.adobeaemcloud.com',
        });
    });

    it('preserves the library and permissions sheets when writing aem.repositoryId (block library must NOT be clobbered)', async () => {
        // GET returns a multi-sheet config that already carries a `library`
        // sheet (the block library) AND a `permissions` sheet. Writing
        // aem.repositoryId into the data sheet must leave both intact.
        const librarySheet = {
            total: 1,
            offset: 0,
            limit: 1,
            data: [{ title: 'Blocks', path: '/.da/library/blocks' }],
        };
        const permissionsSheet = {
            total: 1,
            offset: 0,
            limit: 1,
            data: [{ path: '/**', groups: 'owner', actions: 'read,write' }],
        };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                ':version': 3,
                ':names': ['data', 'library', 'permissions'],
                ':type': 'multi-sheet',
                data: { total: 0, offset: 0, limit: 0, data: [] },
                library: librarySheet,
                permissions: permissionsSheet,
            }),
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({}),
        });

        const result = await service.applySiteConfig('leahrayard', 'leah-b2b-demo', {
            'aem.repositoryId': 'author-p158081-e1683323.adobeaemcloud.com',
        });

        expect(result.success).toBe(true);

        const postCall = mockFetch.mock.calls[1];
        const formData = postCall[1].body as FormData;
        const configJson = JSON.parse(formData.get('config') as string);

        // Both non-data sheets survive intact
        expect(configJson.library).toEqual(librarySheet);
        expect(configJson.permissions).toEqual(permissionsSheet);
        // The :names listing still references all three sheets
        expect(configJson[':names']).toEqual(['data', 'library', 'permissions']);
        // And the data sheet now carries the aem.repositoryId update
        const rows = configJson.data.data as Array<{ key: string; value: string }>;
        expect(rows).toContainEqual({
            key: 'aem.repositoryId',
            value: 'author-p158081-e1683323.adobeaemcloud.com',
        });
    });

    it('treats 401 as first-time-owner when org write access is confirmed and writes a fresh config (probe uses the ORG)', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: jest.fn(),
        });
        mockHasWriteAccess.mockResolvedValueOnce(true);
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({}),
        });

        const result = await service.applySiteConfig('leahrayard', 'leah-b2b-demo', {
            'aem.repositoryId': 'author-p158081-e1683323.adobeaemcloud.com',
        });

        expect(result.success).toBe(true);
        // Ownership governs site writes → probe must be called with the ORG
        expect(mockHasWriteAccess).toHaveBeenCalledWith('leahrayard', 'test-token');
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const postCall = mockFetch.mock.calls[1];
        expect(postCall[0]).toContain('/config/leahrayard/leah-b2b-demo');
        expect(postCall[1].method).toBe('POST');
    });

    it('refuses to write when 401 is returned and org write access is denied (no POST)', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: jest.fn(),
        });
        mockHasWriteAccess.mockResolvedValueOnce(false);

        const result = await service.applySiteConfig('some-other-org', 'their-site', {
            'aem.repositoryId': 'author-p158081-e1683323.adobeaemcloud.com',
        });

        expect(result.success).toBe(false);
        expect(mockFetch).toHaveBeenCalledTimes(1); // GET only, no POST
    });

    // ── removeKeys: symmetric clear of a stale row ───────────────────────────
    // Flipping a project back to Universal Editor without an IMS org id leaves
    // no editor.path to write — the stale Experience Workspace canvas row must
    // be DELETED, not merged. writeMergedDataConfig can only merge keys, so
    // applySiteConfig grew a 4th `removeKeys` param that deletes named keys from
    // the data sheet before the POST.

    it('deletes a key named in removeKeys from the POSTed data sheet while preserving other rows', async () => {
        // GET returns a data sheet that carries BOTH a stale editor.path (the EW
        // canvas) and an unrelated aem.repositoryId row that must survive.
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                ':version': 3,
                ':names': ['data'],
                ':type': 'multi-sheet',
                data: {
                    total: 2,
                    offset: 0,
                    limit: 2,
                    data: [
                        { key: 'editor.path', value: '/leahrayard/leah-b2b-demo=https://da.live/canvas#' },
                        { key: 'aem.repositoryId', value: 'author-p158081-e1683323.adobeaemcloud.com' },
                    ],
                },
            }),
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({}),
        });

        const result = await service.applySiteConfig(
            'leahrayard', 'leah-b2b-demo', {}, ['editor.path'],
        );

        expect(result.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(2); // GET then POST (removal changed the sheet)

        const postCall = mockFetch.mock.calls[1];
        const formData = postCall[1].body as FormData;
        const configJson = JSON.parse(formData.get('config') as string);
        const rows = configJson.data.data as Array<{ key: string; value: string }>;

        // editor.path is gone; aem.repositoryId survives.
        expect(rows.find(r => r.key === 'editor.path')).toBeUndefined();
        expect(rows).toContainEqual({
            key: 'aem.repositoryId',
            value: 'author-p158081-e1683323.adobeaemcloud.com',
        });
    });

    it('preserves non-data sheets when deleting a key via removeKeys', async () => {
        const permissionsSheet = {
            total: 1,
            offset: 0,
            limit: 1,
            data: [{ path: '/**', groups: 'owner', actions: 'read,write' }],
        };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                ':version': 3,
                ':names': ['data', 'permissions'],
                ':type': 'multi-sheet',
                data: {
                    total: 1,
                    offset: 0,
                    limit: 1,
                    data: [{ key: 'editor.path', value: '/leahrayard/leah-b2b-demo=https://da.live/canvas#' }],
                },
                permissions: permissionsSheet,
            }),
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({}),
        });

        const result = await service.applySiteConfig(
            'leahrayard', 'leah-b2b-demo', {}, ['editor.path'],
        );

        expect(result.success).toBe(true);
        const postCall = mockFetch.mock.calls[1];
        const configJson = JSON.parse((postCall[1].body as FormData).get('config') as string);
        expect(configJson.permissions).toEqual(permissionsSheet);
        const rows = configJson.data.data as Array<{ key: string; value: string }>;
        expect(rows.find(r => r.key === 'editor.path')).toBeUndefined();
    });

    it('no-ops (no POST) when updates is empty and the removeKey is absent from the existing sheet', async () => {
        // UE project that never had editor.path: removal changes nothing, so the
        // method must short-circuit BEFORE POSTing — no pointless write, no empty
        // config doc created where none existed. GET still happens; POST does not.
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                ':version': 3,
                ':names': ['data'],
                ':type': 'multi-sheet',
                data: {
                    total: 1,
                    offset: 0,
                    limit: 1,
                    data: [{ key: 'aem.repositoryId', value: 'author-x.adobeaemcloud.com' }],
                },
            }),
        });

        const result = await service.applySiteConfig(
            'leahrayard', 'leah-b2b-demo', {}, ['editor.path'],
        );

        expect(result.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(1); // GET only, NO POST
    });

    it('applies updates AND removeKeys in a single POST', async () => {
        // Combined call: write aem.repositoryId while clearing a stale editor.path.
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                ':version': 3,
                ':names': ['data'],
                ':type': 'multi-sheet',
                data: {
                    total: 1,
                    offset: 0,
                    limit: 1,
                    data: [{ key: 'editor.path', value: '/leahrayard/leah-b2b-demo=https://da.live/canvas#' }],
                },
            }),
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({}),
        });

        const result = await service.applySiteConfig(
            'leahrayard', 'leah-b2b-demo',
            { 'aem.repositoryId': 'author-p158081-e1683323.adobeaemcloud.com' },
            ['editor.path'],
        );

        expect(result.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const postCall = mockFetch.mock.calls[1];
        const configJson = JSON.parse((postCall[1].body as FormData).get('config') as string);
        const rows = configJson.data.data as Array<{ key: string; value: string }>;
        expect(rows.find(r => r.key === 'editor.path')).toBeUndefined();
        expect(rows).toContainEqual({
            key: 'aem.repositoryId',
            value: 'author-p158081-e1683323.adobeaemcloud.com',
        });
    });
});
