/**
 * Tests for catalog grouping and version ordering.
 *
 * Pure logic, driven by the real captured catalog: 40 entries collapsing to 25
 * names, 23 of them shared. Grouping is what makes the surface readable — 40 rows
 * of free-form versions (`main`, `hold`, `eds-compatible`, `tierpricingfix`,
 * `legacySkus-20260522`, `main-archived-20260618`, `archive_06112026`, `dev`,
 * `test`) is not a browsable list.
 *
 * The load-bearing case is that `main` cannot be assumed to exist. Two curated
 * brands have no `main` at all, so a default-version rule that reaches for it
 * blindly picks nothing and the card renders empty.
 */

import * as path from 'path';

import {
    groupDatapacks,
    orderVersions,
    pickDefaultVersion,
} from '@/features/data-installer/services/datapackCatalog';
import { parseDatapackList } from '@/features/data-installer/services/dataInstallerParsers';
import type { DatapackSummary } from '@/features/data-installer/types';

const FIXTURES = path.join(__dirname, '../../../fixtures/data-installer');
const liveCatalog = (): DatapackSummary[] =>
    parseDatapackList(require(path.join(FIXTURES, 'find-datapacks.json'))).items;

/** A minimal summary; only the fields the grouping logic reads. */
function pack(
    name: string,
    version: string,
    extra: Partial<DatapackSummary> = {},
): DatapackSummary {
    return {
        id: { name, version },
        displayName: name,
        shared: true,
        dataTypes: [],
        art: {},
        ...extra,
    };
}

describe('datapackCatalog', () => {
    describe('groupDatapacks', () => {
        it('collapses the live catalog from 40 entries to 25 names', () => {
            const groups = groupDatapacks(liveCatalog());
            expect(liveCatalog()).toHaveLength(40);
            expect(groups).toHaveLength(25);
        });

        it('keeps every version under its name', () => {
            const groups = groupDatapacks(liveCatalog());
            const total = groups.reduce((n, g) => n + g.versions.length, 0);
            expect(total).toBe(40);
        });

        it('groups bodea\'s four versions together', () => {
            const bodea = groupDatapacks(liveCatalog()).find((g) => g.name === 'bodea');
            expect(bodea).toBeDefined();
            expect(bodea!.versions).toHaveLength(4);
            expect(bodea!.versions.map((v) => v.id.version).sort()).toEqual(
                ['legacySkus-20260522', 'main', 'main-archived-20260618', 'tierpricingfix'].sort(),
            );
        });

        it('carries a display name from the group, not the raw id', () => {
            const group = groupDatapacks([pack('citisignal_new', 'main', { displayName: 'CitiSignal' })])[0];
            expect(group.displayName).toBe('CitiSignal');
        });

        it('marks a group shared when any of its versions is', () => {
            const groups = groupDatapacks([
                pack('mixed', 'main', { shared: false }),
                pack('mixed', 'dev', { shared: true }),
            ]);
            expect(groups[0].shared).toBe(true);
        });

        it('returns an empty list for an empty catalog rather than throwing', () => {
            expect(groupDatapacks([])).toEqual([]);
        });

        it('preserves first-seen order of names, so the API\'s sort survives', () => {
            const groups = groupDatapacks([pack('zeta', 'main'), pack('alpha', 'main'), pack('zeta', 'dev')]);
            expect(groups.map((g) => g.name)).toEqual(['zeta', 'alpha']);
        });
    });

    describe('orderVersions', () => {
        it('puts main first, because it is what a user means by default', () => {
            const ordered = orderVersions([pack('x', 'dev'), pack('x', 'main'), pack('x', 'hold')]);
            expect(ordered[0].id.version).toBe('main');
        });

        it('pushes archived versions last however they are spelled', () => {
            // Both spellings occur live: `main-archived-20260618` and `archive_06112026`.
            const ordered = orderVersions([
                pack('x', 'main-archived-20260618'),
                pack('x', 'archive_06112026'),
                pack('x', 'eds-compatible'),
            ]);
            expect(ordered[ordered.length - 1].id.version).toMatch(/archiv/i);
            expect(ordered[0].id.version).toBe('eds-compatible');
        });

        it('orders the rest by most recently updated', () => {
            const ordered = orderVersions([
                pack('x', 'older', { updatedAt: '2026-01-01T00:00:00.000Z' }),
                pack('x', 'newer', { updatedAt: '2026-06-01T00:00:00.000Z' }),
            ]);
            expect(ordered.map((v) => v.id.version)).toEqual(['newer', 'older']);
        });

        it('is stable when nothing has an updatedAt', () => {
            const ordered = orderVersions([pack('x', 'a'), pack('x', 'b')]);
            expect(ordered.map((v) => v.id.version)).toEqual(['a', 'b']);
        });

        it('does not mutate its input', () => {
            const input = [pack('x', 'dev'), pack('x', 'main')];
            orderVersions(input);
            expect(input.map((v) => v.id.version)).toEqual(['dev', 'main']);
        });
    });

    describe('pickDefaultVersion', () => {
        it('picks main when it exists', () => {
            const group = groupDatapacks([pack('x', 'dev'), pack('x', 'main')])[0];
            expect(pickDefaultVersion(group)).toBe('main');
        });

        it('picks the newest when there is NO main', () => {
            const group = groupDatapacks([
                pack('luma', 'hold', { updatedAt: '2026-01-01T00:00:00.000Z' }),
                pack('luma', 'eds-compatible', { updatedAt: '2026-06-01T00:00:00.000Z' }),
            ])[0];
            expect(pickDefaultVersion(group)).toBe('eds-compatible');
        });

        it('resolves the three real curated brands that have no main', () => {
            // citisignal_original, luma and venia ship only eds-compatible + hold —
            // 3 of 11 curated brands, so this is the common path, not an edge case.
            // Pinned against live data so a catalog change surfaces here.
            const groups = groupDatapacks(liveCatalog().filter((p) => p.shared));
            const noMain = groups.filter(
                (g) => !g.versions.some((v) => v.id.version === 'main'),
            );
            expect(noMain.map((g) => g.name).sort()).toEqual([
                'citisignal_original',
                'luma',
                'venia',
            ]);
            for (const group of noMain) {
                expect(pickDefaultVersion(group)).toBe('eds-compatible');
            }
        });

        it('never picks an archived version when a live one exists', () => {
            const group = groupDatapacks([
                pack('x', 'main-archived-20260618', { updatedAt: '2026-12-01T00:00:00.000Z' }),
                pack('x', 'tierpricingfix', { updatedAt: '2026-01-01T00:00:00.000Z' }),
            ])[0];
            expect(pickDefaultVersion(group)).toBe('tierpricingfix');
        });

        it('falls back to an archived version when that is all there is', () => {
            const group = groupDatapacks([pack('x', 'archive_06112026')])[0];
            expect(pickDefaultVersion(group)).toBe('archive_06112026');
        });

        it('every live curated group resolves to a real version', () => {
            // The regression this guards: a default rule that assumes `main` returns
            // undefined for luma/venia and the card renders with no version.
            const curated = groupDatapacks(liveCatalog().filter((p) => p.shared));
            expect(curated.length).toBeGreaterThan(0);
            for (const group of curated) {
                const picked = pickDefaultVersion(group);
                expect(group.versions.map((v) => v.id.version)).toContain(picked);
            }
        });
    });
});
