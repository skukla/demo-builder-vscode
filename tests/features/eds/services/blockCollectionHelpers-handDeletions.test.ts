/**
 * Block Collection Helpers — block folders removed by hand (EDS-36).
 *
 * A block folder the library copied before, and the SC then deleted, is not
 * copied back by the next install or update; the result says it was left out.
 *
 * What these read is the tree handed to `commitTreeToBranch` — the content that
 * would reach GitHub — not a summary the installer reports about itself.
 */

import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import type { BlockLibraryEntry } from '@/features/eds/services/blockCollectionHelpers';
import type { GitHubTreeInput } from '@/features/eds/services/types';
import type { AddonSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';
import {
    createBlockFileEntries,
    setupBlockCollectionMocks,
    type MockGithubFileOps,
} from './blockCollectionHelpers.testUtils';

const SOURCE: AddonSource = { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' };
const LIBRARY_NAME = 'Isle5 Blocks';

function prime(mock: MockGithubFileOps, storefrontBlocks: string[] = []): void {
    mock.listRepoFiles
        .mockResolvedValueOnce(createBlockFileEntries(storefrontBlocks))
        .mockResolvedValueOnce(createBlockFileEntries(['hero-cta', 'newsletter', 'tabs']));
    mock.getBlobContent.mockResolvedValue('export default function() {}');
    mock.getFileContent.mockResolvedValue(null);
    mock.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'source-commit' });
    mock.createTree.mockResolvedValue('new-tree-sha');
    mock.createCommit.mockResolvedValue('new-commit-sha');
    mock.updateBranchRef.mockResolvedValue(undefined);
}

/** The paths in the tree handed to the commit. */
function committedPaths(mock: MockGithubFileOps): string[] {
    const tree = mock.commitTreeToBranch.mock.calls[0][3] as GitHubTreeInput[];
    return tree.map((e) => e.path);
}

describe('installBlockCollections — block folders removed by hand (EDS-36)', () => {
    let mockGithubFileOps: MockGithubFileOps;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
    });

    function install(library: BlockLibraryEntry) {
        return installBlockCollections(
            mockGithubFileOps, 'dest-owner', 'dest-repo', [library], mockLogger,
        );
    }

    it('does not copy back a folder it added before, and says so', async () => {
        prime(mockGithubFileOps);

        // An earlier install copied hero-cta; the SC has deleted its folder.
        const result = await install({ source: SOURCE, name: LIBRARY_NAME, blockIds: ['hero-cta'] });

        expect(committedPaths(mockGithubFileOps)).toEqual([
            'blocks/newsletter/newsletter.js',
            'blocks/tabs/tabs.js',
        ]);
        expect(result.blockIds).toEqual(['newsletter', 'tabs']);
        expect(result.removedByHand).toEqual([
            { library: LIBRARY_NAME, file: 'block folder blocks/hero-cta', id: 'hero-cta' },
        ]);
    });

    it('leaves a folder the storefront still has alone, whatever the record says', async () => {
        prime(mockGithubFileOps, ['hero-cta']);

        const result = await install({ source: SOURCE, name: LIBRARY_NAME, blockIds: ['hero-cta'] });

        expect(committedPaths(mockGithubFileOps)).not.toContain('blocks/hero-cta/hero-cta.js');
        expect(result.removedByHand).toStrictEqual([]);
    });

    it('commits nothing when every block it would copy was removed by hand, and says so', async () => {
        prime(mockGithubFileOps);

        const result = await install({
            source: SOURCE, name: LIBRARY_NAME, blockIds: ['hero-cta', 'newsletter', 'tabs'],
        });

        expect(mockGithubFileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.removedByHand?.map((e) => e.id)).toEqual(['hero-cta', 'newsletter', 'tabs']);
    });
});
