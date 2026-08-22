/**
 * One place decides what a project is CALLED on screen.
 *
 * A project has two names: `name` is the slug — the folder on disk, the dedupe
 * key, the thing `renameProjectCore` moves — and `title` is what the user typed.
 * Every surface that renders a project to a human must ask this function, so
 * that missing a surface is a grep away rather than a screenshot away.
 *
 * `title` is optional by design: every project created before it existed has
 * only a slug, and must keep displaying exactly as it does today. No migration.
 */

import { getProjectDisplayName } from '@/core/utils/projectDisplayName';

describe('getProjectDisplayName', () => {
    it('prefers the title the user typed', () => {
        expect(getProjectDisplayName({ name: 'bodea-b2b-demo', title: 'Bodea B2B Demo' })).toBe(
            'Bodea B2B Demo',
        );
    });

    it('falls back to the slug when there is no title', () => {
        // Every project that predates this feature. They must look unchanged.
        expect(getProjectDisplayName({ name: 'bodea-b2b-demo' })).toBe('bodea-b2b-demo');
    });

    it.each([
        ['empty', ''],
        ['spaces only', '   '],
        ['a tab', '\t'],
    ])('falls back to the slug when the title is %s', (_label, title) => {
        // A blank title would otherwise render an empty card with no way to tell
        // which project it is.
        expect(getProjectDisplayName({ name: 'bodea-demo', title })).toBe('bodea-demo');
    });

    it('trims a title that carries stray whitespace', () => {
        expect(getProjectDisplayName({ name: 'bodea-demo', title: '  Bodea Demo  ' })).toBe(
            'Bodea Demo',
        );
    });

    it('never returns an empty string, whatever it is handed', () => {
        // The caller renders this directly; an empty return is a blank label.
        expect(getProjectDisplayName({ name: 'x', title: undefined })).toBe('x');
    });
});
