/**
 * `grantUserAccess` decides, three times, whether a permission row already
 * exists — and each decision is "this email AND this path", never one or the
 * other.
 *
 * Getting that wrong is silent in both directions. Matching on the email alone
 * means an SC who already has SOME row is never granted the two they are
 * missing, and DA.live answers 403 on a listing they were told they could do.
 * Matching on the path alone means a row belonging to a colleague suppresses
 * the grant entirely. Neither shows up in the result — `grantUserAccess`
 * returns `{ success: true }` for a config it wrote wrongly.
 *
 * So these drive the merge from four starting configs and assert the ROW SET
 * that goes out in the PUT, which is the only place the decision is visible.
 *
 * The three paths, for reference:
 *   CONFIG          — required by DA.live before it will accept a config write
 *   /+**            — the org root; without it, listing projects is a 403
 *   /{site}/+**     — the site's own content
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

const ROOT_PATH = '/+**';
const SITE_PATH = `/${testSite}/+**`;
const OTHER_EMAIL = 'colleague@example.com';

/** A config carrying exactly these permission rows. */
const configWith = (...data: PermissionRow[]): MultiSheetConfig => ({
    ':names': ['permissions'],
    ':version': 3,
    ':type': 'multi-sheet',
    permissions: { total: data.length, limit: data.length, offset: 0, data },
});

const row = (groups: string, path: string): PermissionRow => ({
    groups,
    path,
    actions: 'write',
});

describe('DaLiveConfigService.grantUserAccess — the permission merge', () => {
    let service: DaLiveConfigService;

    beforeEach(() => {
        ({ service } = setupConfigService());
    });

    /** Run the grant against a starting org config and read back what it PUT. */
    async function grantAgainst(existing: MultiSheetConfig | null) {
        mockFetch
            .mockResolvedValueOnce(
                existing
                    ? { ok: true, status: 200, json: jest.fn().mockResolvedValue(existing) }
                    : { ok: false, status: 404 },
            )
            .mockResolvedValueOnce({ ok: true, status: 200 });

        const result = await service.grantUserAccess(testOrg, testSite, testEmail);
        const body = mockFetch.mock.calls[1][1].body as FormData;
        return { result, written: JSON.parse(body.get('config') as string) as MultiSheetConfig };
    }

    it('writes all three rows when the org has no config at all', async () => {
        const { result, written } = await grantAgainst(null);

        expect(result).toEqual({ success: true });
        expect(written.permissions?.data).toEqual([
            { path: 'CONFIG', groups: testEmail, actions: 'write', comments: expect.any(String) },
            { path: ROOT_PATH, groups: testEmail, actions: 'write', comments: expect.any(String) },
            { path: SITE_PATH, groups: testEmail, actions: 'write', comments: expect.any(String) },
        ]);
        // The column widths DA.live's sheet editor renders the permissions
        // table with; an empty list collapses every column.
        expect(written.permissions?.[':colWidths']).toEqual([200, 350, 75, 150]);
        expect(written[':names']).toEqual(['permissions']);
    });

    it('does not let a COLLEAGUE’s rows count as this user’s', async () => {
        // All three paths are present — for somebody else. The user still needs
        // all three of their own.
        const { written } = await grantAgainst(
            configWith(
                row(OTHER_EMAIL, 'CONFIG'),
                row(OTHER_EMAIL, ROOT_PATH),
                row(OTHER_EMAIL, SITE_PATH),
            ),
        );

        expect(written.permissions?.data).toHaveLength(6);
        for (const path of ['CONFIG', ROOT_PATH, SITE_PATH]) {
            expect(written.permissions?.data).toContainEqual(
                expect.objectContaining({ groups: testEmail, path }),
            );
        }
    });

    it('does not let the user’s row on ANOTHER path count for these three', async () => {
        const { written } = await grantAgainst(configWith(row(testEmail, '/somewhere-else/+**')));

        expect(written.permissions?.data).toHaveLength(4);
    });

    it('adds only what is missing when the user already holds one of the three', async () => {
        // The site row is already theirs; CONFIG and the org root are not.
        const { written } = await grantAgainst(configWith(row(testEmail, SITE_PATH)));

        expect(written.permissions?.data).toHaveLength(3);
        expect(written.permissions?.data).toContainEqual(
            expect.objectContaining({ groups: testEmail, path: 'CONFIG' }),
        );
        expect(written.permissions?.data).toContainEqual(
            expect.objectContaining({ groups: testEmail, path: ROOT_PATH }),
        );
    });

    it('survives an org config that has no permissions sheet yet', async () => {
        const { result, written } = await grantAgainst({
            ':names': ['data'],
            ':version': 3,
            ':type': 'multi-sheet',
        });

        expect(result).toEqual({ success: true });
        expect(written.permissions?.data).toHaveLength(3);
    });
});

/**
 * `:names` lists the sheets in the document. DA.live ignores a sheet that is not
 * named there, so a permissions sheet written without the name is written and
 * then not read — and the grant still reports success.
 */
describe('DaLiveConfigService.grantUserAccess — the :names sheet list', () => {
    let service: DaLiveConfigService;

    beforeEach(() => {
        ({ service } = setupConfigService());
    });

    async function namesAfterGrant(names: string[]) {
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: jest
                    .fn()
                    .mockResolvedValue({ ':names': names, ':version': 3, ':type': 'multi-sheet' }),
            })
            .mockResolvedValueOnce({ ok: true, status: 200 });

        await service.grantUserAccess(testOrg, testSite, testEmail);
        const body = mockFetch.mock.calls[1][1].body as FormData;
        return (JSON.parse(body.get('config') as string) as MultiSheetConfig)[':names'];
    }

    it('appends permissions to a list that does not name it', async () => {
        expect(await namesAfterGrant(['data'])).toEqual(['data', 'permissions']);
    });

    it('leaves a list that already names it alone', async () => {
        expect(await namesAfterGrant(['permissions', 'data'])).toEqual(['permissions', 'data']);
    });
});
