/**
 * Shared setup for the edsResetRepoHelper suites.
 *
 * Every collaborator `resetRepoToTemplate` reaches is a mock here, and every
 * suite asserts the ARGUMENTS those mocks receive rather than what they answer:
 * the reset's only outputs are the file map it hands GitHub, the library list
 * it hands the block installer, and the progress lines it hands `report`.
 *
 * `installDefaults()` resets and re-arms every mock before each test; a suite
 * then overrides only the answers it varies.
 *
 * IMPORTED BEFORE the subject in each suite; the placeholder-stub wall it
 * re-exports is shared with the storefront setup suite (see that file).
 */

import '../../../../helpers/edsPlaceholderStubMocks';

jest.mock('@/features/eds/services/configGenerator', () => ({
    generateConfigJson: jest.fn(),
    buildConfigGeneratorParams: jest.fn(),
}));
jest.mock('@/features/eds/services/patches/lkgReader', () => ({
    readLkgSha: jest.fn(),
}));
jest.mock('@/features/eds/services/patches/codePatchPipelineHelpers', () => ({
    applyCanonicalCodePatches: jest.fn(),
}));

import { resetRepoToTemplate } from '@/features/eds/services/reset/edsResetRepoHelper';
import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import {
    generateConfigJson,
    buildConfigGeneratorParams,
} from '@/features/eds/services/configGenerator';
import { generateFstabContent } from '@/features/eds/services/fstabGenerator';
import {
    generateInspectorTreeEntries,
    installInspectorTagging,
} from '@/features/eds/services/inspectorHelpers';
import { applyCanonicalCodePatches } from '@/features/eds/services/patches/codePatchPipelineHelpers';
import { readLkgSha } from '@/features/eds/services/patches/lkgReader';
import { installSmart404Handler } from '@/features/eds/services/pdp/pdp404HandlerPublisher';
import { installQuickEdit } from '@/features/eds/services/quickEditPublisher';
import {
    getBlockLibrarySource,
    getBlockLibraryContentSource,
    getBlockLibraryName,
    isBlockLibraryAvailableForPackage,
} from '@/features/components/services/blockLibraryLoader';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { EdsResetParams } from '@/features/eds/services/reset/edsResetParams';
import type { GitHubTreeInput } from '@/features/eds/services/types';
import type { AddonSource } from '@/types/demoPackages';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';

export { resetRepoToTemplate };

export const mocks = {
    installBlockCollections: installBlockCollections as jest.MockedFunction<
        typeof installBlockCollections
    >,
    generateConfigJson: generateConfigJson as jest.MockedFunction<typeof generateConfigJson>,
    buildConfigGeneratorParams: buildConfigGeneratorParams as jest.MockedFunction<
        typeof buildConfigGeneratorParams
    >,
    generateFstabContent: generateFstabContent as jest.MockedFunction<typeof generateFstabContent>,
    generateInspectorTreeEntries: generateInspectorTreeEntries as jest.MockedFunction<
        typeof generateInspectorTreeEntries
    >,
    installInspectorTagging: installInspectorTagging as jest.MockedFunction<
        typeof installInspectorTagging
    >,
    applyCanonicalCodePatches: applyCanonicalCodePatches as jest.MockedFunction<
        typeof applyCanonicalCodePatches
    >,
    readLkgSha: readLkgSha as jest.MockedFunction<typeof readLkgSha>,
    installSmart404Handler: installSmart404Handler as jest.MockedFunction<
        typeof installSmart404Handler
    >,
    installQuickEdit: installQuickEdit as jest.MockedFunction<typeof installQuickEdit>,
    getBlockLibrarySource: getBlockLibrarySource as jest.MockedFunction<
        typeof getBlockLibrarySource
    >,
    getBlockLibraryContentSource: getBlockLibraryContentSource as jest.MockedFunction<
        typeof getBlockLibraryContentSource
    >,
    getBlockLibraryName: getBlockLibraryName as jest.MockedFunction<typeof getBlockLibraryName>,
    isBlockLibraryAvailableForPackage: isBlockLibraryAvailableForPackage as jest.MockedFunction<
        typeof isBlockLibraryAvailableForPackage
    >,
};

export const SOURCE_A: AddonSource = { owner: 'adobe', repo: 'lib-a', branch: 'main' };
export const SOURCE_B: AddonSource = { owner: 'adobe', repo: 'lib-b', branch: 'main' };
export const SOURCE_CUSTOM: AddonSource = { owner: 'me', repo: 'my-blocks', branch: 'dev' };
export const INSPECTOR_ENTRY: GitHubTreeInput = {
    path: 'scripts/inspector.js',
    mode: '100644',
    type: 'blob',
    content: '// inspector',
};
export const RESET_RESULT = { fileCount: 20, commitSha: 'abc1234567' };

/** Re-arm every mock with the answers a plain reset sees: no libraries, nothing extra. */
export function installDefaults(): void {
    // The jest config sets resetMocks at the top level, which does not reach `projects`,
    // so call history and per-test implementations would otherwise leak between tests.
    jest.resetAllMocks();
    mocks.generateFstabContent.mockReturnValue('mock-fstab');
    mocks.generateConfigJson.mockReturnValue({ success: true, content: '{"mock":"config"}' });
    mocks.buildConfigGeneratorParams.mockReturnValue({
        githubOwner: 'me',
        repoName: 'shop',
        daLiveOrg: 'acme',
        daLiveSite: 'shop',
    });
    mocks.generateInspectorTreeEntries.mockResolvedValue([]);
    mocks.installInspectorTagging.mockResolvedValue({ success: true });
    mocks.installBlockCollections.mockResolvedValue({
        success: true,
        blocksCount: 0,
        blockIds: [],
    });
    mocks.applyCanonicalCodePatches.mockResolvedValue([]);
    mocks.readLkgSha.mockResolvedValue(undefined);
    mocks.installSmart404Handler.mockResolvedValue({ installed: false, reason: 'BYOM disabled' });
    mocks.installQuickEdit.mockResolvedValue({ installed: true });
    mocks.isBlockLibraryAvailableForPackage.mockReturnValue(true);
    mocks.getBlockLibrarySource.mockReturnValue(undefined);
    mocks.getBlockLibraryContentSource.mockReturnValue(undefined);
    mocks.getBlockLibraryName.mockReturnValue('');
}

export function buildParams(overrides: Partial<EdsResetParams> = {}): EdsResetParams {
    return {
        repoOwner: 'me',
        repoName: 'shop',
        daLiveOrg: 'acme',
        daLiveSite: 'shop',
        templateOwner: 'tpl-owner',
        templateRepo: 'tpl-repo',
        project: createMockProject({ name: 'p', path: '/p', selectedBlockLibraries: [] }),
        ...overrides,
    };
}

/** Run the reset against a GitHub fake and return everything a suite can assert on. */
export async function runReset(
    params: EdsResetParams,
    context: HandlerContext = createMockHandlerContext({ logger: createMockLogger() }),
) {
    const resetMock = jest.fn().mockResolvedValue(RESET_RESULT);
    // The one call the reset makes; the class holds private Octokit state.
    const githubFileOps = { resetRepoToTemplate: resetMock } as unknown as GitHubFileOperations;
    const report = jest.fn<void, [number, string]>();
    const result = await resetRepoToTemplate(params, context, githubFileOps, report);
    const overrides = resetMock.mock.calls[0]?.[4] as Map<string, string> | undefined;
    return { result, resetMock, githubFileOps, report, overrides, context };
}
