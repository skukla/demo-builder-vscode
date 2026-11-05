/**
 * `mergedCatalog`, the one list every surface shows (owner, 2026-11-03): the datapack store first, a
 * store row by default only if it is a team pack or the SC's own, a Data Installer row only if the
 * store holds no pack of that name. Whatever else fails, a list comes back unless neither answered.
 * The two answers here are what the handler hands it; asking them in order is pinned in
 * `dataInstallerHandlers-library.test.ts`.
 */

import * as vscode from 'vscode';
import { INSTALLER_OFF, isListable, mergedCatalog } from '@/features/data-installer/handlers/catalogLibraryRows';
import type { CatalogPage, DatapackSummary } from '@/features/data-installer/types';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerResponse } from '@/types/handlers';

const ADDRESS = 'https://installer.example.test/api';

const row = (name: string, over: Partial<DatapackSummary> = {}): DatapackSummary => ({
    id: { name, version: 'main' },
    displayName: name,
    shared: true,
    dataTypes: ['products'],
    art: {},
    ...over,
});

const answered = (...items: DatapackSummary[]): HandlerResponse => ({ success: true, data: { items, count: items.length } });
const refused = (error: string, code = ErrorCode.UNKNOWN): HandlerResponse => ({ success: false, error, code });

/** The Data Installer's address as the setting holds it. */
function address(value: string): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string, fallback?: unknown) => (key === 'apiBaseUrl' ? value : fallback)),
    });
}

const page = (response: HandlerResponse): CatalogPage => {
    expect(response.success).toBe(true);
    return response.data as CatalogPage;
};
const names = (response: HandlerResponse): string[] => page(response).items.map((item) => item.id.name);

beforeEach(() => address(ADDRESS));

describe('the order of the list', () => {
    it("puts the store's rows first, then the Data Installer's", () => {
        const merged = mergedCatalog(answered(row('ours', { team: true })), answered(row('theirs')), false);

        expect(names(merged)).toEqual(['ours', 'theirs']);
        expect(page(merged).count).toBe(2);
    });

    it('reports no total: the two stores\' totals add up to nothing a caller can use', () => {
        const merged = mergedCatalog(answered(row('ours', { team: true })), answered(row('theirs')), false);

        expect(page(merged)).not.toHaveProperty('total');
    });
});

describe('which store rows are in the default list', () => {
    const STORE = answered(row('team', { team: true }), row('mine', { mine: true }), row('colleague'));

    it("is team packs and the SC's own, without a colleague's shared pack", () => {
        expect(names(mergedCatalog(STORE, answered(), false))).toEqual(['team', 'mine']);
    });

    it("adds a colleague's shared pack with includeCommunity", () => {
        expect(names(mergedCatalog(STORE, answered(), true))).toEqual(['team', 'mine', 'colleague']);
    });

    it('counts what it shows, not what it was handed', () => {
        expect(page(mergedCatalog(STORE, answered(), false)).count).toBe(2);
    });

    it("does not apply that filter to the Data Installer's rows, which it already curated", () => {
        expect(names(mergedCatalog(answered(), answered(row('theirs', { shared: false })), false))).toEqual(['theirs']);
    });
});

describe('a pack held in both', () => {
    it('shows once, as the store row, matching by name whatever the version', () => {
        const ours = row('frescopa', { team: true, id: { name: 'frescopa', version: '2.0.0' } });
        const theirs = row('frescopa', { id: { name: 'frescopa', version: 'main' } });

        const merged = mergedCatalog(answered(ours), answered(theirs, row('bodea')), false);

        expect(page(merged).items).toEqual([ours, row('bodea')]);
    });

    it('keeps every version of a name the store does not hold', () => {
        const v1 = row('bodea', { id: { name: 'bodea', version: '1' } });
        const v2 = row('bodea', { id: { name: 'bodea', version: '2' } });

        expect(page(mergedCatalog(answered(), answered(v1, v2), false)).items).toEqual([v1, v2]);
    });
});

describe('when one does not answer', () => {
    it('says no-address when the Data Installer has none set', () => {
        address('');

        const merged = mergedCatalog(answered(row('ours', { team: true })), refused('No address.', ErrorCode.INVALID_OPERATION), false);

        expect(names(merged)).toEqual(['ours']);
        expect(page(merged).installerMissing).toBe('no-address');
    });

    it('says turned-off when the SC turned it off, keeping its address', () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: (key: string, fallback?: unknown) => {
                if (key === 'enabled') return false;
                return key === 'apiBaseUrl' ? 'https://example.test/api' : fallback;
            },
        });

        const merged = mergedCatalog(answered(row('ours', { team: true })), refused('Off.', ErrorCode.INVALID_OPERATION), false);

        expect(names(merged)).toEqual(['ours']);
        expect(page(merged).installerMissing).toBe('turned-off');
    });

    it('says no-answer when it has an address and refused or did not reply', () => {
        expect(page(mergedCatalog(answered(row('ours', { team: true })), refused('down'), false)).installerMissing).toBe('no-answer');
    });

    // Told apart from no-answer (2026-11-03): "Refresh to try again" is wrong for an SC the
    // Data Installer turned away, and the screen says who can fix it instead.
    it('says no-access when it has an address and turned the Adobe account away', () => {
        address(ADDRESS);

        const merged = mergedCatalog(answered(row('ours', { team: true })), refused('Not in the profile.', ErrorCode.AUTH_FORBIDDEN), false);

        expect(page(merged).installerMissing).toBe('no-access');
    });

    it('says no-answer for an address that is set but not usable: someone did set it up', () => {
        address('http://not-https.example.test');

        expect(page(mergedCatalog(answered(), refused('Not usable.', ErrorCode.INVALID_OPERATION), false)).installerMissing).toBe('no-answer');
    });

    it("says storeMissing, keeping the Data Installer's rows, when the store does not answer", () => {
        const merged = mergedCatalog(refused('down'), answered(row('theirs')), false);

        expect(names(merged)).toEqual(['theirs']);
        expect(page(merged).storeMissing).toBe(true);
    });

    it('says installerOff, and lists only the store, when the SC switched the Data Installer off', () => {
        address(ADDRESS);

        const merged = mergedCatalog(answered(row('ours', { team: true })), INSTALLER_OFF, false);

        expect(names(merged)).toEqual(['ours']);
        expect(page(merged).installerOff).toBe(true);
        expect(page(merged)).not.toHaveProperty('installerMissing');
    });

    it('CONTROL: says neither when both answer', () => {
        const data = page(mergedCatalog(answered(), answered(), false));

        expect(data).not.toHaveProperty('storeMissing');
        expect(data).not.toHaveProperty('installerMissing');
    });
});

describe('when neither answers', () => {
    it("fails with the store's response, unchanged, so a sign-in problem still reads as one", () => {
        const store = refused('Sign in.', ErrorCode.AUTH_REQUIRED);

        expect(mergedCatalog(store, refused('down'), false)).toBe(store);
    });
});

// Owner, 2026-11-05: packs nothing can install yet leave every list; the SC's own stay, to be removed.
describe('isListable', () => {
    const pack = (dataTypes: string[], over: Partial<DatapackSummary> = {}): DatapackSummary => ({
        id: { name: 'p', version: 'main' },
        displayName: 'P',
        shared: false,
        dataTypes,
        art: {},
        ...over,
    });

    it('hides an empty pack and an ACO-only pack', () => {
        expect(isListable(pack([]))).toBe(false);
        expect(isListable(pack(['aco_price_books', 'aco_products']))).toBe(false);
    });

    it('lists a pack with a Commerce data type, ACO beside it or not', () => {
        expect(isListable(pack(['products']))).toBe(true);
        expect(isListable(pack(['aco_products', 'categories']))).toBe(true);
    });

    it("always lists the SC's own pack, so they can remove it", () => {
        expect(isListable(pack([], { store: 'library', mine: true }))).toBe(true);
    });
});
