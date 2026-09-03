/**
 * resetRepoToTemplate — placeholder-stub wiring.
 *
 * The stub CONTENT is pinned in placeholderStubs.test.ts; this suite pins the
 * WIRING: the reset's bulk file-override map must carry one stub per sheet the
 * boilerplate requests, in the same atomic commit as fstab/config (a separate
 * commit could race the template reset and be lost). Asserting the ARGUMENT
 * handed to githubFileOps.resetRepoToTemplate — not a mock's echo — per the
 * repo's mock-audit rule.
 */

import '../../../../helpers/edsPlaceholderStubMocks';

import type { HandlerContext } from '@/types/handlers';

jest.mock('@/features/eds/services/configGenerator', () => ({
    generateConfigJson: jest.fn().mockReturnValue({ success: true, content: '{}' }),
    buildConfigGeneratorParams: jest.fn().mockReturnValue({}),
}));

jest.mock('@/features/eds/services/patches/lkgReader', () => ({
    readLkgSha: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/features/eds/services/patches/codePatchPipelineHelpers', () => ({
    applyCanonicalCodePatches: jest.fn().mockResolvedValue([]),
}));

import { resetRepoToTemplate } from '@/features/eds/services/reset/edsResetRepoHelper';
import {
    PLACEHOLDER_STUB_PATHS,
    buildPlaceholderStubJson,
} from '@/features/eds/services/placeholderStubs';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';

const PARAMS = {
    repoOwner: 'me',
    repoName: 'shop',
    daLiveOrg: 'acme',
    daLiveSite: 'shop',
    templateOwner: 'tpl-owner',
    templateRepo: 'tpl-repo',
    project: { name: 'p', path: '/p', selectedBlockLibraries: [] },
} as any;

function makeContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
    });
}

describe('resetRepoToTemplate — placeholder stubs ride the bulk override commit', () => {
    it('hands one stub per requested sheet to githubFileOps.resetRepoToTemplate', async () => {
        const resetMock = jest.fn().mockResolvedValue({ fileCount: 20, commitSha: 'abc1234567' });
        const githubFileOps = {
            resetRepoToTemplate: resetMock,
        } as any;

        await resetRepoToTemplate(PARAMS, makeContext(), githubFileOps, jest.fn());

        const overrides = resetMock.mock.calls[0][4] as Map<string, string>;
        expect(overrides.get('fstab.yaml')).toBe('mock-fstab');
        for (const sheetPath of PLACEHOLDER_STUB_PATHS) {
            expect(overrides.get(`${sheetPath}.json`)).toBe(buildPlaceholderStubJson());
        }
    });
});
