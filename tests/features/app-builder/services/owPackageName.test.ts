/**
 * deriveOwPackage Test Suite (Step 05)
 *
 * The prune-isolation primitive: a deterministic, collision-free, shell-safe
 * OpenWhisk package name derived from an App Builder component `id`. Per the D1 spike
 * (Q1/Q2), two integrations sharing the default `application`/`dx-excshell-1`
 * package clobber each other on deploy/undeploy; a distinct `ow.package` is the
 * load-bearing isolation boundary.
 *
 * Coverage:
 * - determinism (same id -> same name)
 * - distinctness across ids (no collision)
 * - charset/sanitization (no shell metacharacters survive; lowercase; [a-z0-9-])
 * - reserved-name guard (never `application` / `dx-excshell-1`)
 * - length bounding (truncate + stable hash suffix)
 */

import { deriveOwPackage } from '@/features/app-builder/services/owPackageName';

const SAFE_NAME = /^[a-z0-9-]+$/;

describe('deriveOwPackage', () => {
    describe('determinism', () => {
        it('should return the same name for the same id across calls', () => {
            expect(deriveOwPackage('erp-integration')).toBe(deriveOwPackage('erp-integration'));
        });

        it('should preserve an already-safe id verbatim', () => {
            expect(deriveOwPackage('erp-integration')).toBe('erp-integration');
        });
    });

    describe('distinctness (no collision)', () => {
        it('should produce different names for two different ids', () => {
            expect(deriveOwPackage('erp-integration')).not.toBe(deriveOwPackage('crm-integration'));
        });

        it('should not collapse ids that differ only after sanitization', () => {
            // Both sanitize the punctuation away but must stay distinguishable.
            expect(deriveOwPackage('erp.integration')).not.toBe(deriveOwPackage('erp_integration'));
        });
    });

    describe('charset / sanitization', () => {
        it('should strip shell metacharacters to a safe charset', () => {
            const result = deriveOwPackage('erp;rm -rf');
            expect(result).toMatch(SAFE_NAME);
            expect(result).not.toMatch(/[;\s]/);
        });

        it('should lowercase uppercase ids', () => {
            const result = deriveOwPackage('ERP-Integration');
            expect(result).toMatch(SAFE_NAME);
            expect(result).toBe(result.toLowerCase());
        });

        it('should never start or end with a hyphen', () => {
            const result = deriveOwPackage('---erp---');
            expect(result).toMatch(SAFE_NAME);
            expect(result.startsWith('-')).toBe(false);
            expect(result.endsWith('-')).toBe(false);
        });

        it('should produce a non-empty safe name even for all-unsafe input', () => {
            const result = deriveOwPackage('$()`;');
            expect(result.length).toBeGreaterThan(0);
            expect(result).toMatch(SAFE_NAME);
        });
    });

    describe('reserved-name guard', () => {
        it('should never return the default "application" package even when id equals it', () => {
            expect(deriveOwPackage('application')).not.toBe('application');
        });

        it('should never return the "dx-excshell-1" package even when id equals it', () => {
            expect(deriveOwPackage('dx-excshell-1')).not.toBe('dx-excshell-1');
        });

        it('should still be deterministic for a reserved id', () => {
            expect(deriveOwPackage('application')).toBe(deriveOwPackage('application'));
        });
    });

    describe('length bounding', () => {
        it('should bound the result length for very long ids', () => {
            const longId = 'a'.repeat(300);
            const result = deriveOwPackage(longId);
            expect(result.length).toBeLessThanOrEqual(50);
            expect(result).toMatch(SAFE_NAME);
        });

        it('should keep long ids distinct via a hash suffix', () => {
            const a = deriveOwPackage('a'.repeat(60) + '-one');
            const b = deriveOwPackage('a'.repeat(60) + '-two');
            expect(a).not.toBe(b);
        });

        it('should be deterministic for long ids', () => {
            const longId = 'integration-' + 'x'.repeat(100);
            expect(deriveOwPackage(longId)).toBe(deriveOwPackage(longId));
        });
    });
});
