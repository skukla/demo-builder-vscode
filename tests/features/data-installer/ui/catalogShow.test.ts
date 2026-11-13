/**
 * catalogShow: which packs each Show choice draws, and the order they draw in.
 */

import { inPickOrder } from '@/features/data-installer/pickableKinds';
import type { DatapackGroup } from '@/features/data-installer/services/datapackCatalog';
import {
    elsewhereWords,
    inShow,
    matchesElsewhere,
    inShowOrder,
    packSource,
    showOptions,
    type CatalogShow,
} from '@/features/data-installer/ui/catalogShow';

function group(name: string, over: Partial<DatapackGroup> = {}): DatapackGroup {
    return { key: name, name, displayName: name, store: 'library', shared: false, mine: false, team: false, versions: [], ...over };
}

const YOURS = group('Yours pack', { mine: true });
const TEAM = group('Team pack', { team: true });
const COLLEAGUE = group('Colleague pack');
const CURATED = group('Curated pack', { store: 'installer', shared: true });
const SCRATCH = group('Scratch pack', { store: 'installer' });

describe('packSource', () => {
    it('reads a team pack as team even when the SC uploaded it', () => {
        expect(packSource(group('both', { team: true, mine: true }))).toBe('team');
    });

    it.each([
        ['your own', YOURS, 'yours'],
        ['a colleague\'s', COLLEAGUE, 'community'],
        ['a curated Data Installer pack', CURATED, 'installer'],
        // Owner, 2026-11-05: by where it lives; Recommended is what leaves the uncurated out.
        ['a Data Installer pack not curated', SCRATCH, 'installer'],
    ] as const)('reads %s', (_what, pack, source) => {
        expect(packSource(pack)).toBe(source);
    });
});

describe('inShow', () => {
    const ALL = [YOURS, TEAM, COLLEAGUE, CURATED, SCRATCH];
    it.each<[CatalogShow, DatapackGroup[]]>([
        ['recommended', [YOURS, TEAM, CURATED]],
        ['yours', [YOURS]],
        ['team', [TEAM]],
        ['installer', [CURATED, SCRATCH]],
        ['community', [COLLEAGUE]],
        ['all', ALL],
    ])('%s draws its packs', (show, expected) => {
        expect(ALL.filter((pack) => inShow(pack, show))).toEqual(expected);
    });
});

describe('showOptions', () => {
    const labels = (answered: boolean) => showOptions(answered).map((option) => option.label);

    it('offers every choice, Recommended first, while the Data Installer answers', () => {
        expect(labels(true)).toEqual([
            'Recommended',
            'My Datapacks',
            'Demo Builder Datapacks',
            'Data Installer Datapacks',
            'Community Datapacks',
            'All Datapacks',
        ]);
    });

    it('leaves the Data Installer out when it has not', () => {
        expect(labels(false)).toEqual([
            'Recommended',
            'My Datapacks',
            'Demo Builder Datapacks',
            'Community Datapacks',
            'All Datapacks',
        ]);
    });
});

describe('inShowOrder', () => {
    it("draws this demo's pack first, then Yours, then the rest, A to Z in each", () => {
        const packs = [
            group('Zed', { team: true }),
            group('Alpha', { team: true }),
            group('Mine B', { mine: true }),
            group('Mine A', { mine: true }),
            group('Held', { team: true }),
        ];

        const order = inShowOrder(packs, (pack) => pack.name === 'Held').map((pack) => pack.name);

        expect(order).toEqual(['Held', 'Mine A', 'Mine B', 'Alpha', 'Zed']);
    });

    it('leaves the array it was given alone', () => {
        const packs = [group('B'), group('A')];
        inShowOrder(packs, () => false);
        expect(packs.map((pack) => pack.name)).toEqual(['B', 'A']);
    });
});

// Owner, 2026-11-05: the share says everyone sees the pack under Community, so the SC does too.
describe('the SC\'s own shared pack', () => {
    it('is in My Datapacks and in Community Datapacks', () => {
        const shared = group('Shared pack', { mine: true, shared: true });

        expect(inShow(shared, 'yours')).toBe(true);
        expect(inShow(shared, 'community')).toBe(true);
    });

    it('is not in Community while it is private', () => {
        expect(inShow(YOURS, 'community')).toBe(false);
    });
});

// Owner, 2026-11-05: one order wherever a pack's types are listed, the pick list's.
describe('inPickOrder', () => {
    it('puts the types in the pick list order, and any others after, A to Z', () => {
        expect(inPickOrder(['customer_groups', 'source_items', 'products', 'categories', 'store_config'])).toEqual([
            'products',
            'categories',
            'customer_groups',
            'source_items',
            'store_config',
        ]);
    });
});

// Clarity 1.13 (step-04 S10): a colleague told "find it under Community Datapacks" types its name
// on Recommended and must be told where it is, not that nothing matches.
describe('matchesElsewhere', () => {
    it('names the one Show choice that holds every match', () => {
        expect(matchesElsewhere([TEAM], 'yours')).toEqual({ show: 'team', count: 1 });
    });

    it('names All Datapacks when the matches sit under different choices', () => {
        expect(matchesElsewhere([COLLEAGUE, SCRATCH], 'recommended')).toEqual({ show: 'all', count: 2 });
    });

    it('files the SC\'s own shared pack under My Datapacks, the first choice that holds it', () => {
        const shared = group('Shared pack', { mine: true, shared: true });

        expect(matchesElsewhere([shared], 'team')).toEqual({ show: 'yours', count: 1 });
    });

    it('says nothing when there are no matches anywhere', () => {
        expect(matchesElsewhere([], 'yours')).toBeUndefined();
    });

    it('says nothing on All Datapacks, which has nowhere else to point', () => {
        expect(matchesElsewhere([TEAM], 'all')).toBeUndefined();
    });
});

describe('elsewhereWords', () => {
    it('says where the matches are, by the Show names', () => {
        expect(elsewhereWords('recommended', { show: 'all', count: 2 })).toBe(
            'No matches in Recommended. 2 in All Datapacks.',
        );
    });

    it('names a single source choice', () => {
        expect(elsewhereWords('yours', { show: 'team', count: 1 })).toBe(
            'No matches in My Datapacks. 1 in Demo Builder Datapacks.',
        );
    });
});
