/**
 * headerSave: which save button the Datapacks header draws (step-04 S1; decisions Phase 7, 7b).
 * One state, decided before anything is drawn: the button's words never change on screen.
 */

import { headerSave, savesInto, type HeaderSaveInput } from '@/features/data-installer/ui/headerSave';

// A library datapack, as a save records it: a store-less one is a Data Installer datapack (storeOf).
const LUMA = { name: 'luma', version: 'v2', store: 'library' as const };
const INSTALLED = '2026-11-10T09:15:00Z';
const ANSWERED = { projectAnswered: true, catalogAnswered: true };

const MINE = { displayName: 'My Luma', mine: true };
const TEAM = { displayName: 'Team Luma', mine: true, team: true };
const COLLEAGUE = { displayName: 'Their Luma', mine: false };

describe('headerSave', () => {
    it.each<[string, HeaderSaveInput, ReturnType<typeof headerSave>]>([
        ['nothing has answered', { projectAnswered: false, catalogAnswered: false }, 'pending'],
        [
            'only the catalog has answered',
            { projectAnswered: false, catalogAnswered: true },
            'pending',
        ],
        [
            'only the project has answered',
            { projectAnswered: true, catalogAnswered: false },
            'pending',
        ],
        [
            'the project holds the SC’s own datapack but the catalog has not answered',
            { projectAnswered: true, catalogAnswered: false, held: LUMA, installedAt: INSTALLED },
            'pending',
        ],
        ['the project holds no datapack', { ...ANSWERED }, 'create'],
        [
            'the project holds no datapack but has an install time',
            { ...ANSWERED, installedAt: INSTALLED },
            'create',
        ],
        [
            'the SC’s own library datapack, installed',
            { ...ANSWERED, held: LUMA, installedAt: INSTALLED, heldInCatalog: MINE },
            'save-menu',
        ],
        [
            'a team datapack the SC uploaded, installed',
            { ...ANSWERED, held: LUMA, installedAt: INSTALLED, heldInCatalog: TEAM },
            'save-as-new',
        ],
        [
            'a colleague’s datapack, installed',
            { ...ANSWERED, held: LUMA, installedAt: INSTALLED, heldInCatalog: COLLEAGUE },
            'save-as-new',
        ],
        [
            'a Data Installer datapack marked as the SC’s, installed',
            {
                ...ANSWERED,
                held: { ...LUMA, store: 'installer' },
                installedAt: INSTALLED,
                heldInCatalog: MINE,
            },
            'save-as-new',
        ],
        [
            'an installed datapack the catalog does not list',
            { ...ANSWERED, held: LUMA, installedAt: INSTALLED },
            'save-as-new',
        ],
        [
            'the SC’s own datapack with no install record',
            { ...ANSWERED, held: LUMA, heldInCatalog: MINE },
            'none',
        ],
        [
            'a colleague’s datapack with no install record',
            { ...ANSWERED, held: LUMA, heldInCatalog: COLLEAGUE },
            'none',
        ],
    ])('%s', (_case, input, expected) => {
        expect(headerSave(input)).toBe(expected);
    });
});

// A datapack recorded with no store is a Data Installer one (storeOf), as heldInCatalogOf already
// reads it: never saved into as if it were the SC's library datapack.
describe('savesInto', () => {
    it('never saves into a datapack recorded with no store', () => {
        expect(savesInto({ name: 'luma', version: 'main' }, { displayName: 'Luma', mine: true })).toBe(false);
    });

    it("saves into the SC's own library datapack", () => {
        expect(savesInto({ name: 'my-luma', version: '20261110-091500', store: 'library' }, { displayName: 'My Luma', mine: true })).toBe(true);
    });
});
