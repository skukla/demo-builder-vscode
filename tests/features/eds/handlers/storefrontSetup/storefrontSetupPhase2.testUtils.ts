/**
 * Shared setup for the executePhaseHelixConfig suites.
 *
 * Phase 2 writes to a GitHub repo through five collaborators and reports its
 * progress on the wire, so everything it decides is visible as an ARGUMENT:
 * which entries reach `commitTreeToBranch`, which libraries reach
 * `installBlockCollections`, which overlay URL reaches the smart-404 installer,
 * and which progress payloads reach the webview. These suites assert those.
 *
 * `edsHelpers` is deliberately NOT mocked: `addPdpCaveat` and
 * `describeSmart404Skip` are pure, and letting them run means the caveat can be
 * read off `repoInfo` instead of off a spy.
 */

import '../../../../helpers/edsPlaceholderStubMocks';

import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type {
    RepoInfo,
    SetupServices,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';
import type { StorefrontSetupProgressPayload } from '@/types/webviewPayloads';
import type { StorefrontSetupStartPayload } from '@/types/webviewRequests';

// The subject is imported after the mock wall above.
import { executePhaseHelixConfig } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhase2';

export { executePhaseHelixConfig };

/** Handles onto the walls installed by the shared mock file. */
export const blockLibraryLoader = jest.requireMock(
    '@/features/components/services/blockLibraryLoader',
) as {
    getBlockLibrarySource: jest.Mock;
    getBlockLibraryName: jest.Mock;
    isBlockLibraryAvailableForPackage: jest.Mock;
};
export const blockCollectionHelpers = jest.requireMock(
    '@/features/eds/services/blockCollectionHelpers',
) as { installBlockCollections: jest.Mock };
export const fstabGenerator = jest.requireMock('@/features/eds/services/fstabGenerator') as {
    generateFstabContent: jest.Mock;
};
export const inspectorHelpers = jest.requireMock('@/features/eds/services/inspectorHelpers') as {
    generateInspectorTreeEntries: jest.Mock;
    installInspectorTagging: jest.Mock;
};
export const pdp404Publisher = jest.requireMock(
    '@/features/eds/services/pdp/pdp404HandlerPublisher',
) as { installSmart404Handler: jest.Mock };
export const quickEditPublisher = jest.requireMock(
    '@/features/eds/services/quickEditPublisher',
) as { installQuickEdit: jest.Mock };

export const EDS_CONFIG: StorefrontSetupStartPayload['edsConfig'] = {
    repoName: 'shop',
    daLiveOrg: 'acme',
    daLiveSite: 'shop',
};

export const makeRepoInfo = (): RepoInfo => ({ repoOwner: 'me', repoName: 'shop' });

/** The three file-ops calls this phase makes; the class itself holds private Octokit state. */
export type FileOpsStub = jest.Mocked<
    Pick<GitHubFileOperations, 'getFileContent' | 'createOrUpdateFile' | 'commitTreeToBranch'>
>;

export function makeFileOps(overrides: Partial<FileOpsStub> = {}): FileOpsStub {
    return {
        getFileContent: jest.fn().mockResolvedValue(null),
        createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
        commitTreeToBranch: jest.fn().mockResolvedValue('sha123'),
        ...overrides,
    };
}

/** Only `githubFileOps` is read here; the rest is forwarded to mocked modules. */
export const servicesWith = (githubFileOps: FileOpsStub): SetupServices =>
    ({ githubFileOps }) as unknown as SetupServices;

export function makePhaseContext(project: Project | null = null) {
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const saveProject = jest.fn().mockResolvedValue(undefined);
    const context: HandlerContext = createMockHandlerContext({
        logger: createMockLogger(),
        sendMessage,
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject,
        }),
    });
    return { context, sendMessage, saveProject };
}

/** Every `storefront-setup-progress` payload the phase pushed, in order. */
export function progressPushes(sendMessage: jest.Mock): StorefrontSetupProgressPayload[] {
    return sendMessage.mock.calls
        .filter(([type]) => type === 'storefront-setup-progress')
        .map(([, payload]) => payload as StorefrontSetupProgressPayload);
}

export function resetPhase2Mocks(): void {
    blockLibraryLoader.getBlockLibrarySource.mockReset().mockReturnValue(undefined);
    blockLibraryLoader.getBlockLibraryName.mockReset().mockReturnValue(undefined);
    blockLibraryLoader.isBlockLibraryAvailableForPackage.mockReset().mockReturnValue(true);
    blockCollectionHelpers.installBlockCollections
        .mockReset()
        .mockResolvedValue({ success: true, blocksCount: 0, blockIds: [] });
    fstabGenerator.generateFstabContent.mockReset().mockReturnValue('mock-fstab');
    inspectorHelpers.generateInspectorTreeEntries.mockReset().mockResolvedValue([]);
    inspectorHelpers.installInspectorTagging.mockReset().mockResolvedValue({ success: true });
    pdp404Publisher.installSmart404Handler
        .mockReset()
        .mockResolvedValue({ installed: false, reason: 'BYOM disabled' });
    quickEditPublisher.installQuickEdit.mockReset().mockResolvedValue({ installed: true });
}
