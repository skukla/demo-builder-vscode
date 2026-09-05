/**
 * How the four config wrappers CLASSIFY a failure.
 *
 * `getOrgConfig`, `updateOrgConfig`, `getConfig` and `updateConfig` each wrap
 * their body in a catch that asks one question: is this our own "Failed to
 * read/update" error, or something the transport raised? Ours is rethrown
 * untouched; anything else is re-wrapped as `Config API error: …`. The
 * distinction is what the callers above see, and nothing constrained it — a
 * catch that wrapped everything would bury the HTTP status inside a second
 * message, and one that wrapped nothing would surface a raw abort where a
 * config error was expected.
 *
 * The assertions are ANCHORED regexes on purpose. `toThrow('Failed to read
 * config')` matches a message that has been wrapped in `Config API error: …`
 * too, so the substring form cannot tell the two branches apart at all.
 *
 * `sleep` is mocked: fetchWithRetry backs off between attempts on a 5xx, and
 * these tests drive several.
 */

import {
    DaLiveConfigService,
    mockFetch,
    setupConfigService,
    testOrg,
    testSite,
    testToken,
    type MultiSheetConfig,
} from './daLiveConfigService.testUtils';

jest.mock('@/core/utils/sleep');

const emptyConfig: MultiSheetConfig = {
    ':names': ['permissions'],
    ':version': 3,
    ':type': 'multi-sheet',
};

/** A failing HTTP response, with the empty body DA.live sends on a config error. */
const httpError = (status: number, statusText: string) => ({
    ok: false,
    status,
    statusText,
    text: jest.fn().mockResolvedValue(''),
});

describe('DaLiveConfigService — the org-level config request', () => {
    let service: DaLiveConfigService;

    beforeEach(() => {
        ({ service } = setupConfigService());
    });

    it('GETs the ORG path — permissions live there, not under the site', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue(emptyConfig),
        });

        await service.getOrgConfig(testOrg);

        expect(mockFetch).toHaveBeenCalledWith(
            `https://admin.da.live/config/${testOrg}/`,
            expect.objectContaining({
                method: 'GET',
                headers: { Authorization: `Bearer ${testToken}` },
            }),
        );
    });

    it('answers null when the org has no config yet', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });

        await expect(service.getOrgConfig(testOrg)).resolves.toBeNull();
    });

    it('PUTs the ORG path with the bearer', async () => {
        mockFetch.mockResolvedValue({ ok: true, status: 200 });

        await service.updateOrgConfig(testOrg, emptyConfig);

        expect(mockFetch).toHaveBeenCalledWith(
            `https://admin.da.live/config/${testOrg}/`,
            expect.objectContaining({
                method: 'PUT',
                headers: { Authorization: `Bearer ${testToken}` },
            }),
        );
    });
});

/**
 * Each row: the operation, and the message it must raise UNWRAPPED for an HTTP
 * failure. Anchored, so a `Config API error:` prefix fails the match.
 */
describe('an HTTP failure surfaces as its own error, not wrapped', () => {
    let service: DaLiveConfigService;

    beforeEach(() => {
        ({ service } = setupConfigService());
    });

    it('getOrgConfig', async () => {
        mockFetch.mockResolvedValue(httpError(500, 'Internal Server Error'));

        await expect(service.getOrgConfig(testOrg)).rejects.toThrow(
            /^Failed to read org config: 500 Internal Server Error$/,
        );
    });

    it('updateOrgConfig', async () => {
        mockFetch.mockResolvedValue(httpError(403, 'Forbidden'));

        await expect(service.updateOrgConfig(testOrg, emptyConfig)).rejects.toThrow(
            /^Failed to update org config: 403 Forbidden$/,
        );
    });

    it('getConfig', async () => {
        mockFetch.mockResolvedValue(httpError(500, 'Internal Server Error'));

        await expect(service.getConfig(testOrg, testSite)).rejects.toThrow(
            /^Failed to read config: 500 Internal Server Error$/,
        );
    });

    it('updateConfig', async () => {
        mockFetch.mockResolvedValue(httpError(403, 'Forbidden'));

        await expect(service.updateConfig(testOrg, testSite, emptyConfig)).rejects.toThrow(
            /^Failed to update config: 403 Forbidden$/,
        );
    });
});

/**
 * The other half of the same fork: a transport failure is not ours, so it gets
 * the `Config API error:` prefix that tells the reader the request never got an
 * answer at all.
 */
describe('a transport failure is re-wrapped', () => {
    let service: DaLiveConfigService;

    beforeEach(() => {
        ({ service } = setupConfigService());
        mockFetch.mockRejectedValue(new Error('socket hang up'));
    });

    it('getOrgConfig', async () => {
        await expect(service.getOrgConfig(testOrg)).rejects.toThrow(
            /^Config API error: Network error: socket hang up$/,
        );
    });

    it('updateOrgConfig', async () => {
        await expect(service.updateOrgConfig(testOrg, emptyConfig)).rejects.toThrow(
            /^Config API error: Network error: socket hang up$/,
        );
    });

    it('getConfig', async () => {
        await expect(service.getConfig(testOrg, testSite)).rejects.toThrow(
            /^Config API error: Network error: socket hang up$/,
        );
    });

    it('updateConfig', async () => {
        await expect(service.updateConfig(testOrg, testSite, emptyConfig)).rejects.toThrow(
            /^Config API error: Network error: socket hang up$/,
        );
    });
});
