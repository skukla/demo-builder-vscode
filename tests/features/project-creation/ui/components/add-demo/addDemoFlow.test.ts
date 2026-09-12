/**
 * The pure half of "Add a demo": the found rows, the row the dialog commits,
 * and the footer label.
 */

import {
    buildAddedDemo,
    continueLabel,
    defaultDemoName,
    foundRows,
    INITIAL_DRAFT,
    isBuildable,
} from '@/features/project-creation/ui/components/add-demo/addDemoFlow';
import type { SharedDemoRead } from '@/types/webviewRequests';

const READ: SharedDemoRead = {
    outcome: 'read',
    fullName: 'jen/isle5-demo',
    defaultBranch: 'main',
    isTemplate: false,
    kind: 'eds',
    contentSource: { org: 'jen', site: 'isle5-demo' },
    contentPublished: { indexFound: true, pageCount: 12 },
    storeCodes: { websiteCode: 'isle5', storeCode: 'isle5_store', storeViewCode: 'isle5_us' },
    b2b: 'on',
    b2bSource: 'config-json',
    overrides: [],
    warnings: [],
};

describe('defaultDemoName', () => {
    it("prefers the description file's name, else spells the repository for people", () => {
        expect(defaultDemoName(READ)).toBe('Isle5 Demo');
        expect(defaultDemoName({ ...READ, description: { kind: 'demo', version: 1, name: 'Isle5 by Jen' } })).toBe(
            'Isle5 by Jen',
        );
    });
});

describe('isBuildable', () => {
    it('is true for an EDS or headless read, false for everything else', () => {
        expect(isBuildable(READ)).toBe(true);
        expect(isBuildable({ ...READ, kind: 'headless' })).toBe(true);
        expect(isBuildable({ ...READ, kind: 'not-a-storefront' })).toBe(false);
        expect(isBuildable({ outcome: 'unreadable', reason: 'x' })).toBe(false);
        expect(isBuildable({ outcome: 'shipped', shippedPackageId: 'starter', fullName: 'a/b' })).toBe(false);
        expect(isBuildable(undefined)).toBe(false);
    });
});

describe('foundRows', () => {
    it('names the kind, the pages, the codes and the B2B answer when known', () => {
        expect(foundRows(READ)).toEqual([
            { label: 'Storefront', value: 'Edge Delivery', done: true },
            { label: 'Pages', value: '12 published pages', done: true },
            { label: 'Store codes', value: 'isle5 · isle5_store · isle5_us', done: true },
            { label: 'Company (B2B) features', value: 'On', done: true },
        ]);
    });

    it('leaves the B2B row out when nothing said, and marks missing pages and codes as not set', () => {
        const rows = foundRows({
            ...READ,
            b2b: 'unknown',
            b2bSource: undefined,
            storeCodes: undefined,
            contentPublished: { indexFound: false },
        });
        expect(rows.map((r) => r.label)).toEqual(['Storefront', 'Pages', 'Store codes']);
        expect(rows[1]).toEqual({ label: 'Pages', value: undefined, done: false });
        expect(rows[2]).toEqual({ label: 'Store codes', value: undefined, done: false });
    });

    it('does not ask a headless demo for pages', () => {
        expect(foundRows({ ...READ, kind: 'headless' })[1]).toEqual({
            label: 'Pages',
            value: 'Not needed for a headless demo',
            done: true,
        });
    });
});

describe('buildAddedDemo', () => {
    it('writes the codes under both key families and the two B2B flags when B2B is on', () => {
        const row = buildAddedDemo(READ, INITIAL_DRAFT);
        expect(row).toEqual({
            kind: 'demo',
            version: 1,
            name: 'Isle5 Demo',
            configDefaults: {
                ADOBE_COMMERCE_WEBSITE_CODE: 'isle5',
                ACCS_WEBSITE_CODE: 'isle5',
                ADOBE_COMMERCE_STORE_CODE: 'isle5_store',
                ACCS_STORE_CODE: 'isle5_store',
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'isle5_us',
                ACCS_STORE_VIEW_CODE: 'isle5_us',
            },
            configFlags: { 'commerce-b2b-enabled': true, 'commerce-companies-enabled': true },
            contentSource: { org: 'jen', site: 'isle5-demo' },
            source: { owner: 'jen', repo: 'isle5-demo' },
            storefrontKind: 'eds',
        });
    });

    it("takes the SC's switch when the probe could not tell, and the typed name", () => {
        const unknown: SharedDemoRead = { ...READ, b2b: 'unknown', b2bSource: undefined };
        expect(buildAddedDemo(unknown, INITIAL_DRAFT)).not.toHaveProperty('configFlags');
        const row = buildAddedDemo(unknown, { ...INITIAL_DRAFT, b2bOn: true, name: '  Isle5 by Jen  ' });
        expect(row.configFlags).toEqual({ 'commerce-b2b-enabled': true, 'commerce-companies-enabled': true });
        expect(row.name).toBe('Isle5 by Jen');
    });

    it("carries the description file's own statements and its defaults over the read codes", () => {
        const withFile: SharedDemoRead = {
            ...READ,
            description: {
                kind: 'demo',
                version: 1,
                name: 'Isle5 by Jen',
                description: 'B2B with custom blocks',
                configDefaults: { ACCS_WEBSITE_CODE: 'other' },
                requiresMesh: 'optional',
                datapack: { name: 'isle5' },
                integrations: { catalog: ['erp-sync'] },
                blockLibraries: ['demo-team-blocks'],
            },
        };
        const row = buildAddedDemo(withFile, INITIAL_DRAFT);
        expect(row).toEqual(
            expect.objectContaining({
                name: 'Isle5 by Jen',
                description: 'B2B with custom blocks',
                configDefaults: { ACCS_WEBSITE_CODE: 'other' },
                requiresMesh: 'optional',
                datapack: { name: 'isle5' },
                integrations: { catalog: ['erp-sync'] },
                blockLibraries: ['demo-team-blocks'],
            }),
        );
    });

    it('records a Next.js repository as headless', () => {
        expect(buildAddedDemo({ ...READ, kind: 'headless' }, INITIAL_DRAFT).storefrontKind).toBe('headless');
    });
});

describe('continueLabel', () => {
    it('is Continue on the link stage, Use <name> for a shipped template, Add demo otherwise', () => {
        expect(continueLabel('link', undefined, undefined)).toBe('Continue');
        expect(
            continueLabel('found', { outcome: 'shipped', shippedPackageId: 'starter', fullName: 'a/b' }, 'Starter (B2B + B2C)'),
        ).toBe('Use Starter (B2B + B2C)');
        expect(continueLabel('found', READ, undefined)).toBe('Add demo');
    });
});
