/**
 * The installed-library lookup both block-library apply paths open with.
 *
 * `findInstalledLibrary` is what decides whether an update item still names a
 * library the project has. The UI path asks it before prompting, so a dropped
 * library never raises a dialog; the resolved path asks it before writing.
 */

import { makeUpdateContext } from '../commands/updateExecutor.testUtils';
import {
    applyBlockLibraryUpdateResolved,
    findInstalledLibrary,
} from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';

function makeLibrary(name: string): InstalledBlockLibrary {
    return {
        name,
        source: { owner: 'org', repo: name, branch: 'main' },
        commitSha: 'aaa111',
        blockIds: ['hero'],
        installedAt: '2026-01-01T00:00:00.000Z',
    };
}

function makeProject(installedBlockLibraries: InstalledBlockLibrary[] | undefined): Project {
    return createMockProject({ installedBlockLibraries });
}

describe('findInstalledLibrary', () => {
    it('returns the project record that carries the item library name', () => {
        const logger = createMockLogger();
        const wanted = makeLibrary('hero');
        const project = makeProject([makeLibrary('cards'), wanted]);

        const found = findInstalledLibrary(
            { project, library: makeLibrary('hero'), latestCommit: 'bbb222' },
            { logger },
        );

        expect(found).toBe(wanted);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('warns once and returns undefined when the project no longer lists it', () => {
        const logger = createMockLogger();
        const project = makeProject([makeLibrary('cards')]);

        const found = findInstalledLibrary(
            { project, library: makeLibrary('hero'), latestCommit: 'bbb222' },
            { logger },
        );

        expect(found).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('treats a project with no installedBlockLibraries as not listing the library', () => {
        const logger = createMockLogger();

        const found = findInstalledLibrary(
            { project: makeProject(undefined), library: makeLibrary('hero'), latestCommit: 'c' },
            { logger },
        );

        expect(found).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});

describe('applyBlockLibraryUpdateResolved when the project no longer lists the library', () => {
    it('warns, writes nothing and resolves', async () => {
        const ctx = makeUpdateContext();
        const project = makeProject([makeLibrary('cards')]);

        await expect(
            applyBlockLibraryUpdateResolved(
                { project, library: makeLibrary('hero'), latestCommit: 'bbb222' },
                'disabled',
                ctx,
            ),
        ).resolves.toBeUndefined();

        expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
        expect(ctx.stateManager.saveProject).not.toHaveBeenCalled();
    });
});
