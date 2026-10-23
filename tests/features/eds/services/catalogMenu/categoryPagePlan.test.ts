/**
 * Where each category's page lives (EDS-61, owner decision 2026-10-22): at the category's
 * own url path, every segment cleaned the way Helix cleans a published path. The overlay
 * serves a category at exactly that path and nowhere else, so the publish, the authored
 * sheet and the menu block must all build the same one: `safety_cabinets` →
 * `/safety-cabinets`. Only the template address, `/categories/default`, is never a
 * category's page.
 */

import {
    categoryPagePath,
    planCategoryPages,
    type CatalogCategory,
} from '@/features/eds/services/catalogMenu/categoryPagePlan';

const category = (over: Partial<CatalogCategory>): CatalogCategory => ({
    id: '41',
    name: 'Safety Signs',
    urlPath: 'safety-signs',
    ...over,
});

describe('categoryPagePath', () => {
    it("is the category's own url path, at the top level", () => {
        expect(categoryPagePath('signs/danger-signs')).toBe('/signs/danger-signs');
    });

    it('cleans each segment as Helix does, so the path is the one the overlay serves', () => {
        expect(categoryPagePath('safety_cabinets')).toBe('/safety-cabinets');
        expect(categoryPagePath('Signs & Labels/Exit Signs')).toBe('/signs-labels/exit-signs');
    });

    it('has no path for a url path with a segment that cleans to nothing', () => {
        expect(categoryPagePath('signs/%%%')).toBeUndefined();
        expect(categoryPagePath('')).toBeUndefined();
    });
});

describe('planCategoryPages', () => {
    it('plans one page per category with a url path, menu or not', () => {
        const plan = planCategoryPages([
            category({}),
            category({ id: '42', name: 'Exit Signs', urlPath: 'safety-signs/exit-signs', inMenu: false }),
        ]);

        expect(plan.pages).toEqual([
            { path: '/safety-signs', name: 'Safety Signs', urlPath: 'safety-signs' },
            { path: '/safety-signs/exit-signs', name: 'Exit Signs', urlPath: 'safety-signs/exit-signs' },
        ]);
        expect(plan.unsafe).toStrictEqual([]);
    });

    it('reports a category whose path cleans to nothing instead of publishing it', () => {
        const plan = planCategoryPages([category({ id: '7', name: 'Sale', urlPath: '%%' }), category({ urlPath: 'ok' })]);

        expect(plan.pages.map((p) => p.path)).toEqual(['/ok']);
        expect(plan.unsafe).toEqual([{ name: 'Sale', urlPath: '%%' }]);
    });

    it('plans a path once even if two categories clean to it', () => {
        const plan = planCategoryPages([category({ urlPath: 'safety_signs' }), category({ id: '99' })]);

        expect(plan.pages).toHaveLength(1);
    });

    it('ignores a category with no url path (the store root has none)', () => {
        const plan = planCategoryPages([category({ urlPath: '' }), category({ id: '2', urlPath: 'x' })]);

        expect(plan.pages.map((p) => p.path)).toEqual(['/x']);
        expect(plan.unsafe).toStrictEqual([]);
    });

    it('never plans the template address', () => {
        const plan = planCategoryPages([category({ urlPath: 'categories/default' })]);

        expect(plan.pages).toStrictEqual([]);
    });
});
