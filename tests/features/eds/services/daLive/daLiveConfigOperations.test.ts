import { DaLiveConfigOperations } from '@/features/eds/services/daLive/daLiveConfigOperations';
import { createMockLogger } from '../../../../helpers/loggerFake';

const makeLogger = () =>
    createMockLogger() as never;

const makeApiClient = () =>
    ({
        getImsToken: jest.fn().mockResolvedValue('tok-123'),
        // Faithful fake: delegate to global fetch (which the suite mocks) and
        // resolve the per-attempt request factory the real client supports —
        // so the existing fetchMock sequences and body assertions keep pinning
        // the actual wire calls.
        fetchWithRetry: jest.fn((url: string, options: unknown) =>
            global.fetch(
                url,
                typeof options === 'function'
                    ? (options as () => RequestInit)()
                    : (options as RequestInit),
            ),
        ),
        createErrorFromResponse: jest.fn(),
    }) as never;

// updateSiteConfig shares the 401 ownership-probe path with applySiteConfig:
// org ownership governs site writes, so the probe is called with the ORG.
const mockHasWriteAccess = jest.fn();
jest.mock('@/features/eds/services/daLive/daLiveOrgOperations', () => ({
    hasWriteAccess: (...args: unknown[]) => mockHasWriteAccess(...args),
}));

describe('DaLiveConfigOperations.updateSiteConfig', () => {
    let fetchMock: jest.SpyInstance;

    beforeEach(() => {
        fetchMock = jest.spyOn(global, 'fetch');
        mockHasWriteAccess.mockReset();
    });
    afterEach(() => jest.restoreAllMocks());

    const entries = [{ title: 'Blocks', path: '/blocks/library' }];

    it('preserves existing config and POSTs the library sheet, returning success', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { existing: true } }),
            } as Response)
            .mockResolvedValueOnce({ ok: true } as Response);

        const ops = new DaLiveConfigOperations(makeApiClient(), makeLogger());
        const result = await ops.updateSiteConfig('org', 'site', entries);

        expect(result).toEqual({ success: true });
        // GET existing config, then POST the merged config
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const postBody = (fetchMock.mock.calls[1][1] as RequestInit).body as FormData;
        const posted = JSON.parse(postBody.get('config') as string);
        expect(posted.library.data).toHaveLength(1);
        expect(posted.library.data[0]).toMatchObject({ title: 'Blocks', path: '/blocks/library' });
    });

    it('creates fresh config on 404 (no existing config to preserve) and POSTs', async () => {
        fetchMock
            .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // GET: no config yet
            .mockResolvedValueOnce({ ok: true } as Response); // POST ok

        const ops = new DaLiveConfigOperations(makeApiClient(), makeLogger());
        await expect(ops.updateSiteConfig('org', 'site', entries)).resolves.toEqual({
            success: true,
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('refuses to write (no POST) when the config GET fails with a network error', async () => {
        // Fail-closed: a transient GET error must NOT trigger a skeleton write that
        // could drop existing sheets (e.g. permissions).
        fetchMock.mockRejectedValueOnce(new Error('socket hang up'));

        const ops = new DaLiveConfigOperations(makeApiClient(), makeLogger());
        const result = await ops.updateSiteConfig('org', 'site', entries);

        expect(result.success).toBe(false);
        expect(result.error).toContain('socket hang up');
        expect(fetchMock).toHaveBeenCalledTimes(1); // GET only, NO POST
    });

    it('refuses to write (no POST) on a non-404/401 read error', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Server Error',
        } as Response);

        const ops = new DaLiveConfigOperations(makeApiClient(), makeLogger());
        const result = await ops.updateSiteConfig('org', 'site', entries);

        expect(result.success).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1); // GET only, NO POST
    });

    it('refuses to write when 401 is returned and org write access is denied (no POST)', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
        mockHasWriteAccess.mockResolvedValueOnce(false);

        const ops = new DaLiveConfigOperations(makeApiClient(), makeLogger());
        const result = await ops.updateSiteConfig('some-other-org', 'their-site', entries);

        expect(result.success).toBe(false);
        expect(mockHasWriteAccess).toHaveBeenCalledWith('some-other-org', 'tok-123');
        expect(fetchMock).toHaveBeenCalledTimes(1); // GET only, NO POST
    });

    it('treats 401 as first-time-owner when org write access is confirmed and writes fresh (probe uses the ORG)', async () => {
        fetchMock
            .mockResolvedValueOnce({ ok: false, status: 401 } as Response)
            .mockResolvedValueOnce({ ok: true } as Response);
        mockHasWriteAccess.mockResolvedValueOnce(true);

        const ops = new DaLiveConfigOperations(makeApiClient(), makeLogger());
        const result = await ops.updateSiteConfig('org', 'site', entries);

        expect(result.success).toBe(true);
        expect(mockHasWriteAccess).toHaveBeenCalledWith('org', 'tok-123');
        expect(fetchMock).toHaveBeenCalledTimes(2); // GET then POST
    });

    it('preserves an existing permissions sheet and lists it in :names when writing the library (no clobber)', async () => {
        const permissionsSheet = {
            total: 1,
            offset: 0,
            limit: 1,
            data: [{ path: '/**', groups: 'owner', actions: 'read,write' }],
        };
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ':version': 3,
                    ':names': ['data', 'permissions'],
                    ':type': 'multi-sheet',
                    data: { total: 0, offset: 0, limit: 0, data: [] },
                    permissions: permissionsSheet,
                }),
            } as Response)
            .mockResolvedValueOnce({ ok: true } as Response);

        const ops = new DaLiveConfigOperations(makeApiClient(), makeLogger());
        const result = await ops.updateSiteConfig('org', 'site', entries);

        expect(result.success).toBe(true);
        const postBody = (fetchMock.mock.calls[1][1] as RequestInit).body as FormData;
        const posted = JSON.parse(postBody.get('config') as string);

        // The permissions sheet survives intact...
        expect(posted.permissions).toEqual(permissionsSheet);
        // ...and :names lists it alongside data + the newly-written library.
        expect(posted[':names']).toEqual(
            expect.arrayContaining(['data', 'permissions', 'library'])
        );
        // The library sheet was written.
        expect(posted.library.data).toHaveLength(1);
    });

    it('returns failure when the POST is rejected', async () => {
        fetchMock
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
            .mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' } as Response);

        const ops = new DaLiveConfigOperations(makeApiClient(), makeLogger());
        const result = await ops.updateSiteConfig('org', 'site', entries);

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it('returns failure when the POST throws', async () => {
        fetchMock
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
            .mockRejectedValueOnce(new Error('network down'));

        const ops = new DaLiveConfigOperations(makeApiClient(), makeLogger());
        const result = await ops.updateSiteConfig('org', 'site', entries);

        expect(result.success).toBe(false);
        expect(result.error).toContain('network down');
    });
});
