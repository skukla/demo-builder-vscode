/**
 * Manifest shape validation — WARN mode, never a gate.
 *
 * The .demo-builder.json manifest is user-machine data from any historical
 * extension version; the loader must load best-effort whatever it finds. This
 * module's whole contract is: report drift as warnings, never throw, never
 * block. The schema it checks against is GENERATED from the ProjectManifest
 * interface (scripts/generate-manifest-schema.js), so these tests also pin
 * the tolerance rules the generator was configured with.
 */

import { validateManifestShape } from '@/core/state/manifestValidation';

describe('validateManifestShape', () => {
    it('returns no issues for a plausible manifest', () => {
        expect(
            validateManifestShape({
                name: 'my-demo',
                title: 'My Demo',
                selectedPackage: 'citisignal',
                selectedStack: 'eds-paas',
                componentConfigs: { 'eds-storefront': { SOME_VAR: 'x' } },
            })
        ).toEqual([]);
    });

    it('returns no issues for an EMPTY manifest — every field is optional', () => {
        expect(validateManifestShape({})).toEqual([]);
    });

    it('tolerates unknown fields — manifests cross versions in both directions', () => {
        expect(
            validateManifestShape({ name: 'demo', fieldFromAFutureVersion: { anything: true } })
        ).toEqual([]);
    });

    it('reports a wrong-typed known field with its path', () => {
        const issues = validateManifestShape({ name: 42 });
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.join('\n')).toContain('/name');
    });

    it('reports nested drift inside a known structure', () => {
        const issues = validateManifestShape({ componentConfigs: 'not-an-object' });
        expect(issues.join('\n')).toContain('/componentConfigs');
    });

    it('never throws, even on non-object input', () => {
        expect(() => validateManifestShape(null)).not.toThrow();
        expect(() => validateManifestShape('garbage')).not.toThrow();
        expect(validateManifestShape('garbage').length).toBeGreaterThan(0);
    });

    it('caps the issue list so a mangled manifest cannot flood the log', () => {
        // Many wrong-typed fields at once.
        const mangled: Record<string, unknown> = {
            name: 1,
            title: 2,
            created: 3,
            lastModified: 4,
            selectedPackage: 5,
            selectedStack: 6,
            selectedAddons: 'x',
            selectedBlockLibraries: 'x',
            aiContextVersion: 'x',
            pinned: 'x',
            additionalConsoleApis: 'x',
            componentApiPicks: 'x',
        };
        const issues = validateManifestShape(mangled);
        expect(issues.length).toBeLessThanOrEqual(11); // 10 + the "+N more" line
        expect(issues[issues.length - 1]).toMatch(/more issue/);
    });
});
