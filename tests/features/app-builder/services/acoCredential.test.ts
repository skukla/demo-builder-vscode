/**
 * Demo Builder makes the project's ACO credential itself (PL-60 P2): ACO's two APIs asked for by
 * code, subscribed on the workspace credential through the one spine, the pair kept in SecretStorage; and removed in reverse, refused while an ACO pack it
 * loaded is still in the instance.
 */

import {
    ACO_ADMIN_API,
    ACO_INGESTION_API,
    removeAcoCredential,
    setUpAcoCredential,
    type AcoCredentialDeps,
} from '@/features/app-builder/services/acoCredential';
import type { OrgServiceInfo } from '@/features/authentication/services/types';
import { acoCredentialKey } from '@/features/components/services/acoCredentialStore';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const ACO_ROW: OrgServiceInfo = { code: 'ACO-Ingestion', name: 'Adobe Commerce Optimizer Ingestion', type: 'entp' };
const ADMIN_ROW: OrgServiceInfo = { code: 'ACO-Admin', name: 'Adobe Commerce Optimizer Admin', type: 'entp' };
const CREDENTIAL = { clientId: 'client-1', clientSecret: 'fake-test-pw-not-a-secret' };

function deps(overrides: Partial<AcoCredentialDeps> = {}) {
    const { secrets, store } = createMockSecretStorage();
    const setAcoApis = jest.fn(async (_codes: string[]) => ({ success: true }));
    const all: AcoCredentialDeps = {
        listOrgServices: async () => [ACO_ROW, ADMIN_ROW],
        setAcoApis,
        readCredential: async () => CREDENTIAL,
        secrets,
        projectPath: '/projects/a',
        ...overrides,
    };
    return { deps: all, store, setAcoApis: all.setAcoApis as jest.Mock };
}

describe('setUpAcoCredential', () => {
    it('asks for both APIs by code, subscribes them, then keeps the pair in SecretStorage', async () => {
        const listOrgServices = jest.fn(async () => [ACO_ROW, ADMIN_ROW]);
        const { deps: d, store, setAcoApis } = deps({ listOrgServices });
        await expect(setUpAcoCredential(d)).resolves.toEqual({ success: true, apiCode: 'ACO-Ingestion', adminApiCode: 'ACO-Admin' });
        expect(listOrgServices).toHaveBeenCalledWith([ACO_INGESTION_API, ACO_ADMIN_API]);
        expect(setAcoApis).toHaveBeenCalledWith(['ACO-Ingestion', 'ACO-Admin']);
        expect(JSON.parse(store.get(acoCredentialKey('/projects/a')) ?? '{}')).toEqual(CREDENTIAL);
    });

    it('says the org offers no ACO API, and subscribes nothing', async () => {
        const { deps: d, setAcoApis, store } = deps({ listOrgServices: async () => [] });
        const result = await setUpAcoCredential(d);
        expect(result).toEqual({ success: false, error: expect.stringMatching(/offers no Adobe Commerce Optimizer Ingestion API/u) });
        expect(setAcoApis).not.toHaveBeenCalled();
        expect(store.size).toBe(0);
    });

    it('still subscribes ingestion when the org does not offer the admin API', async () => {
        const { deps: d, setAcoApis } = deps({ listOrgServices: async () => [ACO_ROW] });
        await expect(setUpAcoCredential(d)).resolves.toEqual({ success: true, apiCode: 'ACO-Ingestion' });
        expect(setAcoApis).toHaveBeenCalledWith(['ACO-Ingestion']);
    });

    it('keeps nothing when the subscribe is refused', async () => {
        const { deps: d, store } = deps({ setAcoApis: async () => ({ success: false, error: 'needs a product profile' }) });
        await expect(setUpAcoCredential(d)).resolves.toEqual({ success: false, error: 'needs a product profile' });
        expect(store.size).toBe(0);
    });

    it('says why when the credential cannot be read', async () => {
        const { deps: d } = deps({ readCredential: async () => Promise.reject(new Error('no secret on the credential')) });
        await expect(setUpAcoCredential(d)).resolves.toEqual({ success: false, error: 'Could not set up the ACO credential: no secret on the credential' });
    });
});

describe('removeAcoCredential', () => {
    it('takes the API off the credential and forgets the pair', async () => {
        const { deps: d, store, setAcoApis } = deps();
        store.set(acoCredentialKey('/projects/a'), JSON.stringify(CREDENTIAL));
        await expect(removeAcoCredential(d, [])).resolves.toEqual({ success: true });
        expect(setAcoApis).toHaveBeenCalledWith([]);
        expect(store.size).toBe(0);
    });

    it('refuses while an ACO pack it loaded is still in the instance, naming it, and touches nothing', async () => {
        const { deps: d, store, setAcoApis } = deps();
        store.set(acoCredentialKey('/projects/a'), JSON.stringify(CREDENTIAL));
        const result = await removeAcoCredential(d, ['aco_wknd@main']);
        expect(result).toEqual({ success: false, error: expect.stringMatching(/Remove the ACO packs Demo Builder loaded first \(aco_wknd@main\)/u) });
        expect(setAcoApis).not.toHaveBeenCalled();
        expect(store.size).toBe(1);
    });

    it('keeps the pair when Adobe refuses the unsubscribe', async () => {
        const { deps: d, store } = deps({ setAcoApis: async () => ({ success: false, error: 'Console said no' }) });
        store.set(acoCredentialKey('/projects/a'), JSON.stringify(CREDENTIAL));
        await expect(removeAcoCredential(d, [])).resolves.toEqual({ success: false, error: 'Console said no' });
        expect(store.size).toBe(1);
    });
});
