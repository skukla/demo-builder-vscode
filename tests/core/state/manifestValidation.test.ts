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

// The real Ajv, wrapped so its constructor CALLS are observable and so one test
// can make `compile` throw. A passthrough: every other test sees real Ajv.
// `mock`-prefixed so the hoisted factory may read it.
let mockCompileFailure: Error | null = null;

jest.mock('ajv', () => {
    const actual = jest.requireActual<typeof import('ajv')>('ajv');
    return {
        __esModule: true,
        default: jest.fn(function (options: object) {
            const instance = new actual.default(options);
            if (mockCompileFailure) {
                const failure = mockCompileFailure;
                instance.compile = () => {
                    throw failure;
                };
            }
            return instance;
        }),
    };
});

type ManifestValidationModule = typeof import('@/core/state/manifestValidation');
type AjvModule = { default: jest.MockedClass<typeof import('ajv').default> };

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

    it('reports a wrong-typed known field as ONE issue: its path and Ajv\'s message', () => {
        // Exactly one line — nothing appended when the list is under the cap.
        expect(validateManifestShape({ name: 42 })).toEqual(['/name must be string']);
    });

    it('names the root as "/" when the whole manifest is the wrong shape', () => {
        // Ajv reports a root-level error with an EMPTY instancePath.
        expect(validateManifestShape('garbage')).toEqual(['/ must be object']);
    });

    it('accepts integer is_active on store views — the shape Commerce actually sends', () => {
        // Commerce's REST API returns 1/0, not true/false. The boolean-only
        // declaration (written from expectation, not a real response) had
        // every load of a discovered-structure project warning three times
        // per store view. Copied from a real bodea manifest, 2026-08-23.
        const issues = validateManifestShape({
            commerceStoreStructure: {
                websites: [],
                storeGroups: [],
                storeViews: [
                    {
                        id: 3,
                        code: 'citisignal_us',
                        name: 'CitiSignal US',
                        store_group_id: 2,
                        website_id: 2,
                        is_active: 1,
                    },
                ],
            },
        });
        expect(issues).toEqual([]);
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
        // 12 wrong fields: the first 10 verbatim, then the count of the rest.
        expect(issues).toHaveLength(11);
        expect(issues[0]).toBe('/name must be string');
        expect(issues.slice(0, 10).every((line) => line.startsWith('/'))).toBe(true);
        expect(issues[10]).toBe('(+2 more issues)');
    });

    it('reports exactly the cap without a "+0 more" line when the count meets it', () => {
        const tenWrong: Record<string, unknown> = {
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
        };
        const issues = validateManifestShape(tenWrong);
        expect(issues).toHaveLength(10);
        expect(issues.every((line) => line.startsWith('/'))).toBe(true);
    });
});

/**
 * The two decisions the pure-input tests cannot see. Both run on a FRESH module
 * registry so the module-level validator cache from the tests above is not in
 * the way, and so neither depends on test order.
 */
describe('validateManifestShape — compilation and resilience', () => {
    afterEach(() => {
        mockCompileFailure = null;
    });

    it('compiles the validator once, asking Ajv for every error rather than the first', () => {
        // Asserted on the constructor ARGUMENTS: a per-test coverage run only
        // sees the compilation from the first test that triggers it, so an
        // output-shaped assertion elsewhere never runs against a mutated option.
        jest.isolateModules(() => {
            // The mock factory's result is shared across registries; only the
            // MODULE under test is fresh here, so count from zero.
            const { default: IsolatedAjv } = require('ajv') as AjvModule;
            IsolatedAjv.mockClear();
            const fresh = require('@/core/state/manifestValidation') as ManifestValidationModule;

            fresh.validateManifestShape({ name: 1 });
            fresh.validateManifestShape({ name: 1, title: 2 });

            expect(IsolatedAjv).toHaveBeenCalledTimes(1);
            expect(IsolatedAjv).toHaveBeenCalledWith({ allErrors: true, strict: false });
        });
    });

    it('returns the failure as an issue instead of throwing when Ajv itself fails', () => {
        mockCompileFailure = new Error('schema exploded');

        jest.isolateModules(() => {
            const fresh = require('@/core/state/manifestValidation') as ManifestValidationModule;

            expect(fresh.validateManifestShape({})).toEqual([
                'manifest validation itself failed: Error: schema exploded',
            ]);
        });
    });
});
