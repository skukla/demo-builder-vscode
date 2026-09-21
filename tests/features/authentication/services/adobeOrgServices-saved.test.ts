/**
 * AdobeOrgServices — the org's API list survives a window reload.
 *
 * The list used to live in memory only, so every reload threw it away and the
 * next Manage APIs waited on Adobe's full list again. On 2026-09-21 that wait hit
 * Adobe's 60s gateway cutoff twice in a row straight after a reload. Now each
 * successful load is saved (production passes `context.globalState`), and a new
 * session answers from the saved copy at once — refreshing it behind the answer
 * when it is old, exactly as the in-memory copy already did.
 */

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { makeService, memoryStore, SERVICES } from './adobeOrgServices.testUtils';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';

const KEY = 'demoBuilder.orgServicesCatalog.org-1';

describe('AdobeOrgServices — the saved API list', () => {
    let nowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
        jest.clearAllMocks();
        nowSpy = jest.spyOn(Date, 'now').mockReturnValue(5_000);
    });
    afterEach(() => nowSpy.mockRestore());

    it('saves a successful load, with when it was fetched, under the org', async () => {
        const store = memoryStore();
        const { service, client } = makeService(true, store.store);
        client.getServicesForOrg.mockResolvedValue({ body: SERVICES });

        await service.getServicesForOrg('org-1');

        expect(store.update).toHaveBeenCalledWith(KEY, { services: SERVICES, fetchedAt: 5_000 });
    });

    it('never saves an empty list', async () => {
        const store = memoryStore();
        const { service, client } = makeService(true, store.store);
        client.getServicesForOrg.mockResolvedValue({ body: [] });

        await service.getServicesForOrg('org-1');

        expect(store.update).not.toHaveBeenCalled();
    });

    it('answers a new session from the saved copy without asking Adobe', async () => {
        const store = memoryStore({ [KEY]: { services: SERVICES, fetchedAt: 4_000 } });
        const { service, client } = makeService(true, store.store);

        await expect(service.getServicesForOrg('org-1')).resolves.toEqual(SERVICES);
        expect(client.getServicesForOrg).not.toHaveBeenCalled();
    });

    it('answers an old saved copy at once, and starts one refresh behind it', async () => {
        const store = memoryStore({ [KEY]: { services: SERVICES, fetchedAt: 1_000 } });
        const { service, client } = makeService(true, store.store);
        client.getServicesForOrg.mockReturnValue(new Promise(() => undefined));
        nowSpy.mockReturnValue(1_000 + CACHE_TTL.ORG_SERVICES);

        await expect(service.getServicesForOrg('org-1')).resolves.toEqual(SERVICES);
        await service.getServicesForOrg('org-1');
        expect(client.getServicesForOrg).toHaveBeenCalledTimes(1);
        expect(client.getServicesForOrg.mock.calls[0][0]).toBe('org-1');
    });

    it("reads only the asked org's copy", async () => {
        const store = memoryStore({ [KEY]: { services: SERVICES, fetchedAt: 4_000 } });
        const { service, client } = makeService(true, store.store);
        client.getServicesForOrg.mockResolvedValue({ body: [{ code: 'Other' }] });

        await expect(service.getServicesForOrg('org-2')).resolves.toEqual([{ code: 'Other' }]);
        expect(store.get).toHaveBeenCalledWith('demoBuilder.orgServicesCatalog.org-2');
    });

    it.each([
        ['an empty list', { services: [], fetchedAt: 4_000 }],
        ['no timestamp', { services: SERVICES }],
        ['not a list', { services: 'nope', fetchedAt: 4_000 }],
        ['nothing like the shape', 'garbage'],
    ])('ignores a saved value with %s, and fetches instead', async (_label, saved) => {
        const store = memoryStore({ [KEY]: saved });
        const { service, client } = makeService(true, store.store);
        client.getServicesForOrg.mockResolvedValue({ body: SERVICES });

        await expect(service.getServicesForOrg('org-1')).resolves.toEqual(SERVICES);
        expect(client.getServicesForOrg).toHaveBeenCalledTimes(1);
    });

    it('still answers the load when saving it fails', async () => {
        const store = memoryStore();
        store.update.mockRejectedValue(new Error('disk full'));
        const { service, client } = makeService(true, store.store);
        client.getServicesForOrg.mockResolvedValue({ body: SERVICES });

        await expect(service.getServicesForOrg('org-1')).resolves.toEqual(SERVICES);
    });
});
