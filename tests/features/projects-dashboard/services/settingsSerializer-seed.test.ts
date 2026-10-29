/**
 * settingsSerializer — the seed Copy and Edit open the wizard with.
 *
 * Both are the file Export writes, read back through the reader Import uses. The
 * main suite asserts what that file carries; this one asserts the two things that
 * are true only of a seed: no extension wrote it, and the reader can refuse it.
 */

import {
    copySeedFromProject,
    extractSettingsFromProject,
} from '@/features/projects-dashboard/services/settingsSerializer';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

function sourceProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'bodea-demo',
        path: '/projects/bodea-demo',
        componentSelections: { frontend: 'eds-storefront' },
        componentConfigs: { 'eds-storefront': { SITE_NAME: 'bodea' } },
        ...overrides,
    });
}

/**
 * A project the reader refuses. Project state is read off disk, so a field can
 * hold a value its type forbids; the stack is a string in the file's schema.
 */
function unreadableProject(): Project {
    const project = sourceProject();
    (project as { selectedStack?: unknown }).selectedStack = 42;
    return project;
}

describe('copySeedFromProject', () => {
    it('names the project it came from, and no extension version: no extension wrote it', () => {
        // An exported file records the version that wrote it. A seed is built in
        // memory and never written, so claiming a version would be provenance for
        // a file that does not exist.
        const read = copySeedFromProject(sourceProject());

        if (!read.ok) throw new Error(`the seed did not read back: ${read.error}`);
        expect(read.file.source).toStrictEqual({ project: 'bodea-demo', extension: '' });
    });

    it('hands back the refusal of the reader Import uses, rather than a seed it would not accept', () => {
        const read = copySeedFromProject(unreadableProject());

        expect(read.ok).toBe(false);
    });
});

describe('extractSettingsFromProject, for a project the reader refuses', () => {
    it('throws, naming the project and the reason the reader gave', () => {
        // Without the throw, Edit opens the wizard on a seed with no selections at
        // all, and Finish writes that back over the SC's project.
        const project = unreadableProject();
        const refusal = copySeedFromProject(project);
        if (refusal.ok) throw new Error('fixture drift: the reader accepted this project');

        let thrown: unknown;
        try {
            extractSettingsFromProject(project);
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toContain('bodea-demo');
        expect((thrown as Error).message).toContain(refusal.error);
    });

    it('opens the same project once the field is repaired - the control', () => {
        expect(extractSettingsFromProject(sourceProject()).selections).toStrictEqual({
            frontend: 'eds-storefront',
        });
    });
});
