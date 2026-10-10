/**
 * updateApplyService — the block-library INSTALL category (EDS-28), headless.
 *
 * A library the project has selected but never received is a pending item in
 * `apply_updates`' check, and is installed on apply. `findUninstalledBlockLibraries`
 * and `applyBlockLibraryInstall` are REAL; the installer they call
 * (`installBlockLibraryFiles`) is the fake, so the subject is the argument it
 * is handed and the record written from its answer. The installer itself is
 * driven for real in blockLibraryInstall.test.ts.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    edsProject,
    emptySelections,
    installedLibrary,
    makeCtx,
    mockInstallBlockLibraryFiles,
    recordsIntegrationProbe,
    resetFakes,
} from './updateApplyService.testUtils';
import * as vscode from 'vscode';
import { applyUpdatesHeadless } from '@/features/updates/services/updateApplyService';
import {
    computeProjectUpdateSelections,
    countSelections,
} from '@/features/updates/services/updateSelections';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const LIBRARY = {
    name: 'Demo Builder Blocks',
    source: { owner: 'skukla', repo: 'demo-builder-block-library', branch: 'main' },
};

function setSyncBehavior(value: 'ask' | 'enabled' | 'disabled'): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((_k: string, def: unknown) => value ?? def),
    });
}

beforeEach(() => {
    resetFakes();
});

describe('computeProjectUpdateSelections — block library installs', () => {
    it('selects a library the project selected but has no record of, resolved from the catalog', async () => {
        const project = edsProject({ selectedBlockLibraries: ['demo-builder-blocks'] });

        const sel = await computeProjectUpdateSelections(project, createMockHandlerContext(), recordsIntegrationProbe());

        expect(sel.blockLibraryInstall).toEqual([{ project, library: LIBRARY }]);
        expect(countSelections(sel)).toBe(1);
    });

    it('selects nothing once the library is recorded', async () => {
        const project = edsProject({
            selectedBlockLibraries: ['demo-builder-blocks'],
            installedBlockLibraries: [installedLibrary(LIBRARY.name, LIBRARY.source)],
        });

        const sel = await computeProjectUpdateSelections(project, createMockHandlerContext(), recordsIntegrationProbe());

        expect(sel.blockLibraryInstall).toStrictEqual([]);
        expect(countSelections(sel)).toBe(0);
    });
});

describe('applyUpdatesHeadless — block library installs', () => {
    it('hands the installer the project and library, records the result, and says what was added', async () => {
        const ctx = makeCtx();
        const onProgress = jest.fn();
        const project = edsProject({ selectedBlockLibraries: ['demo-builder-blocks'] });
        mockInstallBlockLibraryFiles.mockResolvedValue({
            success: true,
            blocksCount: 1,
            blockIds: ['commerce-nav'],
            libraryVersions: [{ ...LIBRARY, commitSha: 'src-1', blockIds: ['commerce-nav'] }],
        });
        const sel = { ...emptySelections(), blockLibraryInstall: [{ project, library: LIBRARY }] };

        const res = await applyUpdatesHeadless(sel, ctx, onProgress);

        expect(mockInstallBlockLibraryFiles).toHaveBeenCalledTimes(1);
        expect(mockInstallBlockLibraryFiles).toHaveBeenCalledWith({ project, library: LIBRARY }, ctx);
        expect(onProgress).toHaveBeenCalledWith('Installing block library Demo Builder Blocks');
        expect(project.installedBlockLibraries).toEqual([
            {
                ...LIBRARY,
                commitSha: 'src-1',
                blockIds: ['commerce-nav'],
                installedAt: expect.any(String),
            },
        ]);
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(res.blockLibraryInstall).toEqual({
            successCount: 1,
            failCount: 0,
            errors: [],
            installed: ['Added 1 block from Demo Builder Blocks to demo.'],
        });
        expect(res.totalApplied).toBe(1);
    });

    it.each(['ask', 'disabled'] as const)(
        'installs under syncBehavior "%s" — that setting guards updates, not a first install',
        async (behavior) => {
            setSyncBehavior(behavior);
            const project = edsProject();
            mockInstallBlockLibraryFiles.mockResolvedValue({
                success: true,
                blocksCount: 1,
                blockIds: ['commerce-nav'],
                libraryVersions: [{ ...LIBRARY, commitSha: 'src-1', blockIds: ['commerce-nav'] }],
            });
            const sel = { ...emptySelections(), blockLibraryInstall: [{ project, library: LIBRARY }] };

            const res = await applyUpdatesHeadless(sel, makeCtx());

            expect(mockInstallBlockLibraryFiles).toHaveBeenCalledTimes(1);
            expect(res.blockLibraryInstall.successCount).toBe(1);
            expect(res.addon.deferred).toBeUndefined();
        },
    );

    it('reports a failed install by library name, records nothing, and counts it failed', async () => {
        const ctx = makeCtx();
        const project = edsProject();
        mockInstallBlockLibraryFiles.mockRejectedValue(new Error('No blocks found in source libraries'));
        const sel = { ...emptySelections(), blockLibraryInstall: [{ project, library: LIBRARY }] };

        const res = await applyUpdatesHeadless(sel, ctx);

        expect(res.blockLibraryInstall).toEqual({
            successCount: 0,
            failCount: 1,
            errors: ['Demo Builder Blocks: No blocks found in source libraries'],
        });
        expect(res.totalFailed).toBe(1);
        expect(project.installedBlockLibraries).toBeUndefined();
        expect(ctx.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('never calls the installer when no install is selected', async () => {
        const res = await applyUpdatesHeadless(emptySelections(), makeCtx());

        expect(mockInstallBlockLibraryFiles).not.toHaveBeenCalled();
        expect(res.blockLibraryInstall).toEqual({ successCount: 0, failCount: 0, errors: [] });
    });
});
