/**
 * Content-authoring tools — RESPONSE SIZE.
 *
 * Split from contentAuthoringTools.test.ts to keep both files under the 500-line
 * limit. The mock preamble is duplicated because jest.mock is hoisted per file
 * and cannot be shared; the fixtures and harness are identical on purpose.
 */

import {
    DaLiveOpsDouble,
    okResponse,
    register,
    setupContentAuthoring,
} from './contentAuthoringTools.testUtils';
import { expectWithinCeiling } from './responseCeilings';

let daOps: DaLiveOpsDouble;
let fetchMock: jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    ({ daOps, fetchMock } = setupContentAuthoring());
});

// ─── response-size ceilings (phase 2 audit) ──────────────────────────────────
//
// Driven with OVERSIZED payloads — a 900-entry directory, a body past the read
// cap — because both bloat shapes this audit found (a list with no page size, a
// field carried for the dashboard) are invisible at fixture scale.
/** What `list_content` answers with — the fields these tests read. */
interface ContentListing {
    total: number;
    skip: number;
    limit: number;
    entries: Array<{ path?: string; name?: string }>;
}

describe('response-size ceilings', () => {
    it('list_content — a 900-entry site root is paged, not dumped', async () => {
        daOps.listDirectory.mockResolvedValueOnce(
            Array.from({ length: 900 }, (_, i) => ({
                name: `page-number-${i}`,
                path: `/skukla/bodea/section/page-number-${i}.html`,
                ext: 'html',
            }))
        );

        const listing = register();
        const res = await listing.call<ContentListing>('list_content', {});

        expectWithinCeiling('list_content', JSON.stringify(res));
        expect(res.total).toBe(900);
        expect(res.entries.length).toBeLessThan(900);
    });

    it('list_content — the SECOND page is not the first one again', async () => {
        // The paging test above only proves the first page is short. Nothing asked
        // for a later one, so a tool that ignored `skip` and always answered with
        // entries 0..limit passed — measured 2026-09-02 by making it do exactly
        // that, and the suite stayed green.
        const entries = Array.from({ length: 900 }, (_, i) => ({
            name: `page-number-${i}`,
            path: `/skukla/bodea/section/page-number-${i}.html`,
            ext: 'html',
        }));
        daOps.listDirectory.mockResolvedValue(entries);

        const listing = register();
        const first = await listing.call<ContentListing>('list_content', { limit: 10 });
        const second = await listing.call<ContentListing>('list_content', { limit: 10, skip: 10 });

        expect(second.skip).toBe(10);
        expect(second.entries).not.toEqual(first.entries);
        expect(second.entries[0]).not.toEqual(first.entries[0]);
    });

    it('read_page — the service cap survives the tool', async () => {
        daOps.readSource.mockResolvedValueOnce({
            status: 200,
            body: 'x'.repeat(30_000),
            bytes: 5_000_000,
            truncated: true,
        });

        const res = await register().call('read_page', { path: '/big' });

        expectWithinCeiling('read_page', JSON.stringify(res));
        expect(res.truncated).toBe(true);
    });

    it('read_published_page — an oversized CDN body is capped', async () => {
        fetchMock.mockResolvedValueOnce(okResponse('y'.repeat(500_000), 200));

        const res = await register().call('read_published_page', { path: '/big' });

        expectWithinCeiling('read_published_page', JSON.stringify(res));
        expect(res.truncated).toBe(true);
    });

    it.each([
        ['write_page', { path: '/a', content: '<p>x</p>' }],
        ['publish_page', { path: '/a' }],
        ['delete_page', { path: '/a', confirm: true }],
    ])('%s — outcome responses stay tiny', async (tool, args) => {
        expectWithinCeiling(tool, JSON.stringify(await register().call(tool, args)));
    });
});
