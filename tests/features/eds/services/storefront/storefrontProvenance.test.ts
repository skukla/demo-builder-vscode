/**
 * What a storefront was built on and where it came from (EDS-13f step 01).
 *
 * The package.json shapes are the boilerplate's own: `name` and `version` at
 * the top level (`@adobe/aem-boilerplate-commerce`, read by the research on
 * 2026-09-14: aistore 4.0.1, the B2B template 6.0.0).
 */

import {
    boilerplateFloorWarning,
    boilerplateLabel,
    OLDEST_TESTED_BOILERPLATE,
    ourLineage,
    readBoilerplate,
} from '@/features/eds/services/storefront/storefrontProvenance';
import { makeDemoPackage, makeStorefront } from '../../../../helpers/demoPackageFixtures';

const B2B_TEMPLATE = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };

/** One shipped thin-layer brand on the B2B canonical, and one forked brand that is not ours to patch. */
const CATALOG = [
    makeDemoPackage({
        id: 'bodea',
        storefronts: {
            'eds-paas': makeStorefront({
                templateOwner: B2B_TEMPLATE.owner,
                templateRepo: B2B_TEMPLATE.repo,
                codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b' },
                codePatches: ['header-nav-tools-defensive'],
            }),
        },
    }),
    makeDemoPackage({
        id: 'isle5',
        storefronts: { 'eds-paas': makeStorefront({ templateOwner: 'stephen-garner-adobe', templateRepo: 'isle5' }) },
    }),
];

describe('readBoilerplate', () => {
    it("reads the package's name and version", () => {
        const text = JSON.stringify({ name: '@adobe/aem-boilerplate-commerce', version: '4.0.1', dependencies: {} });

        expect(readBoilerplate(text)).toEqual({ name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' });
    });

    it('answers nothing for a missing file, unreadable JSON, or a package with no version', () => {
        expect(readBoilerplate(undefined)).toBeUndefined();
        expect(readBoilerplate('{ not json')).toBeUndefined();
        expect(readBoilerplate(JSON.stringify({ name: 'x' }))).toBeUndefined();
        expect(readBoilerplate(JSON.stringify({ version: '1.0.0' }))).toBeUndefined();
        expect(readBoilerplate(JSON.stringify(['@adobe/aem-boilerplate-commerce']))).toBeUndefined();
    });
});

describe('boilerplateLabel', () => {
    it("names Adobe's Commerce boilerplate in SC words", () => {
        expect(boilerplateLabel({ name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' })).toBe(
            "Adobe's Commerce boilerplate 4.0.1",
        );
    });

    it('names any other package as it calls itself', () => {
        expect(boilerplateLabel({ name: 'my-store', version: '1.2.0' })).toBe('my-store 1.2.0');
    });
});

describe('boilerplateFloorWarning — warn, never refuse, below the oldest tested boilerplate (step 05)', () => {
    const adobe = (version: string) => ({ name: '@adobe/aem-boilerplate-commerce', version });

    it('pins the floor: the B2B template at the patches ledger last-known-good was 6.0.0', () => {
        // Moving this is a deliberate decision (step 05): raise it when the template's major moves.
        expect(OLDEST_TESTED_BOILERPLATE).toBe('6.0.0');
    });

    it('warns in plain words, naming the major line, for a storefront below the floor', () => {
        expect(boilerplateFloorWarning(adobe('4.0.1'))).toBe(
            'Built on an older boilerplate (4.x); some fixes may not fit.',
        );
        expect(boilerplateFloorWarning(adobe('5.9.9'))).toBe(
            'Built on an older boilerplate (5.x); some fixes may not fit.',
        );
    });

    it('says nothing at or above the floor', () => {
        expect(boilerplateFloorWarning(adobe('6.0.0'))).toBeUndefined();
        expect(boilerplateFloorWarning(adobe('10.2.0'))).toBeUndefined();
    });

    it("says nothing for a package that is not Adobe's boilerplate: its version is on another scale", () => {
        expect(boilerplateFloorWarning({ name: 'buildright-website', version: '1.1.0' })).toBeUndefined();
    });

    it('says nothing for a version it cannot read, rather than guessing', () => {
        expect(boilerplateFloorWarning(adobe('next'))).toBeUndefined();
    });
});

describe('ourLineage — the gate for offering our fixes', () => {
    it('matches a repository generated from one of our templates', () => {
        expect(ourLineage({ lineage: { templateRepository: B2B_TEMPLATE } }, CATALOG)).toEqual({
            by: 'template',
            template: B2B_TEMPLATE,
        });
    });

    it('matches a fork of one of our templates, case-insensitively as GitHub is', () => {
        const parent = { owner: 'Adobe-Commerce', repo: 'Boilerplate-B2B-Template' };

        expect(ourLineage({ lineage: { forkParent: parent } }, CATALOG)).toEqual({ by: 'fork', template: B2B_TEMPLATE });
    });

    it("matches a saved package's recorded template", () => {
        expect(ourLineage({ builtWithTemplate: B2B_TEMPLATE }, CATALOG)).toEqual({
            by: 'built-with',
            template: B2B_TEMPLATE,
        });
    });

    it("matches by the boilerplate's package name only as the weakest signal, and says so", () => {
        const boilerplate = { name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' };

        expect(ourLineage({ boilerplate }, CATALOG)).toEqual({ by: 'package-name' });
    });

    it('does not match a shipped template that carries no patches, nor a stranger, nor nothing', () => {
        const isle5 = { owner: 'stephen-garner-adobe', repo: 'isle5' };

        expect(ourLineage({ lineage: { templateRepository: isle5 } }, CATALOG)).toBeUndefined();
        expect(ourLineage({ lineage: { forkParent: { owner: 'jen', repo: 'other' } } }, CATALOG)).toBeUndefined();
        expect(ourLineage({ boilerplate: { name: 'my-store', version: '1.0.0' } }, CATALOG)).toBeUndefined();
        expect(ourLineage({}, CATALOG)).toBeUndefined();
    });

    it('prefers the strongest signal when several are present', () => {
        const result = ourLineage(
            {
                lineage: { templateRepository: B2B_TEMPLATE },
                boilerplate: { name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' },
            },
            CATALOG,
        );

        expect(result?.by).toBe('template');
    });
});
