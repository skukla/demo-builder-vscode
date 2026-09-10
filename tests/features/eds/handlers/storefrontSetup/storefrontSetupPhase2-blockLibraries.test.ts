/**
 * executePhaseHelixConfig — which block libraries get installed, and what is
 * recorded about them.
 *
 * Two filters decide the list: a built-in library can be restricted to certain
 * demo packages (`onlyForPackages`), and a CUSTOM library is user-entered, so
 * its owner/repo is validated against GitHub's identifier rules before it is
 * used to build an API call. Everything downstream — the inspector entries, the
 * progress wording, the install tracking saved onto the project — is keyed off
 * that list, so these assert the list as it arrives at `installBlockCollections`.
 */

import {
    EDS_CONFIG,
    blockCollectionHelpers,
    blockLibraryLoader,
    executePhaseHelixConfig,
    inspectorHelpers,
    makeFileOps,
    makePhaseContext,
    makeRepoInfo,
    progressPushes,
    resetPhase2Mocks,
    servicesWith,
} from './storefrontSetupPhase2.testUtils';
import { createMockProject } from '../../../../helpers/projectFake';
import type { Project } from '@/types/base';
import type { CustomBlockLibrary } from '@/types/blockLibraries';

beforeEach(() => {
    resetPhase2Mocks();
});

const ISLE5_SOURCE = { owner: 'adobe', repo: 'isle5-blocks', branch: 'main' };

async function runPhase(
    options: Parameters<typeof executePhaseHelixConfig>[5],
    project: Project | null = null,
) {
    const fileOps = makeFileOps();
    const { context, sendMessage, saveProject } = makePhaseContext(project);
    const result = await executePhaseHelixConfig(
        context,
        EDS_CONFIG,
        servicesWith(fileOps),
        makeRepoInfo(),
        new AbortController().signal,
        options,
    );
    return { result, fileOps, context, sendMessage, saveProject };
}

/** The library list as it reached the installer. */
const librariesInstalled = (): unknown =>
    blockCollectionHelpers.installBlockCollections.mock.calls[0]?.[3];

describe('executePhaseHelixConfig — built-in block libraries', () => {
    it('installs a selected library under its configured name', async () => {
        blockLibraryLoader.getBlockLibrarySource.mockReturnValue(ISLE5_SOURCE);
        blockLibraryLoader.getBlockLibraryName.mockReturnValue('Isle5 Blocks');

        const { fileOps } = await runPhase({ selectedBlockLibraries: ['isle5'], packageId: 'citisignal' });

        expect(blockLibraryLoader.isBlockLibraryAvailableForPackage).toHaveBeenCalledWith(
            'isle5',
            'citisignal',
        );
        expect(librariesInstalled()).toEqual([{ source: ISLE5_SOURCE, name: 'Isle5 Blocks' }]);
        expect(blockCollectionHelpers.installBlockCollections).toHaveBeenCalledWith(
            fileOps,
            'me',
            'shop',
            [{ source: ISLE5_SOURCE, name: 'Isle5 Blocks' }],
            expect.anything(),
            [],
        );
    });

    it('falls back to the library id when the catalog has no display name', async () => {
        blockLibraryLoader.getBlockLibrarySource.mockReturnValue(ISLE5_SOURCE);
        blockLibraryLoader.getBlockLibraryName.mockReturnValue('');

        await runPhase({ selectedBlockLibraries: ['isle5'] });

        expect(librariesInstalled()).toEqual([{ source: ISLE5_SOURCE, name: 'isle5' }]);
    });

    it('asks the catalog with an empty package id when the wizard picked no package', async () => {
        blockLibraryLoader.getBlockLibrarySource.mockReturnValue(ISLE5_SOURCE);

        await runPhase({ selectedBlockLibraries: ['isle5'] });

        expect(blockLibraryLoader.isBlockLibraryAvailableForPackage).toHaveBeenCalledWith(
            'isle5',
            '',
        );
    });

    it('drops a library that is not available for this demo package', async () => {
        blockLibraryLoader.isBlockLibraryAvailableForPackage.mockReturnValue(false);
        blockLibraryLoader.getBlockLibrarySource.mockReturnValue(ISLE5_SOURCE);

        await runPhase({ selectedBlockLibraries: ['isle5'], packageId: 'bodea' });

        expect(blockCollectionHelpers.installBlockCollections).not.toHaveBeenCalled();
        expect(blockLibraryLoader.getBlockLibrarySource).not.toHaveBeenCalled();
    });

    it('drops a library the catalog has no source for', async () => {
        blockLibraryLoader.getBlockLibrarySource.mockReturnValue(undefined);

        await runPhase({ selectedBlockLibraries: ['isle5'] });

        expect(blockCollectionHelpers.installBlockCollections).not.toHaveBeenCalled();
    });

    it('installs nothing when no libraries were selected', async () => {
        await runPhase({ selectedBlockLibraries: [] });

        expect(blockCollectionHelpers.installBlockCollections).not.toHaveBeenCalled();
        expect(blockLibraryLoader.isBlockLibraryAvailableForPackage).not.toHaveBeenCalled();
    });

    it('installs nothing when the phase was handed no options at all', async () => {
        await runPhase(undefined);

        // Not merely "installed nothing": the selection defaults to an EMPTY
        // list, so the catalog is never consulted for a phantom library id.
        expect(blockLibraryLoader.isBlockLibraryAvailableForPackage).not.toHaveBeenCalled();
        expect(blockCollectionHelpers.installBlockCollections).not.toHaveBeenCalled();
    });
});

describe('executePhaseHelixConfig — custom block libraries', () => {
    const custom = (source: CustomBlockLibrary['source']): CustomBlockLibrary => ({
        name: 'Demo Team Blocks',
        source,
    });

    it('accepts single-character owner and repo names, which GitHub allows', async () => {
        const source = { owner: 'a', repo: 'b', branch: 'main' };

        await runPhase({ customBlockLibraries: [custom(source)] });

        expect(librariesInstalled()).toEqual([{ source, name: 'Demo Team Blocks' }]);
    });

    it('refuses a settings entry whose source has no owner field at all', async () => {
        // Custom libraries come from a user-edited VS Code setting, so the
        // compiler's guarantee does not reach this value: a hand-written entry
        // can omit `owner` entirely. The falsy guard is what catches that —
        // the identifier regex does NOT, because it stringifies undefined into
        // the perfectly valid-looking "undefined".
        const malformed = {
            name: 'Demo Team Blocks',
            source: { repo: 'blocks', branch: 'main' },
        } as unknown as CustomBlockLibrary;

        await runPhase({ customBlockLibraries: [malformed] });

        expect(blockCollectionHelpers.installBlockCollections).not.toHaveBeenCalled();
    });

    it('refuses a settings entry whose source has no repo field at all', async () => {
        const malformed = {
            name: 'Demo Team Blocks',
            source: { owner: 'demo-team', branch: 'main' },
        } as unknown as CustomBlockLibrary;

        await runPhase({ customBlockLibraries: [malformed] });

        expect(blockCollectionHelpers.installBlockCollections).not.toHaveBeenCalled();
    });

    it('accepts a well-formed owner/repo pair', async () => {
        const source = { owner: 'demo-team', repo: 'blocks.v2', branch: 'main' };

        await runPhase({ customBlockLibraries: [custom(source)] });

        expect(librariesInstalled()).toEqual([{ source, name: 'Demo Team Blocks' }]);
    });

    it.each([
        ['a missing owner', { owner: '', repo: 'blocks', branch: 'main' }],
        ['a missing repo', { owner: 'demo-team', repo: '', branch: 'main' }],
        ['an owner starting with a dot', { owner: '.demo', repo: 'blocks', branch: 'main' }],
        ['a repo ending in a hyphen', { owner: 'demo', repo: 'blocks-', branch: 'main' }],
        ['a repo with a slash in it', { owner: 'demo', repo: 'demo/blocks', branch: 'main' }],
    ])('refuses %s', async (_label, source) => {
        await runPhase({ customBlockLibraries: [custom(source)] });

        expect(blockCollectionHelpers.installBlockCollections).not.toHaveBeenCalled();
    });

    it('installs the valid ones alongside the built-ins and skips the rest', async () => {
        blockLibraryLoader.getBlockLibrarySource.mockReturnValue(ISLE5_SOURCE);
        blockLibraryLoader.getBlockLibraryName.mockReturnValue('Isle5 Blocks');
        const good = { owner: 'demo-team', repo: 'blocks', branch: 'main' };

        const { sendMessage } = await runPhase({
            selectedBlockLibraries: ['isle5'],
            customBlockLibraries: [
                custom(good),
                { name: 'Broken', source: { owner: '', repo: 'x', branch: 'main' } },
            ],
        });

        expect(librariesInstalled()).toEqual([
            { source: ISLE5_SOURCE, name: 'Isle5 Blocks' },
            { source: good, name: 'Demo Team Blocks' },
        ]);
        expect(progressPushes(sendMessage)).toContainEqual({
            phase: 'storefront-code',
            message: 'Installing blocks from 2 libraries...',
            subMessage: 'Isle5 Blocks, Demo Team Blocks',
            progress: 28,
        });
    });

    it('says "library", not "libraries", for a single one', async () => {
        const { sendMessage } = await runPhase({
            customBlockLibraries: [custom({ owner: 'demo-team', repo: 'blocks', branch: 'main' })],
        });

        expect(progressPushes(sendMessage)).toContainEqual({
            phase: 'storefront-code',
            message: 'Installing blocks from 1 library...',
            subMessage: 'Demo Team Blocks',
            progress: 28,
        });
    });
});

describe('executePhaseHelixConfig — inspector tagging', () => {
    it('hands the generated entries to the block install so both land in one commit', async () => {
        const entries = [{ path: 'scripts/inspector.js', content: '//', mode: '100644', type: 'blob' }];
        inspectorHelpers.generateInspectorTreeEntries.mockResolvedValue(entries);
        blockLibraryLoader.getBlockLibrarySource.mockReturnValue(ISLE5_SOURCE);

        const { fileOps } = await runPhase({
            selectedBlockLibraries: ['isle5'],
            packageId: 'citisignal',
        });

        expect(inspectorHelpers.generateInspectorTreeEntries).toHaveBeenCalledWith(
            fileOps,
            'me',
            'shop',
            'citisignal',
            expect.anything(),
        );
        expect(blockCollectionHelpers.installBlockCollections).toHaveBeenCalledWith(
            fileOps,
            'me',
            'shop',
            expect.anything(),
            expect.anything(),
            entries,
        );
    });

    it('installs tagging on its own when there are entries but no libraries', async () => {
        inspectorHelpers.generateInspectorTreeEntries.mockResolvedValue([
            { path: 'scripts/inspector.js', content: '//', mode: '100644', type: 'blob' },
        ]);

        const { fileOps, sendMessage } = await runPhase({ packageId: 'citisignal' });

        expect(inspectorHelpers.installInspectorTagging).toHaveBeenCalledWith(
            fileOps,
            'me',
            'shop',
            'citisignal',
            expect.anything(),
        );
        expect(progressPushes(sendMessage)).toContainEqual({
            phase: 'storefront-code',
            message: 'Inspector tagging installed',
            progress: 28,
        });
    });

    it('does not report tagging installed when the standalone install failed', async () => {
        inspectorHelpers.generateInspectorTreeEntries.mockResolvedValue([
            { path: 'scripts/inspector.js', content: '//', mode: '100644', type: 'blob' },
        ]);
        inspectorHelpers.installInspectorTagging.mockResolvedValue({
            success: false,
            error: 'no scripts.js',
        });

        const { sendMessage } = await runPhase({});

        expect(progressPushes(sendMessage)).not.toContainEqual(
            expect.objectContaining({ message: 'Inspector tagging installed' }),
        );
    });

    it('skips tagging entirely when generating the entries threw', async () => {
        inspectorHelpers.generateInspectorTreeEntries.mockRejectedValue(new Error('rate limited'));

        const { result } = await runPhase({});

        expect(inspectorHelpers.installInspectorTagging).not.toHaveBeenCalled();
        expect(result).toEqual({ blockCollectionIds: undefined });
    });

    it('still installs blocks with an empty entry list when generating them threw', async () => {
        inspectorHelpers.generateInspectorTreeEntries.mockRejectedValue(new Error('rate limited'));
        blockLibraryLoader.getBlockLibrarySource.mockReturnValue(ISLE5_SOURCE);

        await runPhase({ selectedBlockLibraries: ['isle5'] });

        expect(blockCollectionHelpers.installBlockCollections).toHaveBeenCalledWith(
            expect.anything(),
            'me',
            'shop',
            expect.anything(),
            expect.anything(),
            [],
        );
    });
});

describe('executePhaseHelixConfig — what it reports back and records', () => {
    beforeEach(() => {
        blockLibraryLoader.getBlockLibrarySource.mockReturnValue(ISLE5_SOURCE);
        blockLibraryLoader.getBlockLibraryName.mockReturnValue('Isle5 Blocks');
    });

    it('returns the installed block ids', async () => {
        blockCollectionHelpers.installBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 3,
            blockIds: ['hero', 'cards', 'columns'],
        });

        const { result } = await runPhase({ selectedBlockLibraries: ['isle5'] });

        expect(result).toEqual({ blockCollectionIds: ['hero', 'cards', 'columns'] });
    });

    it('returns nothing when the install failed', async () => {
        blockCollectionHelpers.installBlockCollections.mockResolvedValue({
            success: false,
            blocksCount: 0,
            blockIds: [],
            error: 'source repo not found',
        });

        const { result, saveProject } = await runPhase({ selectedBlockLibraries: ['isle5'] });

        expect(result).toEqual({ blockCollectionIds: undefined });
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('records what was installed against the open project', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-09-05T04:00:00.000Z'));
        blockCollectionHelpers.installBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 2,
            blockIds: ['hero', 'cards'],
            libraryVersions: [
                {
                    name: 'Isle5 Blocks',
                    source: ISLE5_SOURCE,
                    commitSha: 'abc123',
                    blockIds: ['hero', 'cards'],
                },
            ],
        });
        const project = createMockProject();

        const { saveProject } = await runPhase({ selectedBlockLibraries: ['isle5'] }, project);

        expect(saveProject).toHaveBeenCalledWith(project);
        expect(project.installedBlockLibraries).toEqual([
            {
                name: 'Isle5 Blocks',
                source: ISLE5_SOURCE,
                commitSha: 'abc123',
                blockIds: ['hero', 'cards'],
                installedAt: '2026-09-05T04:00:00.000Z',
            },
        ]);
        jest.useRealTimers();
    });

    it('records nothing when no project is open', async () => {
        blockCollectionHelpers.installBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 2,
            blockIds: ['hero'],
            libraryVersions: [
                { name: 'Isle5 Blocks', source: ISLE5_SOURCE, commitSha: 'abc123', blockIds: ['hero'] },
            ],
        });

        const { saveProject, result } = await runPhase({ selectedBlockLibraries: ['isle5'] }, null);

        expect(saveProject).not.toHaveBeenCalled();
        expect(result).toEqual({ blockCollectionIds: ['hero'] });
    });

    it('does not touch the project when the install reported no library versions', async () => {
        blockCollectionHelpers.installBlockCollections.mockResolvedValue({
            success: true,
            blocksCount: 0,
            blockIds: [],
            libraryVersions: [],
        });
        const project = createMockProject();

        const { saveProject } = await runPhase({ selectedBlockLibraries: ['isle5'] }, project);

        expect(saveProject).not.toHaveBeenCalled();
        expect(project.installedBlockLibraries).toBeUndefined();
    });
});
