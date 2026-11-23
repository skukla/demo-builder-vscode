/**
 * Library pack names, remembered once read (walk F69): the dashboard card shows the name at once.
 */

import {
    PACK_CHOICES_KEY,
    PACK_NAMES_KEY,
    PACK_NEWEST_SAVE_KEY,
    rememberNewestSaves,
    rememberedNewestSave,
    rememberPackChoices,
    rememberPackName,
    rememberPackNames,
    rememberedPackChoices,
    rememberedPackName,
    type NameMemory,
} from '@/features/data-installer/services/packNames';

function memory(initial: Record<string, string> | undefined): NameMemory & { update: jest.Mock } {
    let stored: unknown = initial;
    return {
        get: <T>(key: string) => (key === PACK_NAMES_KEY ? (stored as T) : undefined),
        update: jest.fn(async (_key: string, value: unknown) => {
            stored = value;
        }),
    };
}

describe('pack names', () => {
    it('knows nothing it never read', () => {
        expect(rememberedPackName(memory(undefined), 'luma')).toBeUndefined();
    });

    it('answers a kept name and keeps the others beside a new one', async () => {
        const kept = memory({ bodea: 'Bodea' });

        await rememberPackName(kept, 'luma', 'Luma');

        expect(rememberedPackName(kept, 'luma')).toBe('Luma');
        expect(rememberedPackName(kept, 'bodea')).toBe('Bodea');
    });

    it('writes nothing when the name is unchanged', async () => {
        const kept = memory({ luma: 'Luma' });

        await rememberPackName(kept, 'luma', 'Luma');

        expect(kept.update).not.toHaveBeenCalled();
    });
    it('keeps every listed name in one write, beside the ones kept', async () => {
        const kept = memory({ bodea: 'Bodea' });

        await rememberPackNames(kept, [{ id: { name: 'frescopa' }, displayName: 'Frescopa' }, { id: { name: 'wecafe' }, displayName: 'We.Cafe' }]);

        expect(kept.update).toHaveBeenCalledTimes(1);
        expect(['bodea', 'frescopa', 'wecafe'].map((name) => rememberedPackName(kept, name))).toEqual(['Bodea', 'Frescopa', 'We.Cafe']);
    });

    it('CONTROL: writes nothing when every listed name is already kept, or has none', async () => {
        const kept = memory({ luma: 'Luma' });

        await rememberPackNames(kept, [{ id: { name: 'luma' }, displayName: 'Luma' }, { id: { name: 'bare' } }]);

        expect(kept.update).not.toHaveBeenCalled();
    });
});

// Step-07 P4: how many versions a pack offers, kept beside its name, so the dashboard line knows
// whether to name the version without a read.
describe('pack version choices', () => {
    function counts(initial: Record<string, number> | undefined): NameMemory & { update: jest.Mock } {
        let stored: unknown = initial;
        return {
            get: <T>(key: string) => (key === PACK_CHOICES_KEY ? (stored as T) : undefined),
            update: jest.fn(async (_key: string, value: unknown) => {
                stored = value;
            }),
        };
    }

    it('knows nothing it never read', () => {
        expect(rememberedPackChoices(counts(undefined), 'luma')).toBeUndefined();
    });

    it('keeps a count beside the others, and writes nothing when it is unchanged', async () => {
        const kept = counts({ bodea: 1 });

        await rememberPackChoices(kept, 'luma', 2);
        await rememberPackChoices(kept, 'luma', 2);

        expect(rememberedPackChoices(kept, 'luma')).toBe(2);
        expect(rememberedPackChoices(kept, 'bodea')).toBe(1);
        expect(kept.update).toHaveBeenCalledTimes(1);
    });
});

// Walk F218: the newest save of each pack seen, so the dashboard's Datapacks tile can say a newer
// version waits without a library read of its own.
describe('newest saves', () => {
    function saves(initial: Record<string, string> | undefined): NameMemory & { update: jest.Mock } {
        let stored: unknown = initial;
        return {
            get: <T>(key: string) => (key === PACK_NEWEST_SAVE_KEY ? (stored as T) : undefined),
            update: jest.fn(async (_key: string, value: unknown) => {
                stored = value;
            }),
        };
    }
    const row = (name: string, version: string, mine = true) => ({ id: { name, version }, mine });

    it("keeps each pack's newest save of the SC's own or Demo Builder's, never a named version", async () => {
        const kept = saves(undefined);

        await rememberNewestSaves(kept, [
            row('acme', '20261117-134338'),
            row('acme', '20261117-203400'),
            row('acme', 'main'),
            row('theirs', '20261118-090000', false),
        ]);

        expect(rememberedNewestSave(kept, 'acme')).toBe('20261117-203400');
        expect(rememberedNewestSave(kept, 'theirs')).toBeUndefined();
    });

    it('never goes back to an older save, and writes nothing when nothing is newer', async () => {
        const kept = saves({ acme: '20261117-203400' });

        await rememberNewestSaves(kept, [row('acme', '20261117-134338')]);

        expect(rememberedNewestSave(kept, 'acme')).toBe('20261117-203400');
        expect(kept.update).not.toHaveBeenCalled();
    });
});
