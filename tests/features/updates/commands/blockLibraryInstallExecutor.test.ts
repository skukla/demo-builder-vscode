/**
 * performBlockLibraryInstalls — the QuickPick shell around a block-library
 * install (EDS-28): what it hands the shared core, and what it tells the SC.
 * The core itself is exercised against a real installer in
 * services/blockLibraryInstall.test.ts.
 */

const mockApply = jest.fn();
jest.mock('@/features/updates/services/blockLibraryInstall', () => ({
    ...jest.requireActual('@/features/updates/services/blockLibraryInstall'),
    applyBlockLibraryInstall: (...a: unknown[]) => mockApply(...a),
}));
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(),
}));

import { makeUpdateContext } from './updateExecutor.testUtils';
import * as vscode from 'vscode';
import { performBlockLibraryInstalls } from '@/features/updates/commands/blockLibraryInstallExecutor';
import type { BlockLibraryInstallItem } from '@/features/updates/commands/updateTypes';
import { createMockProject } from '../../../helpers/projectFake';

const showInfo = vscode.window.showInformationMessage as jest.Mock;
const showError = vscode.window.showErrorMessage as jest.Mock;

const library = {
    name: 'Demo Builder Blocks',
    source: { owner: 'skukla', repo: 'demo-builder-block-library', branch: 'main' },
};

function item(name: string): BlockLibraryInstallItem {
    return {
        label: name,
        project: createMockProject({ name, path: `/p/${name}` }),
        library,
        isBlockLibraryInstall: true,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('performBlockLibraryInstalls', () => {
    it('hands the core the picked project and library, and says what was added', async () => {
        const ctx = makeUpdateContext();
        const picked = item('demo');
        mockApply.mockResolvedValue({ name: library.name, blockIds: ['commerce-nav'] });

        await performBlockLibraryInstalls([picked], ctx);

        expect(mockApply).toHaveBeenCalledTimes(1);
        expect(mockApply).toHaveBeenCalledWith({ project: picked.project, library }, ctx);
        expect(showInfo).toHaveBeenCalledWith(
            'demo — Demo Builder Blocks: installed 1 block (commerce-nav)',
        );
        expect(showError).not.toHaveBeenCalled();
    });

    it('does nothing at all when nothing was picked', async () => {
        await performBlockLibraryInstalls([], makeUpdateContext());

        expect(mockApply).not.toHaveBeenCalled();
        expect(showInfo).not.toHaveBeenCalled();
    });

    it('reports a failure by name and still installs the next one', async () => {
        const ctx = makeUpdateContext();
        mockApply
            .mockRejectedValueOnce(new Error('GitHub said no'))
            .mockResolvedValueOnce({ name: library.name, blockIds: [] });

        await performBlockLibraryInstalls([item('first'), item('second')], ctx);

        expect(showError).toHaveBeenCalledWith(
            expect.stringMatching(/^Failed to install Demo Builder Blocks in first: .*GitHub said no/),
        );
        expect(mockApply).toHaveBeenCalledTimes(2);
        expect(showInfo).toHaveBeenCalledWith(expect.stringMatching(/^second — .*nothing to add/));
    });
});
