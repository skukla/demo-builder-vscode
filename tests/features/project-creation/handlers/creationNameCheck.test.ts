/**
 * projectNameProblem — the one name check every creation door runs (AI-73).
 * Creation removes whatever folder already has the new name, so a name this lets
 * through is a folder creation may delete.
 */

import { projectNameProblem } from '@/features/project-creation/handlers/creationNameCheck';

const listing = (...projects: Array<{ name: string; path: string }>) => ({
    getAllProjects: jest.fn(async () => projects.map((p) => ({ ...p, lastModified: new Date(0) }))),
});

describe('projectNameProblem', () => {
    it('lets a new, safe name through', async () => {
        await expect(projectNameProblem(listing(), { projectName: 'fresh-demo' })).resolves.toBeUndefined();
    });

    it.each([['../outside'], ['a/b'], ['a\\b'], ['with space'], ['']])(
        'refuses the unsafe name %p, with the reason and the validator error',
        async (projectName) => {
            const problem = await projectNameProblem(listing(), { projectName });

            expect(problem?.summary).toMatch(/^Invalid project name: /);
            expect(problem?.detail).toBe(problem?.summary);
            expect(problem?.invalid).toBeInstanceOf(Error);
        },
    );

    it('never lists the projects for an unsafe name', async () => {
        const state = listing();

        await projectNameProblem(state, { projectName: '../x' });

        expect(state.getAllProjects).not.toHaveBeenCalled();
    });

    it("refuses another project's name, naming where that project is", async () => {
        const problem = await projectNameProblem(listing({ name: 'demo', path: '/p/demo' }), {
            projectName: 'demo',
        });

        expect(problem).toEqual({
            takenBy: '/p/demo',
            summary: 'Project "demo" already exists',
            detail:
                'Project "demo" already exists. Please choose a different name or delete the existing project first.',
        });
    });

    it('lets an edit keep its own project name', async () => {
        const state = listing({ name: 'demo', path: '/p/demo' });

        await expect(
            projectNameProblem(state, { projectName: 'demo', editProjectPath: '/p/demo' }),
        ).resolves.toBeUndefined();
    });

    it("refuses an edit that takes ANOTHER project's name", async () => {
        const state = listing({ name: 'demo', path: '/p/demo' });

        const problem = await projectNameProblem(state, {
            projectName: 'demo',
            editProjectPath: '/p/other',
        });

        expect(problem?.takenBy).toBe('/p/demo');
    });
});
