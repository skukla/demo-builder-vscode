/**
 * forgetProjectSecrets — a deleted project's secrets leave SecretStorage with it (2026-10-01).
 *
 * Driven against the real bundled catalogs: `components.json` declares the Commerce secrets
 * (ACCS_OAUTH_CLIENT_SECRET, ADOBE_COMMERCE_ADMIN_PASSWORD) and `app-builder-components.json`
 * gives demo-erp its screen key (ERP_SCREEN_KEY). The keys asserted are built by the same
 * key-scheme functions the writers use, so a scheme change cannot leave this test asserting
 * keys nothing writes. A Map stands in for SecretStorage.
 */

import { secretKey } from '@/features/app-builder/services/secretKey';
import { commerceSecretKey } from '@/features/components/services/commerceCredentialStore';
import { forgetProjectSecrets } from '@/features/projects-dashboard/services/projectSecretCleanup';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const PATH = '/projects/acme';

function storeOf(keys: string[]) {
    const map = new Map(keys.map((key) => [key, 'fake-test-pw-not-a-secret']));
    return { map, delete: jest.fn(async (key: string) => void map.delete(key)) };
}

const project = (): Project =>
    createMockProject({
        path: PATH,
        adobe: { organization: 'org', projectId: 'proj', workspace: 'ws-project' },
        componentConfigs: { 'adobe-commerce-accs': {} },
        appBuilderComponents: {
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                workspace: { id: 'ws-erp', name: 'ERP' },
            },
            'demo-erp': {
                kind: 'system',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'demo-erp' },
                workspace: { id: 'ws-erp', name: 'ERP' },
            },
        },
    });

const KEPT = [
    commerceSecretKey(PATH, 'adobe-commerce-accs', 'ACCS_OAUTH_CLIENT_SECRET'),
    commerceSecretKey(PATH, 'adobe-commerce-accs', 'ADOBE_COMMERCE_ADMIN_PASSWORD'),
    secretKey(PATH, 'demo-erp', 'ERP_SCREEN_KEY'),
    'demoBuilder.commerceRest.credential.ws-project',
    'demoBuilder.commerceRest.credential.ws-erp',
];

describe('forgetProjectSecrets', () => {
    it("deletes the project's Commerce secrets, its systems' screen keys and its kept REST credentials", async () => {
        const store = storeOf(KEPT);
        await forgetProjectSecrets(project(), store, jest.fn());
        expect([...store.map.keys()]).toStrictEqual([]);
    });

    it("leaves another project's secrets alone", async () => {
        const other = secretKey('/projects/other', 'demo-erp', 'ERP_SCREEN_KEY');
        const store = storeOf([...KEPT, other]);
        await forgetProjectSecrets(project(), store, jest.fn());
        expect([...store.map.keys()]).toStrictEqual([other]);
    });

    it('does nothing without SecretStorage or a project path', async () => {
        const store = storeOf(KEPT);
        await forgetProjectSecrets({ ...project(), path: '' }, store, jest.fn());
        expect(store.delete).not.toHaveBeenCalled();
        await expect(forgetProjectSecrets(project(), undefined, jest.fn())).resolves.toBeUndefined();
    });

    it('reports a kind that would not delete, by name only, and still deletes the rest', async () => {
        const store = storeOf(KEPT);
        store.delete.mockImplementation(async (key: string) => {
            if (key.includes('commerceRest')) throw new Error('keychain locked');
            store.map.delete(key);
        });
        const log = jest.fn();
        await forgetProjectSecrets(project(), store, log);
        expect(log).toHaveBeenCalledWith(
            "[Delete Project] Could not delete the project's Commerce REST credentials from SecretStorage",
        );
        expect(store.map.has(secretKey(PATH, 'demo-erp', 'ERP_SCREEN_KEY'))).toBe(false);
    });
});
