import { DaLiveConfigOperations } from '@/features/eds/services/daLiveConfigOperations';

const makeLogger = () =>
    ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) as never;

const makeApiClient = () =>
    ({
        getImsToken: jest.fn().mockResolvedValue('tok-123'),
        fetchWithRetry: jest.fn(),
        createErrorFromResponse: jest.fn(),
    }) as never;

describe('DaLiveConfigOperations.updateSiteConfig', () => {
    let fetchMock: jest.SpyInstance;

    beforeEach(() => {
        fetchMock = jest.spyOn(global, 'fetch');
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

    it('starts fresh when there is no existing config', async () => {
        fetchMock
            .mockResolvedValueOnce({ ok: false } as Response) // GET: no existing config
            .mockResolvedValueOnce({ ok: true } as Response); // POST ok

        const ops = new DaLiveConfigOperations(makeApiClient(), makeLogger());
        await expect(ops.updateSiteConfig('org', 'site', entries)).resolves.toEqual({
            success: true,
        });
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
