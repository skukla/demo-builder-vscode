/**
 * configureConfigChanges — what a Configure save changes, and laying it over now.
 *
 * Configure used to send every value it loaded, and a window opened before another
 * change put the old values back (PL-76). These two pure halves are the fix: the
 * screen sends the difference, the extension lays it over the settings as they are.
 */

import {
    applyConfigChanges,
    diffConfigs,
} from '@/features/dashboard/services/configureConfigChanges';

describe('diffConfigs', () => {
    it('finds nothing when nothing changed', () => {
        const loaded = { accs: { STORE: 'main', GROUP: 'a' } };

        expect(diffConfigs(loaded, { accs: { STORE: 'main', GROUP: 'a' } })).toStrictEqual({});
    });

    it('keeps only the changed keys of a component', () => {
        const loaded = { accs: { STORE: 'main', GROUP: 'a' } };

        expect(diffConfigs(loaded, { accs: { STORE: 'main', GROUP: 'b' } })).toStrictEqual({
            accs: { GROUP: 'b' },
        });
    });

    it('carries a value typed into a component that loaded with none', () => {
        expect(diffConfigs({}, { accs: { STORE: 'main' } })).toStrictEqual({
            accs: { STORE: 'main' },
        });
    });

    it('carries a cleared value as empty, the way a cleared field is written', () => {
        const loaded = { accs: { STORE: 'main' } };

        expect(diffConfigs(loaded, { accs: { STORE: '' } })).toStrictEqual({ accs: { STORE: '' } });
        expect(diffConfigs(loaded, { accs: {} })).toStrictEqual({ accs: { STORE: '' } });
    });

    it('treats a loaded string and the same typed number or boolean as unchanged', () => {
        const loaded = { accs: { PORT: '3000', ON: 'true' } };

        expect(diffConfigs(loaded, { accs: { PORT: 3000, ON: true } })).toStrictEqual({});
    });
});

describe('applyConfigChanges', () => {
    it('keeps every value the save did not change, including one set elsewhere meanwhile', () => {
        const now = { accs: { STORE: 'set-by-agent', GROUP: 'a' }, mesh: { KEY: 'k' } };

        expect(applyConfigChanges(now, { accs: { GROUP: 'b' } })).toStrictEqual({
            accs: { STORE: 'set-by-agent', GROUP: 'b' },
            mesh: { KEY: 'k' },
        });
    });

    it('adds a component the save brings', () => {
        expect(applyConfigChanges({}, { accs: { STORE: 'main' } })).toStrictEqual({
            accs: { STORE: 'main' },
        });
    });

    it('does not change the map it was handed', () => {
        const now = { accs: { STORE: 'main' } };

        applyConfigChanges(now, { accs: { STORE: 'other' } });

        expect(now).toStrictEqual({ accs: { STORE: 'main' } });
    });
});
