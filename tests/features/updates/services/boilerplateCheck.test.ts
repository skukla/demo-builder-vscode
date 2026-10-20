/**
 * boilerplateCheck — Check for Updates' Adobe boilerplate check (EDS-56).
 *
 * The base lookup runs for real on a recorded base or a fake GitHub; the tested pointer and
 * GitHub's compare are handed in. What is pinned: an entry only when the tested version is
 * AHEAD of the base, never "up to date" on a failed read, and a base found for the first time
 * is recorded and saved once.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    readBoilerplateBase,
    writeBoilerplateBase,
    type BoilerplateBase,
    type BoilerplateGitHub,
} from '@/features/updates/services/boilerplateBase';
import { checkBoilerplate, type BoilerplateCheckDeps } from '@/features/updates/services/boilerplateCheck';
import type { GitHubCompareResponse } from '@/features/updates/services/githubApiClient';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const B2B = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };
const B2B_LKG = { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' };
const BASE_SHA = '71a67e027b4b288a67f5cda1fc106d2df9a34805';
const TESTED_SHA = '48bed04d072fff094b49a46709b351bd719b287a';
const BASE: BoilerplateBase = { template: B2B, commit: BASE_SHA, lkgSource: B2B_LKG, found: 'first-commit' };

function storefront(base?: BoilerplateBase): Project {
    const project = createMockProject({
        name: 'justrite',
        path: '/p/justrite',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { templateOwner: 'kmanns', templateRepo: 'justrite' },
            },
        },
    });
    if (base) writeBoilerplateBase(project, base);
    return project;
}

const ahead = (by: number): GitHubCompareResponse => ({ ahead_by: by });

function deps(overrides: Partial<BoilerplateCheckDeps> = {}) {
    const github: BoilerplateGitHub = {
        repository: jest.fn(async () => undefined),
        firstCommitTree: jest.fn(async () => undefined),
        commitsBefore: jest.fn(async () => undefined),
        topLevel: jest.fn(async () => undefined),
    };
    return {
        secrets: createMockSecretStorage().secrets,
        logger: createMockLogger(),
        github,
        save: jest.fn(async () => undefined),
        readTested: jest.fn(async () => TESTED_SHA),
        compare: jest.fn(async () => ahead(73)),
        ...overrides,
    };
}

describe('checkBoilerplate', () => {
    it('offers the tested version when it is ahead of the base, measured on the template', async () => {
        const project = storefront(BASE);
        const d = deps();

        await expect(checkBoilerplate([project], d)).resolves.toEqual([{ project, base: BASE, tested: TESTED_SHA }]);
        expect(d.readTested).toHaveBeenCalledWith(B2B_LKG, d.logger);
        expect(d.compare).toHaveBeenCalledWith(d.secrets, 'adobe-commerce', 'boilerplate-b2b-template', BASE_SHA, TESTED_SHA);
    });

    it.each([
        ['the base is the tested version', { readTested: jest.fn(async () => BASE_SHA) }],
        // A colleague who moved past our tested version is never taken backwards.
        ['the tested version is not ahead of the base', { compare: jest.fn(async () => ahead(0)) }],
    ])('offers nothing when %s', async (_label, overrides) => {
        await expect(checkBoilerplate([storefront(BASE)], deps(overrides))).resolves.toStrictEqual([]);
    });

    it.each([
        ['the tested pointer cannot be read', { readTested: jest.fn(async () => undefined) }],
        ['GitHub does not answer the compare', { compare: jest.fn(async () => null) }],
    ])('offers nothing and warns when %s, never "up to date"', async (_label, overrides) => {
        const d = deps(overrides);

        await expect(checkBoilerplate([storefront(BASE)], d)).resolves.toStrictEqual([]);
        expect(d.logger.warn).toHaveBeenCalledTimes(1);
    });

    it('records and saves a base found for the first time, and only then', async () => {
        const project = storefront();
        project.demo = {
            kind: 'demo',
            version: 2,
            name: 'Justrite',
            contentSource: { org: 'kmanns', site: 'justrite', indexPath: '/sitemap.json' },
            source: { owner: 'kmanns', repo: 'justrite' },
            storefrontKind: 'eds',
            builtWith: { template: B2B, lkg: BASE_SHA, extension: '1.0.0' },
        };
        const d = deps();

        await checkBoilerplate([project], d);
        await checkBoilerplate([project], d);

        expect(readBoilerplateBase(project)).toEqual({ ...BASE, found: 'built-with' });
        expect(d.save).toHaveBeenCalledTimes(1);
    });

    // Why it does not qualify is the lookup's to say (boilerplateBase.test) and the report's
    // to show (storefrontReport.test); here it is only that nothing is offered or saved.
    it('offers nothing for a storefront not built from a colleague\'s demo, and saves nothing', async () => {
        const d = deps();

        await expect(checkBoilerplate([storefront()], d)).resolves.toStrictEqual([]);
        expect(d.save).not.toHaveBeenCalled();
    });
});
