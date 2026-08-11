/**
 * secretKey Tests (D2 Track B — Step 04)
 *
 * The secret key scheme is defined in ONE place. Secrets for an App Builder component's
 * `type:'secret'` env vars are stored in VS Code SecretStorage under a stable,
 * deterministic per-project/per-appBuilderComponent/per-var key.
 */

import { secretKey } from '@/features/app-builder/services/secretKey';

describe('secretKey', () => {
    it('builds a deterministic per-project/per-appBuilderComponent/per-var key', () => {
        const key = secretKey('proj-1', 'erp-integration', 'ERP_API_KEY');
        expect(key).toBe('demoBuilder.appBuilderComponentSecret.proj-1.erp-integration.ERP_API_KEY');
    });

    it('returns the same key for the same inputs (stable)', () => {
        const a = secretKey('p', 'd', 'V');
        const b = secretKey('p', 'd', 'V');
        expect(a).toBe(b);
    });

    it('namespaces different appBuilderComponents apart', () => {
        const a = secretKey('p', 'mesh', 'TOKEN');
        const b = secretKey('p', 'erp', 'TOKEN');
        expect(a).not.toBe(b);
    });

    it('namespaces different projects apart', () => {
        const a = secretKey('p1', 'd', 'TOKEN');
        const b = secretKey('p2', 'd', 'TOKEN');
        expect(a).not.toBe(b);
    });
});
