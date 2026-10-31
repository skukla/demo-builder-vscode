/**
 * The doors to the project's ACO ingestion credential (PL-60 P2), driven through the same mocked
 * subscription spine the Console API handlers use: the guard chain first, the ACO API subscribed
 * under the add-on's own owner key so every later reconcile keeps it, the pair kept in
 * SecretStorage; and the reverse.
 */

import type { HandlerContext } from '@/types/handlers';
import { acoCredentialKey } from '@/features/components/services/acoCredentialStore';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import {
    ErrorCode,
    consoleApiContext,
    consoleApiProject,
    handleRemoveAcoCredential,
    handleSetUpAcoCredential,
    runGuards,
    subscribeRequiredApis,
} from './consoleApiHandlers.testUtils';

function contextWithSecrets(project: Record<string, unknown> | null) {
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
