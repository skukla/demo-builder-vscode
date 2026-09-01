/**
 * Projectors — each one encodes a fix phase 2 wrote by hand, so each test names
 * the measurement that made it necessary.
 */

import {
    AGENT_PAGE_SIZE,
    indexDetail,
    leanList,
    legend,
    verdictOnly,
} from '@/features/ai/server/projectors';

describe('leanList', () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({ id: `id-${i}`, art: 'thumb', big: 'x'.repeat(200) }));

    it('pages by default — an agent\'s first call is always {}', () => {
        const out = leanList(rows, (r) => ({ id: r.id }));
        expect(out.count).toBe(AGENT_PAGE_SIZE);
        expect(out.items).toHaveLength(AGENT_PAGE_SIZE);
    });

    it('projects each row, dropping dashboard-only fields', () => {
        const out = leanList(rows, (r) => ({ id: r.id }), { limit: 2 });
        expect(out.items[0]).toEqual({ id: 'id-0' });
        expect(JSON.stringify(out)).not.toContain('thumb');
    });

    it('honours skip', () => {
        const out = leanList(rows, (r) => r.id, { limit: 3, skip: 10 });
        expect(out.items).toEqual(['id-10', 'id-11', 'id-12']);
    });

    // find_datapacks answered total:20 for a 23-row catalogue once a page size
    // applied, because the parser fell back to items.length. That reads as "that
    // is all of them" while hiding rows.
    it('omits total when the source does not report one — never fabricates it', () => {
        const out = leanList(rows, (r) => r.id, { limit: 5 });
        expect(out.total).toBeUndefined();
        expect('total' in out).toBe(false);
    });

    it('passes through a real total', () => {
        expect(leanList(rows, (r) => r.id, { limit: 5, total: 400 }).total).toBe(400);
    });
});

describe('indexDetail', () => {
    const items = [
        { id: 'a', title: 'Alpha', body: 'x'.repeat(2000) },
        { id: 'b', title: 'Beta', body: 'y'.repeat(2000) },
    ];
    const opts = {
        find: (all: typeof items) => all.find((i) => i.id === 'a'),
        index: (r: (typeof items)[0]) => ({ id: r.id, title: r.title, chars: r.body.length }),
        detail: (r: (typeof items)[0]) => ({ ...r }),
        detailHint: 'pass promptId for one in full',
        notFound: () => ({ error: 'unknown' }),
    };

    // list_ai_prompts was 97% prompt bodies; prompt text is unbounded.
    it('carries no payload in the index', () => {
        const out = indexDetail(items, { ...opts, wanted: false });
        expect(JSON.stringify(out)).not.toContain('xxxx');
        expect(out.detail).toMatch(/promptId/);
    });

    it('returns the full item on request', () => {
        expect(indexDetail(items, { ...opts, wanted: true }).body).toHaveLength(2000);
    });

    // get_block_authoring_shape HAD an index/detail split and still measured
    // 21,992 bytes at 300 components — the split bounds detail, not growth.
    it('bounds the index itself and says how much was withheld', () => {
        const many = Array.from({ length: 300 }, (_, i) => ({ id: `i${i}`, title: 't', body: '' }));
        const out = indexDetail(many, { ...opts, wanted: false, limit: 100 });
        expect(out.count).toBe(100);
        expect(out.total).toBe(300);
        expect(out.more).toMatch(/200 more/);
    });

    it('reports not-found rather than an empty success', () => {
        const out = indexDetail(items, {
            ...opts,
            wanted: true,
            find: () => undefined,
        });
        expect(out.error).toBe('unknown');
    });
});

describe('verdictOnly', () => {
    // who_created was 46% of a 111,748-byte response and the agent could not use
    // it — the comparison needs a token claim only the extension can read.
    it('replaces an un-actionable field with the answer computed from it', () => {
        const row = { id: 'p1', name: 'Proj', who_created: 'ABC@techacct.adobe.com' };
        const out = verdictOnly(row, (r) => ({ id: r.id, name: r.name }), {
            deletable: (r) => r.who_created === 'ABC@techacct.adobe.com',
        });

        expect(out).toEqual({ id: 'p1', name: 'Proj', deletable: true });
        expect(JSON.stringify(out)).not.toContain('techacct');
    });

    it('fails closed when the input is absent', () => {
        const row: { id: string; who_created?: string } = { id: 'p' };
        const out = verdictOnly(row, (r) => ({ id: r.id }), {
            deletable: (r) => Boolean(r.who_created),
        });
        expect(out.deletable).toBe(false);
    });
});

describe('legend', () => {
    // 46 rows carried a {code,name} group object — 2,584 bytes — to convey six
    // distinct values.
    it('emits each distinct value once and keys the rows', () => {
        const rows = [
            { code: 'A', group: { code: 'g1', name: 'Group One' } },
            { code: 'B', group: { code: 'g1', name: 'Group One' } },
            { code: 'C', group: { code: 'g2', name: 'Group Two' } },
        ];
        const out = legend(
            rows,
            'group',
            (v) => (v as { code?: string })?.code,
            (v) => (v as { name?: string })?.name,
        );

        expect(out.rows.map((r) => r.group)).toEqual(['g1', 'g1', 'g2']);
        expect(out.legend).toEqual({ g1: 'Group One', g2: 'Group Two' });
        expect(JSON.stringify(out.rows)).not.toContain('Group One');
    });

    it('leaves a row untouched when the field is missing', () => {
        const out = legend([{ code: 'A' }], 'group', () => undefined, () => undefined);
        expect(out.rows[0]).toEqual({ code: 'A' });
        expect(out.legend).toEqual({});
    });
});
