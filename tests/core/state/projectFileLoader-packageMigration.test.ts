/**
 * Tests for normalizePackageId — the permanent backward-compat normalization
 * that maps renamed demo-package ids in older manifests to their current value.
 *
 * This is load-bearing: existing projects persist the old id (e.g. `b2b`), and
 * reset / config-flag injection look the package up by id, so a stale id would
 * silently break those projects. The map is permanent (local manifests of
 * arbitrary age + skippable upgrade paths mean it can never be safely removed).
 */

import { normalizePackageId } from '@/core/state/projectFileLoader';

describe('normalizePackageId', () => {
    it('maps the legacy `b2b` id to `starter` (the unbranded hybrid)', () => {
        expect(normalizePackageId('b2b')).toBe('starter');
    });

    it('maps the retired `custom` id to `starter` in one hop, not through `b2b`', () => {
        // The map is a flat table, not a chain: every retired id names the
        // CURRENT id directly, so a rename never needs a second lookup.
        expect(normalizePackageId('custom')).toBe('starter');
    });

    it('maps the retired `citisignal-b2b` id to `citisignal`', () => {
        expect(normalizePackageId('citisignal-b2b')).toBe('citisignal');
    });

    it('passes through current ids unchanged', () => {
        expect(normalizePackageId('starter')).toBe('starter');
        expect(normalizePackageId('citisignal')).toBe('citisignal');
        expect(normalizePackageId('isle5')).toBe('isle5');
        expect(normalizePackageId('buildright')).toBe('buildright');
    });

    it('passes through unknown ids unchanged (no accidental remap)', () => {
        expect(normalizePackageId('something-new')).toBe('something-new');
    });

    it('returns undefined when there is no selected package', () => {
        expect(normalizePackageId(undefined)).toBeUndefined();
    });
});
