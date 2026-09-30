/**
 * DA.live Config Service — content readers (EDS-22).
 *
 * A read grant is one `read` row on the site's path in the ORG permissions sheet.
 * What is pinned here is what a wrong row does in production: a grant that also
 * wrote CONFIG or the org root would make a reader an admin; a grant into an
 * empty sheet without the owner's rows would lock the owner out of their own org
 * (DA.live's remedy for that is Adobe Support); a revoke that dropped a whole
 * multi-address row would revoke people it was never asked about. Assertions read
 * the PUT body, because that is the only place the merge becomes visible.
 *
 * The sheet shape (path | groups | actions, `:names`, multi-sheet) is the one the
 * sibling suites use, captured from storefront-tools' permissions writer.
 */

import {
    DaLiveConfigService,
    mockFetch,
    setupConfigService,
    testEmail,
    testOrg,
    testSite,
    type MultiSheetConfig,
    type PermissionRow,
} from './daLiveConfigService.testUtils';

const OWNER = 'owner@example.com';
const SITE_PATH = `/${testSite}/+**`;

function orgHolding(rows: PermissionRow[]): MultiSheetConfig {
    return {
        ':names': ['data', 'permissions'],
        ':version': 3,
        ':type': 'multi-sheet',
        data: { total: 1, limit: 1, offset: 0, data: [{ 'editor.path': '/ue' }] },
        permissions: { total: rows.length, limit: rows.length, offset: 0, data: rows },
    };
}

const ownerRows = (): PermissionRow[] => [
    { path: 'CONFIG', groups: OWNER, actions: 'write' },
    { path: '/+**', groups: OWNER, actions: 'write' },
    { path: SITE_PATH, groups: OWNER, actions: 'write' },
];

/** The org config the PUT carried. */
function putConfig(): MultiSheetConfig {
    const put = mockFetch.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put).toBeDefined();
    const body = put![1].body as FormData;
    return JSON.parse(body.get('config') as string) as MultiSheetConfig;
}

const putRows = () => putConfig().permissions!.data;

describe('DaLiveConfigService — content readers', () => {
    let service: DaLiveConfigService;

    beforeEach(() => {
        ({ service } = setupConfigService());
    });

    describe('listContentReaders', () => {
        it("lists every address on the site's path, splitting a comma list, with what each may do", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () =>
                    orgHolding([
                        ...ownerRows(),
                        { path: SITE_PATH, groups: `${testEmail}, second@example.com`, actions: 'read' },
                        { path: '/other-site/+**', groups: 'elsewhere@example.com', actions: 'read' },
                    ]),
            });

            await expect(service.listContentReaders(testOrg, testSite)).resolves.toEqual([
                { email: OWNER, actions: 'write' },
                { email: testEmail, actions: 'read' },
                { email: 'second@example.com', actions: 'read' },
            ]);
        });

        it('answers nobody for an org with no config yet', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
            await expect(service.listContentReaders(testOrg, testSite)).resolves.toStrictEqual([]);
        });

        it("throws the refusal through for an org this identity does not own, rather than answering nobody", async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', text: async () => '' });
            await expect(service.listContentReaders(testOrg, testSite)).rejects.toThrow(/401/);
        });
    });

    describe('grantContentRead', () => {
        it('adds exactly one read row on the site path, and nothing on CONFIG or the org root', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200, json: async () => orgHolding(ownerRows()) })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            const result = await service.grantContentRead(testOrg, testSite, testEmail, OWNER);

            expect(result).toEqual({ success: true });
            expect(putRows()).toEqual([
                ...ownerRows(),
                { path: SITE_PATH, groups: testEmail, actions: 'read', comments: `Demo Builder - ${testSite} content read` },
            ]);
            // The org's other sheets ride along untouched.
            expect(putConfig().data).toEqual(orgHolding([]).data);
            expect(putConfig()[':names']).toEqual(['data', 'permissions']);
            expect(mockFetch.mock.calls[1][0]).toBe(`https://admin.da.live/config/${testOrg}/`);
        });

        it("writes the owner's own write rows first when the sheet is empty, so the grant never locks them out", async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 404 })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            await service.grantContentRead(testOrg, testSite, testEmail, OWNER);

            const rows = putRows();
            expect(rows.slice(0, 3).map((r) => [r.path, r.groups, r.actions])).toEqual([
                ['CONFIG', OWNER, 'write'],
                ['/+**', OWNER, 'write'],
                [SITE_PATH, OWNER, 'write'],
            ]);
            expect(rows[3]).toMatchObject({ path: SITE_PATH, groups: testEmail, actions: 'read' });
            expect(putConfig()[':names']).toEqual(['permissions']);
        });

        it('leaves an address that can already read or write the path alone — no duplicate, no downgrade', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => orgHolding([...ownerRows(), { path: SITE_PATH, groups: testEmail.toUpperCase(), actions: 'write' }]),
            });

            const result = await service.grantContentRead(testOrg, testSite, testEmail, OWNER);

            expect(result).toEqual({ success: true });
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('reports a refused write instead of throwing', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200, json: async () => orgHolding(ownerRows()) })
                .mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'not yours' });

            const result = await service.grantContentRead(testOrg, testSite, testEmail, OWNER);

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/403/);
        });
    });

    describe('revokeContentRead', () => {
        it("removes the address from the site's read rows and keeps everyone else, write rows included", async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () =>
                        orgHolding([
                            ...ownerRows(),
                            { path: SITE_PATH, groups: `${testEmail}, second@example.com`, actions: 'read' },
                            { path: SITE_PATH, groups: testEmail, actions: 'read' },
                        ]),
                })
                .mockResolvedValueOnce({ ok: true, status: 200 });

            const result = await service.revokeContentRead(testOrg, testSite, testEmail);

            expect(result).toEqual({ success: true });
            expect(putRows()).toEqual([
                ...ownerRows(),
                { path: SITE_PATH, groups: 'second@example.com', actions: 'read' },
            ]);
        });

        it("never touches a write row, so revoking the owner's read is a no-op that writes nothing", async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => orgHolding(ownerRows()) });

            const result = await service.revokeContentRead(testOrg, testSite, OWNER);

            expect(result).toEqual({ success: true });
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });
});
