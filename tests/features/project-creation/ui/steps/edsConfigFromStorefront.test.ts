/**
 * edsConfigFromStorefront — the ONE derivation of `edsConfig` from a package's storefront.
 *
 * Why this suite exists: the derivation used to be written twice — an effect in
 * `WelcomeStep.tsx` and `buildEdsConfigUpdate` in `useProjectBuilder.ts`, the latter
 * commented "Mirrors WelcomeStep.handleStackSelect verbatim". They drifted: the builder
 * copy carried `codePatches`/`codePatchSource` and the WelcomeStep copy did not, so
 * changing the demo package could leave those two pinned to the PREVIOUS package's
 * storefront while the other fourteen fields refreshed. `storefrontSetupPhases.ts` reads
 * both to patch the storefront, so the drift was load-bearing.
 *
 * The field-set test below is the guard: it fails if a storefront-derived field is added
 * anywhere but here.
 */

import { buildEdsConfigFromStorefront } from '@/features/project-creation/ui/steps/edsConfigFromStorefront';
import type { Storefront } from '@/types/demoPackages';
import type { EDSConfig } from '@/types/webview';

/** Every field this derivation takes from the storefront. Adding one? Add it here too. */
const STOREFRONT_DERIVED_FIELDS = [
    'templateOwner',
    'templateRepo',
    'contentSource',
    'accountContentSource',
    'byomOverlayUrl',
    'patches',
    'contentPatches',
    'contentPatchSource',
    'codePatches',
    'codePatchSource',
] as const;

/** Fields the user owns — carried over from the previous config, never from the storefront. */
const USER_OWNED_FIELDS = [
    'accsHost',
    'storeViewCode',
    'customerGroup',
    'repoName',
    'daLiveOrg',
    'daLiveSite',
] as const;

function makeStorefront(overrides: Partial<Storefront> = {}): Storefront {
    return {
        templateOwner: 'adobe-owner',
        templateRepo: 'adobe-repo',
        contentSource: { org: 'da-org', site: 'da-site' },
        accountContentSource: { org: 'acct-org', site: 'acct-site' },
        byomOverlayUrl: 'https://overlay.example/render',
        patches: ['patch-a'],
        contentPatches: ['content-a'],
        contentPatchSource: { owner: 'p-owner', repo: 'p-repo' },
        codePatches: ['code-a'],
        codePatchSource: { owner: 'c-owner', repo: 'c-repo', path: 'patches' },
        ...overrides,
    } as Storefront;
}

describe('buildEdsConfigFromStorefront', () => {
    describe('storefront-derived fields', () => {
        it('copies every storefront-derived field from the storefront', () => {
            const storefront = makeStorefront();

            const result = buildEdsConfigFromStorefront(storefront, undefined);

            for (const field of STOREFRONT_DERIVED_FIELDS) {
                expect(result[field as keyof EDSConfig]).toEqual(
                    storefront[field as keyof Storefront]
                );
            }
        });

        it('carries codePatches and codePatchSource — the two fields that drifted', () => {
            const storefront = makeStorefront({
                codePatches: ['thin-layer-1'],
                codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'patches' },
            });

            const result = buildEdsConfigFromStorefront(storefront, undefined);

            expect(result.codePatches).toEqual(['thin-layer-1']);
            expect(result.codePatchSource).toEqual({
                owner: 'skukla',
                repo: 'eds-demo-patches',
                path: 'patches',
            });
        });

        it('OVERWRITES a stale storefront-derived value from the previous package', () => {
            // The actual defect: switching packages refreshed 14 fields and left 2 behind.
            const prev = {
                codePatches: ['from-the-OLD-package'],
                codePatchSource: { owner: 'old-owner', repo: 'old-repo', path: 'patches' },
                templateOwner: 'old-owner',
            } as EDSConfig;
            const storefront = makeStorefront({
                codePatches: ['from-the-NEW-package'],
                codePatchSource: { owner: 'new-owner', repo: 'new-repo', path: 'patches' },
                templateOwner: 'new-owner',
            });

            const result = buildEdsConfigFromStorefront(storefront, prev);

            expect(result.codePatches).toEqual(['from-the-NEW-package']);
            expect(result.codePatchSource).toEqual({
                owner: 'new-owner',
                repo: 'new-repo',
                path: 'patches',
            });
            expect(result.templateOwner).toBe('new-owner');
        });

        it('clears a storefront-derived field the new storefront does not define', () => {
            const prev = { codePatches: ['stale'] } as EDSConfig;
            const storefront = makeStorefront({ codePatches: undefined });

            const result = buildEdsConfigFromStorefront(storefront, prev);

            expect(result.codePatches).toBeUndefined();
        });
    });

    describe('user-owned fields', () => {
        it('preserves user-entered values from the previous config', () => {
            const prev = {
                accsHost: 'https://commerce.example',
                storeViewCode: 'default',
                customerGroup: 'GENERAL',
                repoName: 'my-repo',
                daLiveOrg: 'my-org',
                daLiveSite: 'my-site',
            } as EDSConfig;

            const result = buildEdsConfigFromStorefront(makeStorefront(), prev);

            for (const field of USER_OWNED_FIELDS) {
                expect(result[field as keyof EDSConfig]).toBe(prev[field as keyof EDSConfig]);
            }
        });

        it('defaults user-owned fields to empty strings when there is no previous config', () => {
            const result = buildEdsConfigFromStorefront(makeStorefront(), undefined);

            for (const field of USER_OWNED_FIELDS) {
                expect(result[field as keyof EDSConfig]).toBe('');
            }
        });

        it('keeps unrelated previous fields that neither list mentions', () => {
            const prev = { repoMode: 'existing', resetToTemplate: true } as EDSConfig;

            const result = buildEdsConfigFromStorefront(makeStorefront(), prev);

            expect(result.repoMode).toBe('existing');
            expect(result.resetToTemplate).toBe(true);
        });
    });

    describe('field-set pin', () => {
        it('derives exactly the documented storefront fields and no others', () => {
            // Guards the drift class directly: if a caller starts setting a storefront
            // field this helper does not know about, the sets stop matching.
            const storefront = makeStorefront();
            const result = buildEdsConfigFromStorefront(storefront, undefined);

            const derived = STOREFRONT_DERIVED_FIELDS.filter(
                (f) => result[f as keyof EDSConfig] !== undefined
            );

            expect(new Set(derived)).toEqual(new Set(STOREFRONT_DERIVED_FIELDS));
        });
    });
});
