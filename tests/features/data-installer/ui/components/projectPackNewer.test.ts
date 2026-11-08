/**
 * Whether the demo's pack has something newer than what the demo installed (owner, 2026-11-03,
 * `.rptc/plans/datapack-save-as/`): a later version of the same pack, or the version installed
 * changed in the library since (team packs are updated in place as `main`).
 */

import type { DatapackGroup } from '@/features/data-installer/services/datapackCatalog';
import type { DatapackSummary } from '@/features/data-installer/types';
import { savedVersion } from '@/features/data-installer/services/demoPack';
import { isSavedVersion, packLine } from '@/features/data-installer/packVersions';
import { newerLabel, newerVersionOf, shortDate, versionChanged } from '@/features/data-installer/ui/components/projectPackNewer';

const version = (name: string, at: { createdAt?: string; updatedAt?: string }): DatapackSummary => ({
    id: { name: 'my-bodea', version: name },
    displayName: 'My Bodea',
    shared: false,
    dataTypes: [],
    art: {},
    ...at,
});

const group = (versions: DatapackSummary[]): DatapackGroup => ({
    key: 'library:my-bodea',
    name: 'my-bodea',
    displayName: 'My Bodea',
    store: 'library',
    shared: false,
    mine: true,
    team: false,
    versions,
});

const V1 = version('20261101-090000', { createdAt: '2026-11-01T09:00:00Z' });
const V2 = version('20261103-120000', { createdAt: '2026-11-03T12:00:00Z' });

describe('newerVersionOf', () => {
    it('names a later version of the same pack', () => {
        expect(newerVersionOf(group([V1, V2]), V1.id, '2026-11-01T10:00:00Z')).toEqual({ id: V2.id, at: '2026-11-03T12:00:00Z' });
    });

    it('says nothing when the demo is on the newest', () => {
        expect(newerVersionOf(group([V1, V2]), V2.id, '2026-11-03T13:00:00Z')).toBeUndefined();
    });

    it('names the version installed when it changed in the library after the install', () => {
        const main = version('main', { createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' });

        expect(newerVersionOf(group([main]), main.id, '2026-11-01T00:00:00Z')).toEqual({ id: main.id, at: '2026-11-02T00:00:00Z' });
    });

    it('says nothing for a version unchanged since the install, or with no install time to compare', () => {
        const main = version('main', { createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z' });

        expect(newerVersionOf(group([main]), main.id, '2026-11-01T00:00:00Z')).toBeUndefined();
        expect(newerVersionOf(group([main]), main.id, undefined)).toBeUndefined();
    });

    // Owner, 2026-11-07: luma@import-form, made later, flagged luma@eds-compatible as out of date.
    it('says nothing for a named variant made later: it sits beside the version installed', () => {
        const edsCompatible = version('eds-compatible', { createdAt: '2026-11-06T03:00:00Z' });
        const importForm = version('import-form', { createdAt: '2026-11-06T13:00:00Z' });

        expect(newerVersionOf(group([edsCompatible, importForm]), edsCompatible.id, '2026-11-06T04:00:00Z')).toBeUndefined();
    });

    it('names a later save even when the version installed is a named one', () => {
        const main = version('main', { createdAt: '2026-10-01T00:00:00Z' });

        expect(newerVersionOf(group([main, V2]), main.id, '2026-10-02T00:00:00Z')).toEqual({ id: V2.id, at: '2026-11-03T12:00:00Z' });
    });

    it('says nothing with no pack, or a version the library no longer lists', () => {
        expect(newerVersionOf(undefined, V1.id, undefined)).toBeUndefined();
        expect(newerVersionOf(group([V1, V2]), undefined, undefined)).toBeUndefined();
        expect(newerVersionOf(group([V2]), V1.id, undefined)).toBeUndefined();
    });
});

describe('isSavedVersion', () => {
    it('knows a save by the version a save makes, and no named variant', () => {
        expect(isSavedVersion(savedVersion(new Date('2026-11-04T05:17:53Z')))).toBe(true);
        expect(['main', 'eds-compatible', 'import-form', '2026-11-04'].filter(isSavedVersion)).toStrictEqual([]);
    });
});

describe('packLine', () => {
    it('names a pack and its named version, and leaves out a save’s dated one', () => {
        expect(packLine('Luma', 'eds-compatible')).toBe('Luma, eds-compatible');
        expect(packLine('Datapack for Khalil', '20261105-194818')).toBe('Datapack for Khalil');
    });
});

describe('newerLabel', () => {
    it('says Updated and the day for the version installed, and that a newer one is there for a later save', () => {
        expect(newerLabel({ id: V1.id, at: '2026-11-06T12:00:00Z' }, V1.id)).toBe('Updated Nov 6');
        expect(newerLabel({ id: V2.id, at: '2026-11-03T12:00:00Z' }, V1.id)).toBe('Newer version available');
    });
});

describe('versionChanged', () => {
    it('says when the version last changed, its update before its creation', () => {
        expect(versionChanged(version('main', { createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-11-06T12:00:00Z' }))).toBe('Updated Nov 6');
        expect(versionChanged(version('main', { createdAt: '2026-10-01T12:00:00Z' }))).toBe('Updated Oct 1');
    });

    it('says nothing for a version with no date', () => {
        expect(versionChanged(version('main', {}))).toBeUndefined();
    });
});

describe('shortDate', () => {
    it('is the month and day, and nothing for a date it cannot read', () => {
        expect(shortDate('2026-11-03T12:00:00Z')).toBe('Nov 3');
        expect(shortDate('not a date')).toBe('');
    });
});
