/**
 * check-repo-readiness handler.
 *
 * Feeds the repo-selection step the classification that decides whether the
 * "Reset to template" question is worth asking. Until this existed the gate and
 * its UI were inert — readiness was always undefined, which is the no-block path.
 */

import { handleCheckRepoReadiness } from '@/features/eds/handlers/checkRepoReadinessHandler';
import { createMockLogger } from '../../../helpers/loggerFake';

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
const classify = jest.fn();
jest.mock('@/features/eds/services/storefront/repoStorefrontReadiness', () => ({
    classifyRepoForStorefront: (...args: unknown[]) => classify(...args),
}));

const fileOperations = { getFileContent: jest.fn() };
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({ fileOperations }),
}));

function ctx() {
    // `context: { secrets: {} }` claimed an empty object was an ExtensionContext AND
    // that an empty object inside it was a SecretStorage — two claims in one line,
    // both erased by the cast at the call sites.
    return createMockHandlerContext({
        logger: createMockLogger(),
        context: createMockExtensionContext({
            secrets: createMockSecretStorage().secrets,
        }),
        sendMessage: jest.fn(),
    });
}

describe('handleCheckRepoReadiness', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns the classification for the requested repo', async () => {
        classify.mockResolvedValue({ kind: 'storefront' });

        const result = await handleCheckRepoReadiness(
            ctx(),
            { owner: 'skukla', repo: 'b2b-tester' },
        );

        expect(result.success).toBe(true);
        expect(result.readiness).toEqual({ kind: 'storefront' });
    });

    it('passes the missing-file list through untouched', async () => {
        // The UI names these files to the user; dropping them would leave the
        // notice saying something is wrong without saying what.
        classify.mockResolvedValue({
            kind: 'not-a-storefront',
            missing: ['scripts/scripts.js', 'scripts/delayed.js'],
        });

        const result = await handleCheckRepoReadiness(
            ctx(),
            { owner: 'skukla', repo: 'demo-builder-test' },
        );

        expect(result.readiness).toEqual({
            kind: 'not-a-storefront',
            missing: ['scripts/scripts.js', 'scripts/delayed.js'],
        });
    });

    it('reports undetermined rather than throwing when the classifier fails', async () => {
        // A thrown handler would surface as a step error. Undetermined is the
        // no-block path, which is the right degradation: setup continues and the
        // mid-pipeline checks still run.
        classify.mockRejectedValue(new Error('rate limited'));

        const result = await handleCheckRepoReadiness(
            ctx(),
            { owner: 'skukla', repo: 'b2b-tester' },
        );

        expect(result.success).toBe(true);
        expect((result.readiness as { kind: string }).kind).toBe('undetermined');
    });

    it('refuses a request without both owner and repo', async () => {
        const result = await handleCheckRepoReadiness(ctx(), { owner: 'skukla' });

        expect(result.success).toBe(false);
        expect(classify).not.toHaveBeenCalled();
    });
});
