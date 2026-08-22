/**
 * The brand is the point, so the brand is what gets tested.
 *
 * `getProjectDisplayName` existed before this and was still missed four times --
 * on the dashboard heading, in the wizard's edit mode, and in two payload
 * producers -- because nothing STOPPED a caller writing `name: project.name`.
 * A helper you have to remember to call is a convention; a type you cannot
 * bypass is a constraint.
 *
 * These are COMPILE-time assertions. `@ts-expect-error` fails the build if the
 * line beneath it starts compiling, so if the brand is ever weakened to a plain
 * string alias, `npm run typecheck:tests` breaks here. The runtime expectations
 * are incidental -- they exist so jest has something to run.
 */

import {
    asDisplayName,
    getProjectDisplayName,
    type ProjectDisplayName,
} from '@/core/utils/projectDisplayName';

describe('a raw slug cannot stand in for a display name', () => {
    it('rejects a plain string', () => {
        const slug = 'bodea-demo';

        // @ts-expect-error - a slug is not a display name. This is the whole fix:
        // `name: project.name` must not compile where a display name is required.
        const wrong: ProjectDisplayName = slug;

        expect(wrong).toBe('bodea-demo');
    });

    it('rejects a string literal too', () => {
        // @ts-expect-error - no accidental literals either.
        const wrong: ProjectDisplayName = 'Bodea Demo';

        expect(wrong).toBe('Bodea Demo');
    });
});

describe('the two ways to get one', () => {
    it('derives it from a project', () => {
        const ok: ProjectDisplayName = getProjectDisplayName({
            name: 'bodea-demo',
            title: 'Bodea Demo',
        });

        expect(ok).toBe('Bodea Demo');
    });

    it('accepts a deliberate cast for strings that are not project names', () => {
        // The escape hatch: an empty placeholder when there is no project. It has
        // to be spelled out, which is the difference between a decision and an
        // accident.
        const ok: ProjectDisplayName = asDisplayName('');

        expect(ok).toBe('');
    });
});

describe('a display name is still a string', () => {
    it('renders and concatenates without ceremony', () => {
        // The brand must not make it awkward to USE, or callers will route around
        // it and the constraint stops meaning anything.
        const display = getProjectDisplayName({ name: 'bodea-demo', title: 'Bodea Demo' });
        const label: string = display;

        expect(`${display} — ready`).toBe('Bodea Demo — ready');
        expect(label.toUpperCase()).toBe('BODEA DEMO');
    });
});
