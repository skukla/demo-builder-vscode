/**
 * Library pack names, remembered once read (walk F69): the dashboard card shows the name at once.
 */

import { PACK_NAMES_KEY, rememberPackName, rememberedPackName, type NameMemory } from '@/features/data-installer/services/packNames';

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
});
