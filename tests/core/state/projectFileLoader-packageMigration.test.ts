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
    it('maps the legacy `b2b` id to `custom` (the unbranded hybrid)', () => {
        expect(normalizePackageId('b2b')).toBe('custom');
    });

    it('maps the retired `citisignal-b2b` id to `citisignal`', () => {
        expect(normalizePackageId('citisignal-b2b')).toBe('citisignal');
    });

    it('passes through current ids unchanged', () => {
        expect(normalizePackageId('custom')).toBe('custom');
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
