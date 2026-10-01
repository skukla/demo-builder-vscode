/**
 * Category pages — what gets a page, what the page says, and the authorship
 * record that makes a re-run safe and the removal exact.
 *
 * The page store here is an in-memory DA.live: `read` answers what was last
 * written (or 404), so the hand-edit cases are driven by changing what the
 * store holds between runs — the same thing an SC editing in da.live does.
 *
 * The recipe the HTML must match is the Adobe Commerce Optimizer boilerplate's
 * own `/apparel` page (an h1, then `product-list-page` with one `urlPath` row),
 * read 2026-10-01 and recorded in backlog item EDS-24. The block reads the row
 * through `readBlockConfig`, which lower-cases the key to `urlpath`.
 */

import type { CommerceCategory } from '@/features/eds/services/categoryPages/categoryTree';
import {
    categoryPageHtml,
    generateCategoryPages,
    pageHash,
    pageStoreFor,
    planCategoryPages,
    removeCategoryPages,
    type CategoryPageStore,
} from '@/features/eds/services/categoryPages/categoryPages';
import type { GeneratedCategoryPages } from '@/types/base';

function category(id: string, name: string, urlPath: string, roles = ['active', 'show_in_menu']): CommerceCategory {
    return { id, name, urlPath, level: urlPath.split('/').length + 1, parentId: '2', roles, children: [] };
}

const ROOT = category('2', 'Default Category', '', ['active']);
const SIGNS = category('10', 'Safety Signs', 'safety-signs');
const EXIT = category('11', 'Exit & Egress', 'safety-signs/exit-signs');

/** An in-memory DA.live holding pages by web path. */
function memoryStore(initial: Record<string, string> = {}) {
    const pages = new Map(Object.entries(initial));
    const calls: string[] = [];
    const store: CategoryPageStore = {
        read: async (path) => {
            calls.push(`read ${path}`);
            return pages.has(path) ? { status: 200, body: pages.get(path)! } : { status: 404, body: '' };
        },
        write: async (path, html) => {
            calls.push(`write ${path}`);
            pages.set(path, html);
            return { written: true, published: true, path };
        },
        remove: async (path) => {
            calls.push(`remove ${path}`);
            pages.delete(path);
            return { deleted: true, unpublished: true, path };
        },
    };
    return { store, pages, calls };
}

describe('planCategoryPages', () => {
    it('gives every menu category a page at its urlPath, and none to the root', () => {
        const plan = planCategoryPages([ROOT, SIGNS, EXIT], ROOT.id);
        expect(plan.pages.map((p) => p.path)).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(plan.skipped).toStrictEqual([]);
    });

    it('skips a category Commerce keeps out of the menu, and says why', () => {
        const hidden = category('12', 'Clearance', 'clearance', ['active']);
        const plan = planCategoryPages([ROOT, SIGNS, hidden], ROOT.id);
        expect(plan.pages.map((p) => p.path)).toEqual(['/safety-signs']);
        expect(plan.skipped).toEqual([{ id: '12', name: 'Clearance', reason: 'not in the menu' }]);
    });

    it('skips a disabled category', () => {
        const off = category('13', 'Old', 'old', ['show_in_menu']);
        expect(planCategoryPages([ROOT, off], ROOT.id).skipped).toEqual([
            { id: '13', name: 'Old', reason: 'disabled' },
        ]);
    });

    it('skips a path the live CDN cannot serve rather than writing a page that 404s', () => {
        const odd = category('14', 'Über', 'über/Signs');
        const plan = planCategoryPages([ROOT, odd], ROOT.id);
        expect(plan.pages).toStrictEqual([]);
        expect(plan.skipped[0]).toMatchObject({ id: '14', reason: expect.stringMatching(/path/) });
    });
});

describe('categoryPageHtml', () => {
    it('is the boilerplate recipe: the name as h1, then product-list-page with the urlPath row', () => {
        expect(categoryPageHtml('Safety Signs', 'safety-signs')).toBe(
            '<body><header></header><main><div><h1>Safety Signs</h1>' +
                '<div class="product-list-page"><div><div>urlPath</div><div>safety-signs</div></div></div>' +
                '</div></main><footer></footer></body>',
        );
    });

    it('escapes a category name, which is merchant text', () => {
        expect(categoryPageHtml('Exit & <Egress>', 'exit')).toContain('<h1>Exit &amp; &lt;Egress&gt;</h1>');
    });
});

describe('pageHash', () => {
    it('ignores whitespace between tags, so a source that comes back reformatted still matches', () => {
        const html = categoryPageHtml('Safety Signs', 'safety-signs');
        const reformatted = html.replace(/></g, '>\n  <');
        expect(pageHash(reformatted)).toBe(pageHash(html));
    });

    it('changes when the words change', () => {
        expect(pageHash(categoryPageHtml('A', 'a'))).not.toBe(pageHash(categoryPageHtml('B', 'a')));
    });
});

describe('generateCategoryPages', () => {
    it('writes each page and records what it wrote', async () => {
        const { store, pages } = memoryStore();
        const plan = planCategoryPages([ROOT, SIGNS, EXIT], ROOT.id);
        const run = await generateCategoryPages(store, plan, undefined);

        expect(run.written).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(Object.keys(run.record.pages)).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(run.record.pages['/safety-signs']).toEqual({
            categoryId: '10',
            hash: pageHash(pages.get('/safety-signs')!),
        });
    });

    it('re-running rewrites the same pages (idempotent)', async () => {
        const { store } = memoryStore();
        const plan = planCategoryPages([ROOT, SIGNS], ROOT.id);
        const first = await generateCategoryPages(store, plan, undefined);
        const second = await generateCategoryPages(store, plan, first.record);
        expect(second.written).toEqual(['/safety-signs']);
        expect(second.handEdited).toStrictEqual([]);
        expect(second.record.pages).toEqual(first.record.pages);
    });

    it('never overwrites a page the SC edited by hand, and reports it', async () => {
        const { store, pages, calls } = memoryStore();
        const plan = planCategoryPages([ROOT, SIGNS], ROOT.id);
        const first = await generateCategoryPages(store, plan, undefined);
        pages.set('/safety-signs', `${pages.get('/safety-signs')}<p>Ask about bulk pricing</p>`);
        calls.length = 0;

        const second = await generateCategoryPages(store, plan, first.record);

        expect(second.handEdited).toEqual(['/safety-signs']);
        expect(calls).not.toContain('write /safety-signs');
        expect(pages.get('/safety-signs')).toContain('bulk pricing');
        // Still recorded as ours-when-written, so the removal can report it too.
        expect(second.record.pages['/safety-signs']).toEqual(first.record.pages['/safety-signs']);
    });

    it('never overwrites a page it did not write (no record = no proof it is ours)', async () => {
        const { store, pages } = memoryStore({ '/safety-signs': '<body><main>the SC wrote this</main></body>' });
        const run = await generateCategoryPages(store, planCategoryPages([ROOT, SIGNS], ROOT.id), undefined);
        expect(run.notOurs).toEqual(['/safety-signs']);
        expect(run.written).toStrictEqual([]);
        expect(pages.get('/safety-signs')).toContain('the SC wrote this');
        expect(run.record.pages).toStrictEqual({});
    });

    it('reports a page whose read failed and leaves it alone', async () => {
        const { store, calls } = memoryStore();
        store.read = async () => ({ status: 500, body: '' });
        const run = await generateCategoryPages(store, planCategoryPages([ROOT, SIGNS], ROOT.id), undefined);
        expect(run.failed).toEqual([{ path: '/safety-signs', error: 'Could not read the current page (HTTP 500)' }]);
        expect(calls).not.toContain('write /safety-signs');
    });

    it('records a page whose publish failed, since the content IS in DA.live', async () => {
        const { store } = memoryStore();
        store.write = async (path) => ({ written: true, published: false, path, publishError: 'helix 503' });
        const run = await generateCategoryPages(store, planCategoryPages([ROOT, SIGNS], ROOT.id), undefined);
        expect(run.written).toEqual(['/safety-signs']);
        expect(run.unpublished).toEqual([{ path: '/safety-signs', error: 'helix 503' }]);
        expect(run.record.pages['/safety-signs']).toBeDefined();
    });

    it('keeps the record of a page whose category left the tree, and lists it', async () => {
        const { store } = memoryStore();
        const first = await generateCategoryPages(store, planCategoryPages([ROOT, SIGNS, EXIT], ROOT.id), undefined);
        const second = await generateCategoryPages(store, planCategoryPages([ROOT, SIGNS], ROOT.id), first.record);
        expect(second.noLongerInTree).toEqual(['/safety-signs/exit-signs']);
        expect(second.record.pages['/safety-signs/exit-signs']).toBeDefined();
    });

    it('saves the record after every page, so a run that dies half-way can still be undone', async () => {
        const { store } = memoryStore();
        const saved: number[] = [];
        await generateCategoryPages(
            store,
            planCategoryPages([ROOT, SIGNS, EXIT], ROOT.id),
            undefined,
            async (record: GeneratedCategoryPages) => {
                saved.push(Object.keys(record.pages).length);
            },
        );
        expect(saved).toEqual([1, 2]);
    });
});

describe('removeCategoryPages', () => {
    async function generated() {
        const memory = memoryStore();
        const run = await generateCategoryPages(memory.store, planCategoryPages([ROOT, SIGNS, EXIT], ROOT.id), undefined);
        memory.calls.length = 0;
        return { ...memory, record: run.record };
    }

    it('removes exactly the pages it wrote, and forgets them', async () => {
        const { store, pages, record } = await generated();
        pages.set('/about', '<body>not ours</body>');
        const run = await removeCategoryPages(store, record);
        expect(run.removed).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect([...pages.keys()]).toEqual(['/about']);
        expect(run.record.pages).toStrictEqual({});
    });

    it('leaves a hand-edited page in place, reports it, and keeps its record', async () => {
        const { store, pages, calls, record } = await generated();
        pages.set('/safety-signs', '<body>edited</body>');
        const run = await removeCategoryPages(store, record);
        expect(run.handEdited).toEqual(['/safety-signs']);
        expect(calls).not.toContain('remove /safety-signs');
        expect(pages.get('/safety-signs')).toBe('<body>edited</body>');
        expect(Object.keys(run.record.pages)).toEqual(['/safety-signs']);
    });

    it('forgets a page that is already gone', async () => {
        const { store, pages, calls, record } = await generated();
        pages.delete('/safety-signs');
        const run = await removeCategoryPages(store, record);
        expect(run.alreadyGone).toEqual(['/safety-signs']);
        expect(calls).not.toContain('remove /safety-signs');
        expect(run.record.pages['/safety-signs']).toBeUndefined();
    });

    it('keeps the record of a page whose removal failed, so it can be retried', async () => {
        const { store, record } = await generated();
        store.remove = async (path) => ({ deleted: false, unpublished: false, path, error: 'Unpublish failed.' });
        const run = await removeCategoryPages(store, record);
        expect(run.failed).toEqual([
            { path: '/safety-signs', error: 'Unpublish failed.' },
            { path: '/safety-signs/exit-signs', error: 'Unpublish failed.' },
        ]);
        expect(Object.keys(run.record.pages)).toHaveLength(2);
    });
});

describe('pageStoreFor', () => {
    // Fakes typed to the real method signatures (PageServices picks them), so a
    // wrong-shaped call fails to compile rather than passing against a mock.
    function services() {
        const calls: unknown[][] = [];
        const ops = {
            readSource: async (...args: [string, string, string, number?]) => {
                calls.push(['readSource', ...args]);
                return { status: 200, body: '<body></body>', bytes: 13, truncated: false };
            },
            createSource: async (...args: [string, string, string, string, { overwrite?: boolean }?]) => {
                calls.push(['createSource', ...args]);
                return { success: true, path: args[2] };
            },
            deleteSource: async (...args: [string, string, string]) => {
                calls.push(['deleteSource', ...args]);
                return { success: true };
            },
        };
        const helix = {
            previewAndPublishPage: async (...args: [string, string, string?, string?]) => {
                calls.push(['previewAndPublishPage', ...args]);
            },
            unpublishPage: async (...args: [string, string, string?, string?]) => {
                calls.push(['unpublishPage', ...args]);
                return true;
            },
        };
        const target = { daLiveOrg: 'acme', daLiveSite: 'store', repoOwner: 'acme', repoName: 'store' };
        return { calls, store: pageStoreFor({ ops, helix, target }) };
    }

    it('reads and writes the DA source spelling and publishes the web path', async () => {
        const { calls, store } = services();
        await store.read('/safety-signs/exit-signs');
        await store.write('/safety-signs/exit-signs', '<body></body>');
        expect(calls).toEqual([
            ['readSource', 'acme', 'store', 'safety-signs/exit-signs.html'],
            ['createSource', 'acme', 'store', 'safety-signs/exit-signs.html', '<body></body>', { overwrite: true }],
            ['previewAndPublishPage', 'acme', 'store', '/safety-signs/exit-signs'],
        ]);
    });

    it('removes by unpublishing first, then deleting the source', async () => {
        const { calls, store } = services();
        await store.remove('/safety-signs');
        expect(calls).toEqual([
            ['unpublishPage', 'acme', 'store', '/safety-signs'],
            ['deleteSource', 'acme', 'store', 'safety-signs.html'],
        ]);
    });
});
