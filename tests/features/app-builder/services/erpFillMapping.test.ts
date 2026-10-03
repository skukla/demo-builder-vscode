/**
 * erpFillMapping — after a fill, the integration's per-website mapping (which sales
 * organization a website sells under, for one ERP) is filled from the ERP's own sales
 * organizations, only where it is still unset (AB-26y; the design's "Demo Builder pre-fills
 * the mapping"). A value already set is kept and reported, never overwritten.
 */

import {
    fillErpMapping,
    mappingNotes,
    mergeMappings,
    type ErpMappingDeps,
    type ErpSalesOrganization,
} from '@/features/app-builder/services/erpFillMapping';

const ONLINE_US: ErpSalesOrganization = {
    code: '1000',
    name: 'Online US',
    currency: 'USD',
    websiteCode: 'base',
};
const ONLINE_EU: ErpSalesOrganization = {
    code: '2000',
    name: 'Online EU',
    currency: 'EUR',
    websiteCode: 'eu',
};

function depsOf(over: Partial<ErpMappingDeps> = {}): ErpMappingDeps & { save: jest.Mock } {
    return {
        salesOrganizations: async () => [ONLINE_US],
        websiteCodes: async () => ['base', 'eu'],
        entrySettings: async () => undefined,
        ...over,
        save: (over.save as jest.Mock | undefined) ?? jest.fn(async () => undefined),
    };
}

describe('fillErpMapping', () => {
    it("writes a website's sales organization and its name where the ERP's entry has none", async () => {
        const deps = depsOf({ salesOrganizations: async () => [ONLINE_US, ONLINE_EU] });

        const report = await fillErpMapping('demo-erp', deps);

        expect(deps.save.mock.calls).toStrictEqual([
            ['base', { structure_sales_org: '1000', structure_sales_org_name: 'Online US' }],
            ['eu', { structure_sales_org: '2000', structure_sales_org_name: 'Online EU' }],
        ]);
        expect(report).toStrictEqual({
            filled: [
                { erp: 'demo-erp', website: 'base', salesOrg: '1000' },
                { erp: 'demo-erp', website: 'eu', salesOrg: '2000' },
            ],
            kept: [],
        });
    });

    it('keeps a mapping already set to a different sales organization, and reports both', async () => {
        const deps = depsOf({
            entrySettings: async () => ({
                websites: { base: { structure_sales_org: '3000' } },
            }),
        });

        const report = await fillErpMapping('demo-erp', deps);

        expect(deps.save).not.toHaveBeenCalled();
        expect(report).toStrictEqual({
            filled: [],
            kept: [{ erp: 'demo-erp', website: 'base', salesOrg: '3000', erpSalesOrg: '1000' }],
        });
    });

    it('keeps a mapping already set to the same sales organization', async () => {
        const deps = depsOf({
            entrySettings: async () => ({
                websites: { base: { structure_sales_org: '1000' } },
            }),
        });

        const report = await fillErpMapping('demo-erp', deps);

        expect(deps.save).not.toHaveBeenCalled();
        expect(report.kept).toStrictEqual([{ erp: 'demo-erp', website: 'base', salesOrg: '1000' }]);
    });

    it("keeps the sales organization set on the ERP's own entry for every website", async () => {
        const deps = depsOf({ entrySettings: async () => ({ structure_sales_org: '3000' }) });

        const report = await fillErpMapping('demo-erp', deps);

        expect(deps.save).not.toHaveBeenCalled();
        expect(report.kept).toStrictEqual([
            { erp: 'demo-erp', website: 'base', salesOrg: '3000', erpSalesOrg: '1000' },
        ]);
    });

    it('does not replace a name already set at the website when it fills the sales organization', async () => {
        const deps = depsOf({
            entrySettings: async () => ({
                websites: { base: { structure_sales_org_name: 'Typed by hand' } },
            }),
        });

        await fillErpMapping('demo-erp', deps);

        expect(deps.save.mock.calls).toStrictEqual([['base', { structure_sales_org: '1000' }]]);
    });

    it('skips a sales organization naming a website Commerce does not have, and reports it', async () => {
        const deps = depsOf({
            salesOrganizations: async () => [{ ...ONLINE_US, websiteCode: 'gone' }, ONLINE_EU],
        });

        const report = await fillErpMapping('demo-erp', deps);

        expect(deps.save.mock.calls.map(([website]) => website)).toStrictEqual(['eu']);
        expect(report.filled).toStrictEqual([{ erp: 'demo-erp', website: 'eu', salesOrg: '2000' }]);
        expect(report.skipped).toStrictEqual([
            {
                erp: 'demo-erp',
                website: 'gone',
                salesOrg: '1000',
                reason: 'Commerce has no website "gone"',
            },
        ]);
    });

    it('leaves out a sales organization that serves no website', async () => {
        const deps = depsOf({
            salesOrganizations: async () => [{ ...ONLINE_US, websiteCode: null }],
        });

        expect(await fillErpMapping('demo-erp', deps)).toStrictEqual({ filled: [], kept: [] });
        expect(deps.save).not.toHaveBeenCalled();
    });

    it('does nothing, and reads nothing more, when the ERP has no sales organizations yet', async () => {
        const websiteCodes = jest.fn(async () => ['base']);
        const entrySettings = jest.fn(async () => undefined);
        const deps = depsOf({ salesOrganizations: async () => [], websiteCodes, entrySettings });

        expect(await fillErpMapping('demo-erp', deps)).toStrictEqual({ filled: [], kept: [] });
        expect(websiteCodes).not.toHaveBeenCalled();
        expect(entrySettings).not.toHaveBeenCalled();
        expect(deps.save).not.toHaveBeenCalled();
    });

    it('reports a write that fails and goes on to the next website', async () => {
        const save = jest.fn(async (website: string) => {
            if (website === 'base') throw new Error('ERP erps answered 500: store unavailable');
        });
        const deps = depsOf({ salesOrganizations: async () => [ONLINE_US, ONLINE_EU], save });

        const report = await fillErpMapping('demo-erp', deps);

        expect(report.filled).toStrictEqual([{ erp: 'demo-erp', website: 'eu', salesOrg: '2000' }]);
        expect(report.failed).toStrictEqual([
            {
                erp: 'demo-erp',
                website: 'base',
                salesOrg: '1000',
                reason: 'ERP erps answered 500: store unavailable',
            },
        ]);
    });
});

describe('mappingNotes', () => {
    it('says what was filled in one sentence, and warns of nothing', () => {
        const notes = mappingNotes({
            filled: [
                { erp: 'demo-erp', website: 'base', salesOrg: '1000' },
                { erp: 'demo-erp', website: 'eu', salesOrg: '2000' },
            ],
            kept: [],
        });

        expect(notes).toStrictEqual({
            said: "Filled the integration's mapping from the ERP: website base sells under sales organization 1000; website eu sells under sales organization 2000.",
        });
    });

    it('says nothing when everything was kept', () => {
        expect(
            mappingNotes({
                filled: [],
                kept: [{ erp: 'demo-erp', website: 'base', salesOrg: '1000' }],
            }),
        ).toStrictEqual({});
    });

    it('warns of a write that failed, with the reason and what to do', () => {
        const notes = mappingNotes({
            filled: [],
            kept: [],
            failed: [{ erp: 'demo-erp', website: 'base', salesOrg: '1000', reason: 'boom.' }],
        });

        expect(notes).toStrictEqual({
            warning:
                'Demo data loaded; the mapping for website base was not saved: boom. Load demo data again to retry.',
        });
    });
});

describe('mergeMappings', () => {
    it("joins each ERP's rows, in order", () => {
        const merged = mergeMappings([
            { filled: [{ erp: 'demo-erp', website: 'base', salesOrg: '1000' }], kept: [] },
            undefined,
            {
                filled: [],
                kept: [{ erp: 'demo-erp-2', website: 'eu', salesOrg: '2000' }],
                skipped: [{ erp: 'demo-erp-2', website: 'x', salesOrg: '9', reason: 'r' }],
            },
        ]);

        expect(merged).toStrictEqual({
            filled: [{ erp: 'demo-erp', website: 'base', salesOrg: '1000' }],
            kept: [{ erp: 'demo-erp-2', website: 'eu', salesOrg: '2000' }],
            skipped: [{ erp: 'demo-erp-2', website: 'x', salesOrg: '9', reason: 'r' }],
        });
    });

    it('is nothing when no fill ran the mapping step', () => {
        expect(mergeMappings([undefined, undefined])).toBeUndefined();
    });
});
