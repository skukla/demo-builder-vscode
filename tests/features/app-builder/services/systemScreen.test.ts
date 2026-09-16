/**
 * systemScreen — the ERP's screen key and link. Driven against the shared
 * SecretStorage fake, so what is asserted is what a real store would hold.
 */

import {
    deriveScreenUrl,
    ensureScreenKeyEnv,
    forgetScreenKey,
    readScreenKey,
    screenLink,
} from '@/features/app-builder/services/systemScreen';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const ERP: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
    screen: { action: 'screen', keyEnvVar: 'ERP_SCREEN_KEY' },
};
const PLAIN: AppBuilderComponentCatalogEntry = { ...ERP, id: 'plain', screen: undefined };
const KEY_NAME = 'demoBuilder.appBuilderComponentSecret./proj.demo-erp.ERP_SCREEN_KEY';

describe('the screen key', () => {
    it('is generated once, stored under the component secret scheme, and reused on redeploy', async () => {
        const { secrets, store } = createMockSecretStorage();

        const first = await ensureScreenKeyEnv(secrets, '/proj', ERP);
        const second = await ensureScreenKeyEnv(secrets, '/proj', ERP);

        expect(Object.keys(first)).toEqual(['ERP_SCREEN_KEY']);
        // 32 random bytes, base64url: 43 URL-safe characters.
        expect(first.ERP_SCREEN_KEY).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(second).toEqual(first);
        expect([...store.entries()]).toEqual([[KEY_NAME, first.ERP_SCREEN_KEY]]);
    });

    it('differs between projects', async () => {
        const { secrets } = createMockSecretStorage();

        const a = await ensureScreenKeyEnv(secrets, '/a', ERP);
        const b = await ensureScreenKeyEnv(secrets, '/b', ERP);

        expect(a.ERP_SCREEN_KEY).not.toBe(b.ERP_SCREEN_KEY);
    });

    it('is nothing for a component without a screen, and nothing is stored', async () => {
        const { secrets, store } = createMockSecretStorage();

        expect(await ensureScreenKeyEnv(secrets, '/proj', PLAIN)).toStrictEqual({});
        expect(await readScreenKey(secrets, '/proj', PLAIN)).toBeUndefined();
        await forgetScreenKey(secrets, '/proj', PLAIN);
        expect(store.size).toBe(0);
        expect(secrets.delete).not.toHaveBeenCalled();
    });

    it('reads back what was stored, and nothing after it is forgotten', async () => {
        const { secrets, store } = createMockSecretStorage({ [KEY_NAME]: 'stored-key' });

        expect(await readScreenKey(secrets, '/proj', ERP)).toBe('stored-key');
        await forgetScreenKey(secrets, '/proj', ERP);

        expect(store.size).toBe(0);
        expect(await readScreenKey(secrets, '/proj', ERP)).toBeUndefined();
    });
});

describe('deriveScreenUrl', () => {
    const NS = 'https://ns.adobeioruntime.net/api/v1';

    it('picks the web URL of the declared action', () => {
        const urls = {
            'runtime/demo-erp/events-retry': `${NS}/demo-erp/events-retry`,
            'runtime/demo-erp/health': `${NS}/web/demo-erp/health`,
            'runtime/demo-erp/screen': `${NS}/web/demo-erp/screen`,
        };

        expect(deriveScreenUrl(ERP, urls)).toBe(`${NS}/web/demo-erp/screen`);
    });

    it('ignores a non-web action of that name and an action that merely ends in the same letters', () => {
        const urls = {
            'runtime/demo-erp/screen': `${NS}/demo-erp/screen`,
            'runtime/demo-erp/splash-screen': `${NS}/web/demo-erp/splash-screen`,
        };

        expect(deriveScreenUrl(ERP, urls)).toBeUndefined();
    });

    it('is undefined without URLs or without a screen', () => {
        expect(deriveScreenUrl(ERP, undefined)).toBeUndefined();
        expect(deriveScreenUrl(PLAIN, { a: `${NS}/web/demo-erp/screen` })).toBeUndefined();
    });
});

describe('screenLink', () => {
    it('ends the address in a slash, so the page finds its assets, and encodes the key', () => {
        expect(screenLink('https://ns.example/screen', 'a+b/c')).toBe('https://ns.example/screen/?key=a%2Bb%2Fc');
        expect(screenLink('https://ns.example/screen/', 'k')).toBe('https://ns.example/screen/?key=k');
    });
});
