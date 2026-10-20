/**
 * boilerplateBase — which Adobe commit a colleague's storefront was built from (EDS-56).
 *
 * The GitHub reads are a fake handed in; the decisions and the catalog are real. The
 * first-commit case is shaped on the measurement that motivated it (2026-10-20): GitHub
 * says kmanns/justrite was made from adobe-commerce/boilerplate-b2b-template, and its
 * first commit had every file of 71a67e027 except Adobe's CI workflows.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    readBoilerplateBase,
    resolveBoilerplateBase,
    writeBoilerplateBase,
    type BoilerplateBase,
    type BoilerplateGitHub,
} from '@/features/updates/services/boilerplateBase';
import type { Project } from '@/types/base';
import type { AddedDemo, SharedDemoBuiltWith } from '@/types/projectFile';
import { createMockProject } from '../../../helpers/projectFake';

const B2B = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };
const B2B_LKG = { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' };
const JUSTRITE = { owner: 'kmanns', repo: 'justrite' };
const BASE_SHA = '71a67e027b4b288a67f5cda1fc106d2df9a34805';
const SAVED_SHA = '48bed04d072fff094b49a46709b351bd719b287a';

function colleagueProject(builtWith?: SharedDemoBuiltWith, metadata: Record<string, unknown> = {}): Project {
    const demo: AddedDemo = {
        kind: 'demo',
        version: builtWith ? 2 : 1,
        name: 'Justrite',
        contentSource: { org: 'kmanns', site: 'justrite', indexPath: '/sitemap.json' },
        source: { ...JUSTRITE, branch: 'main' },
        storefrontKind: 'eds',
        ...(builtWith ? { builtWith } : {}),
    };
    return createMockProject({
        name: 'justrite',
        path: '/p/justrite',
        demo,
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { templateOwner: 'kmanns', templateRepo: 'justrite', githubRepo: 'skukla/kukla-justrite', ...metadata },
            },
        },
    });
}

/** The template's app files, with Adobe's CI; the colleague's first commit lacks the CI. */
const TEMPLATE_FILES = { blocks: 'b1', scripts: 's1', 'package.json': 'p1', '.github': 'ci' };
const FIRST_COMMIT_FILES = { blocks: 'b1', scripts: 's1', 'package.json': 'p1', '.github': 'cleaned' };

function github(overrides: Partial<BoilerplateGitHub> = {}): BoilerplateGitHub & { topLevel: jest.Mock } {
    const trees: Record<string, Record<string, string>> = {
        first: FIRST_COMMIT_FILES,
        newer: { ...TEMPLATE_FILES, scripts: 's2' },
        match: TEMPLATE_FILES,
    };
    return {
        repository: jest.fn(async () => ({ createdAt: '2026-09-23T16:38:05Z', templateRepository: B2B })),
        firstCommitTree: jest.fn(async () => 'first'),
        commitsBefore: jest.fn(async () => [
            { sha: 'a'.repeat(40), tree: 'newer' },
            { sha: BASE_SHA, tree: 'match' },
        ]),
        topLevel: jest.fn(async (_repo, tree: string) => trees[tree]),
        ...overrides,
    } as BoilerplateGitHub & { topLevel: jest.Mock };
}

const logger = { debug: jest.fn() };

describe('resolveBoilerplateBase', () => {
    it("finds the base by the colleague's first commit, ignoring Adobe's CI workflows", async () => {
        const gh = github();

        const found = await resolveBoilerplateBase(colleagueProject(), { github: gh, logger });

        expect(found).toEqual({
            base: { template: B2B, commit: BASE_SHA, lkgSource: B2B_LKG, found: 'first-commit' },
            recorded: false,
        });
        // Asked about the template's commits from before the colleague's repository existed.
        expect(gh.commitsBefore).toHaveBeenCalledWith(B2B, '2026-09-23T16:38:05Z');
    });

    it('takes a saved package\'s base before asking GitHub anything', async () => {
        const gh = github();
        const project = colleagueProject({ template: B2B, lkg: SAVED_SHA, extension: '1.0.0' });

        const found = await resolveBoilerplateBase(project, { github: gh, logger });

        expect(found).toEqual({
            base: { template: B2B, commit: SAVED_SHA, lkgSource: B2B_LKG, found: 'built-with' },
            recorded: false,
        });
        expect(gh.repository).not.toHaveBeenCalled();
    });

    it('returns a recorded base as it is', async () => {
        const project = colleagueProject();
        const base: BoilerplateBase = { template: B2B, commit: BASE_SHA, lkgSource: B2B_LKG, found: 'first-commit' };
        writeBoilerplateBase(project, base);

        await expect(resolveBoilerplateBase(project, { github: github(), logger })).resolves.toEqual({
            base,
            recorded: true,
        });
    });

    it.each([
        ['a storefront that already follows the tested template', colleagueProject(undefined, { lkgSource: B2B_LKG }), github(), /already follows the tested template/],
        ['a package saved from a template we do not test', colleagueProject({ template: { owner: 'someone', repo: 'own' }, lkg: SAVED_SHA, extension: '1' }), github(), /someone\/own is not a template Demo Builder tests/],
        ['a repository not made from one of our templates', colleagueProject(), github({ repository: async () => ({ createdAt: '2026-09-23T00:00:00Z' }) }), /was not made from a template Demo Builder tests/],
        ['a first commit that matches nothing', colleagueProject(), github({ commitsBefore: async () => [{ sha: 'a'.repeat(40), tree: 'newer' }] }), /matches no commit of adobe-commerce\/boilerplate-b2b-template/],
        ['GitHub that cannot be read', colleagueProject(), github({ repository: async () => undefined }), /GitHub could not be read for kmanns\/justrite/],
    ])('has no base for %s, and says why', async (_label, project, gh, reason) => {
        const found = await resolveBoilerplateBase(project, { github: gh, logger });

        expect(found).toEqual({ reason: expect.stringMatching(reason) });
    });

    it('has no base for a storefront not built from a colleague\'s demo', async () => {
        const project = colleagueProject();
        delete project.demo;

        await expect(resolveBoilerplateBase(project, { github: github(), logger })).resolves.toEqual({
            reason: "it was not built from a colleague's demo",
        });
    });
});

describe('the recorded base', () => {
    it('is written beside the other storefront fields and removed again', () => {
        const project = colleagueProject();
        const base: BoilerplateBase = { template: B2B, commit: BASE_SHA, lkgSource: B2B_LKG, found: 'first-commit' };

        writeBoilerplateBase(project, base);
        expect(readBoilerplateBase(project)).toEqual(base);
        expect(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).toMatchObject({
            templateOwner: 'kmanns',
            boilerplateBase: base,
        });

        writeBoilerplateBase(project, undefined);
        expect(readBoilerplateBase(project)).toBeUndefined();
        expect(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).not.toHaveProperty('boilerplateBase');
    });

    it('reads a malformed value as none', () => {
        const project = colleagueProject(undefined, { boilerplateBase: { commit: 'short', template: B2B } });

        expect(readBoilerplateBase(project)).toBeUndefined();
    });
});
