/**
 * Demo Builder makes the project's ACO ingestion credential itself (PL-60 P2): the ACO ingestion API
 * found by name in the org's own service list, subscribed on the workspace credential through the
 * one spine, the pair kept in SecretStorage; and removed in reverse, refused while an ACO pack it
 * loaded is still in the instance.
 */

import {
    findAcoIngestionApi,
    removeAcoCredential,
    setUpAcoCredential,
    type AcoCredentialDeps,
} from '@/features/app-builder/services/acoCredential';
import type { OrgServiceInfo } from '@/features/authentication/services/types';
import { acoCredentialKey } from '@/features/components/services/acoCredentialStore';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const ACO_ROW: OrgServiceInfo = { code: 'AcoIngestionCode', name: 'Adobe Commerce Optimizer Ingestion API', type: 'entp', enabled: true };
const OTHER: OrgServiceInfo = { code: 'GraphQLServiceSDK', name: 'API Mesh', enabled: true };
const CREDENTIAL = { clientId: 'client-1', clientSecret: 'fake-test-pw-not-a-secret' };

function deps(overrides: Partial<AcoCredentialDeps> = {}) {
    const { secrets, store } = createMockSecretStorage();
    const setAcoApis = jest.fn(async (_codes: string[]) => ({ success: true }));
    const all: AcoCredentialDeps = {
        listOrgServices: async () => [OTHER, ACO_ROW],
        setAcoApis,
        readCredential: async () => CREDENTIAL,
        secrets,
        projectPath: '/projects/a',
        ...overrides,
    };
    return { deps: all, store, setAcoApis: all.setAcoApis as jest.Mock };
}

describe('findAcoIngestionApi', () => {
    it('finds the API by its documented name, preferring the server-to-server row', () => {
        const adobeId = { ...ACO_ROW, type: 'adobeid' };
        expect(findAcoIngestionApi([OTHER, adobeId, ACO_ROW])).toBe(ACO_ROW);
        expect(findAcoIngestionApi([adobeId])).toBe(adobeId);
    });

    it('matches the name loosely, but not a disabled row or another API', () => {
        expect(findAcoIngestionApi([{ code: 'x', name: 'Commerce Optimizer Ingestion' }])?.code).toBe('x');
        expect(findAcoIngestionApi([{ ...ACO_ROW, enabled: false }, OTHER])).toBeUndefined();
        expect(findAcoIngestionApi([{ code: 'y', name: 'Adobe Commerce Optimizer Merchandising' }])).toBeUndefined();
    });
});

describe('setUpAcoCredential', () => {
    it('subscribes the API it found, then keeps the credential\'s pair in SecretStorage', async () => {
        const { deps: d, store, setAcoApis } = deps();
        await expect(setUpAcoCredential(d)).resolves.toEqual({ success: true, apiCode: 'AcoIngestionCode' });
        expect(setAcoApis).toHaveBeenCalledWith(['AcoIngestionCode']);
        expect(JSON.parse(store.get(acoCredentialKey('/projects/a')) ?? '{}')).toEqual(CREDENTIAL);
    });

    it('says the org offers no ACO API, and subscribes nothing', async () => {
        const { deps: d, setAcoApis, store } = deps({ listOrgServices: async () => [OTHER] });
        const result = await setUpAcoCredential(d);
        expect(result).toEqual({ success: false, error: expect.stringMatching(/offers no "Adobe Commerce Optimizer Ingestion API"/u) });
        expect(setAcoApis).not.toHaveBeenCalled();
        expect(store.size).toBe(0);
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
