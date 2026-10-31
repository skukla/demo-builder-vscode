/**
 * The doors to the project's ACO ingestion credential (PL-60 P2), driven through the same mocked
 * subscription spine the Console API handlers use: the guard chain first, the ACO API subscribed
 * under the add-on's own owner key so every later reconcile keeps it, the pair kept in
 * SecretStorage; and the reverse.
 */

import type { HandlerContext } from '@/types/handlers';
import { acoCredentialKey } from '@/features/components/services/acoCredentialStore';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Project } from '@/types/base';
import {
    applyAcoAddonChange,
    ErrorCode,
    consoleApiContext,
    consoleApiProject,
    handleRemoveAcoCredential,
    handleSetUpAcoCredential,
    runGuards,
    subscribeRequiredApis,
} from './consoleApiHandlers.testUtils';

function contextWithSecrets(project: object | null) {
    const context = consoleApiContext(project);
    const { secrets, store } = createMockSecretStorage();
    (context.context as unknown as { secrets: unknown }).secrets = secrets;
    return { context: context as HandlerContext, store };
}

beforeEach(() => jest.clearAllMocks());

describe('handleSetUpAcoCredential', () => {
    it('subscribes the ACO ingestion API under the add-on\'s owner key and keeps the pair', async () => {
        const project = consoleApiProject();
        const { context, store } = contextWithSecrets(project);

        const result = await handleSetUpAcoCredential(context, undefined);

        expect(result).toEqual({ success: true, apiCode: 'AcoIngestionCode' });
        expect(subscribeRequiredApis).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.anything(),
            ['AcoIngestionCode'],
            undefined,
            [],
            expect.anything(),
        );
        expect(project.componentApiPicks).toEqual({ 'adobe-commerce-aco': ['AcoIngestionCode'] });
        expect(JSON.parse(store.get(acoCredentialKey('/projects/demo')) ?? '{}')).toEqual({
            clientId: 'client-1',
            clientSecret: 'fake-test-pw-not-a-secret',
        });
    });

    it('stops at the guard chain, touching nothing', async () => {
        (runGuards as jest.Mock).mockResolvedValueOnce({ error: 'wrong org', code: ErrorCode.ORG_MISMATCH });
        const { context, store } = contextWithSecrets(consoleApiProject());
        await expect(handleSetUpAcoCredential(context, undefined)).resolves.toEqual({ success: false, error: 'wrong org', code: ErrorCode.ORG_MISMATCH });
        expect(subscribeRequiredApis).not.toHaveBeenCalled();
        expect(store.size).toBe(0);
    });

    it('asks for Adobe setup first when the project has no workspace', async () => {
        const { context } = contextWithSecrets(consoleApiProject({ adobe: { organization: 'org-1' } }));
        await expect(handleSetUpAcoCredential(context, undefined)).resolves.toEqual({ success: false, error: expect.stringMatching(/Complete Adobe setup first/u) });
    });
});

describe('handleRemoveAcoCredential', () => {
    it('takes the ACO API off the credential, keeps the other owners\' picks, and forgets the pair', async () => {
        const project = consoleApiProject({ componentApiPicks: { 'adobe-commerce-aco': ['AcoIngestionCode'], __existing__: ['FireflyAPISDK'] } });
        const { context, store } = contextWithSecrets(project);
        store.set(acoCredentialKey('/projects/demo'), '{"clientId":"c","clientSecret":"s"}');

        await expect(handleRemoveAcoCredential(context, undefined)).resolves.toEqual({ success: true });

        expect(subscribeRequiredApis).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.anything(),
            ['FireflyAPISDK'],
            undefined,
            ['AcoIngestionCode'],
            expect.anything(),
        );
        expect(project.componentApiPicks).toEqual({ __existing__: ['FireflyAPISDK'] });
        expect(store.size).toBe(0);
    });
});

describe('applyAcoAddonChange (Configure turns ACO on or off)', () => {
    const tmp: string[] = [];
    afterEach(() => tmp.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

    function acoProject(overrides: Partial<Project> = {}): Project {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aco-switch-'));
        tmp.push(dir);
        return createMockProject({
            path: dir,
            adobe: { organization: 'org-1', projectId: 'p-1', workspace: 'w-1' },
            selectedStack: 'eds-accs',
            selectedPackage: 'citisignal',
            ...overrides,
        });
    }

    it('turns ACO on where the package allows it: the credential first, then the add-on', async () => {
        const project = acoProject();
        const { context, store } = contextWithSecrets(project);
        await expect(applyAcoAddonChange(context, project, true)).resolves.toEqual({ success: true });
        expect(project.selectedAddons).toEqual(['adobe-commerce-aco']);
        expect(store.has(acoCredentialKey(project.path))).toBe(true);
    });

    it('refuses where the package does not offer ACO, touching nothing', async () => {
        const project = acoProject({ selectedPackage: 'bodea' });
        const { context } = contextWithSecrets(project);
        const result = await applyAcoAddonChange(context, project, true);
        expect(result).toEqual({ success: false, error: expect.stringMatching(/does not offer Adobe Commerce Optimizer/u) });
        expect(subscribeRequiredApis).not.toHaveBeenCalled();
        expect(project.selectedAddons).toBeUndefined();
    });

    it('keeps the add-on off when the credential cannot be set up', async () => {
        (subscribeRequiredApis as jest.Mock).mockRejectedValueOnce(new Error('needs a product profile'));
        const project = acoProject();
        const { context } = contextWithSecrets(project);
        const result = await applyAcoAddonChange(context, project, true);
        expect(result.success).toBe(false);
        expect(project.selectedAddons).toBeUndefined();
    });

    it('refuses to turn ACO off while an ACO pack Demo Builder loaded is still there, and keeps it on', async () => {
        const project = acoProject({ selectedAddons: ['adobe-commerce-aco'] });
        const records = path.join(project.path, '.demo-builder', 'datapacks');
        fs.mkdirSync(records, { recursive: true });
        fs.writeFileSync(
            path.join(records, 'aco_wknd@main.json'),
            JSON.stringify({
                format: 1,
                pack: { name: 'aco_wknd', version: 'main' },
                engine: 'demo-builder',
                startedAt: '2026-10-31T00:00:00.000Z',
                aco: { tenantId: 'TenantAbc123', region: 'na1', environment: 'sandbox' },
                created: [],
            }),
        );
        const { context } = contextWithSecrets(project);
        const result = await applyAcoAddonChange(context, project, false);
        expect(result).toEqual({ success: false, error: expect.stringMatching(/aco_wknd@main/u) });
        expect(project.selectedAddons).toEqual(['adobe-commerce-aco']);
    });

    it('turns ACO off: the credential goes, then the add-on', async () => {
        const project = acoProject({ selectedAddons: ['adobe-commerce-aco'], componentApiPicks: { 'adobe-commerce-aco': ['AcoIngestionCode'] } });
        const { context, store } = contextWithSecrets(project);
        store.set(acoCredentialKey(project.path), '{"clientId":"c","clientSecret":"s"}');
        await expect(applyAcoAddonChange(context, project, false)).resolves.toEqual({ success: true });
        expect(project.selectedAddons).toStrictEqual([]);
        expect(store.size).toBe(0);
    });

    it('changes nothing when ACO is already as asked', async () => {
        const project = acoProject({ selectedAddons: ['adobe-commerce-aco'] });
        const { context } = contextWithSecrets(project);
        await expect(applyAcoAddonChange(context, project, true)).resolves.toEqual({ success: true });
        expect(subscribeRequiredApis).not.toHaveBeenCalled();
    });
});
