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

import type { HandlerContext } from '@/types/handlers';

jest.mock('@/features/eds/services/fstabGenerator', () => ({
    generateFstabContent: jest.fn().mockReturnValue('mock-fstab'),
}));

jest.mock('@/features/eds/services/configGenerator', () => ({
    generateConfigJson: jest.fn().mockReturnValue({ success: true, content: '{}' }),
    buildConfigGeneratorParams: jest.fn().mockReturnValue({}),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest
        .fn()
        .mockResolvedValue({ success: true, blocksCount: 0, blockIds: [] }),
}));

jest.mock('@/features/eds/services/inspectorHelpers', () => ({
    generateInspectorTreeEntries: jest.fn().mockResolvedValue([]),
    installInspectorTagging: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/features/eds/services/pdp/pdp404HandlerPublisher', () => ({
    installSmart404Handler: jest.fn().mockResolvedValue({ installed: false, reason: 'no-overlay' }),
}));

jest.mock('@/features/eds/services/quickEditPublisher', () => ({
    installQuickEdit: jest.fn().mockResolvedValue({ installed: true }),
}));

jest.mock('@/features/eds/services/patches/lkgReader', () => ({
    readLkgSha: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/features/eds/services/patches/codePatchPipelineHelpers', () => ({
    applyCanonicalCodePatches: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    getBlockLibraryContentSource: jest.fn(),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));

import { resetRepoToTemplate } from '@/features/eds/services/reset/edsResetRepoHelper';
import {
    PLACEHOLDER_STUB_PATHS,
    buildPlaceholderStubJson,
} from '@/features/eds/services/placeholderStubs';

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
    return {
        logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    } as unknown as HandlerContext;
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
