/**
 * edsConfigFromStorefront — the single derivation of `edsConfig` from a demo package's
 * storefront entry.
 *
 * Template info (owner/repo/content source/patches) is determined by the brand + stack
 * combination and is NOT stored per project, so it is re-derived whenever the selected
 * package or stack changes. Two things share that job and must not diverge:
 *
 *  - `WelcomeStep`'s package-change effect
 *  - `useProjectBuilder`'s `buildEdsConfigUpdate` (stack selection)
 *
 * They were previously separate copies — the builder one commented "Mirrors
 * WelcomeStep.handleStackSelect verbatim" — and they drifted: only the builder copy carried
 * `codePatches`/`codePatchSource`, which `storefrontSetupPhases.ts` reads to patch the
 * storefront. Changing the demo package refreshed the other fourteen fields and left those
 * two pinned to the previous package. Keep this the only place the mapping is written; the
 * field-set test in `edsConfigFromStorefront.test.ts` pins it.
 *
 * @module features/project-creation/ui/steps/edsConfigFromStorefront
 */

import type { Storefront } from '@/types/demoPackages';
import type { EDSConfig } from '@/types/webview';

/**
 * Every field a storefront entry contributes to `edsConfig`: the ONE list.
 * The wizard's mapper writes them, the create request carries them, and
 * edit-mode rehydration restores them (two half-lists used to disagree —
 * shareable-demo step 05 closed them). Adding a field means adding it here
 * and nowhere else; `edsConfigFromStorefront.test.ts` pins the list.
 */
export const STOREFRONT_DERIVED_FIELDS = [
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
    'brandAssets',
] as const;

export type StorefrontDerivedField = (typeof STOREFRONT_DERIVED_FIELDS)[number];

/** The storefront-derived slice of a config (or a storefront), and nothing else. */
export function pickStorefrontDerived(
    source: Pick<Storefront, StorefrontDerivedField> | Pick<EDSConfig, StorefrontDerivedField>,
): Pick<EDSConfig, StorefrontDerivedField> {
    const out: Partial<Pick<EDSConfig, StorefrontDerivedField>> = {};
    for (const field of STOREFRONT_DERIVED_FIELDS) {
        // The two shapes agree on every derived field's type; the loop keeps the
        // assignment keyed so a field added to the list is copied without a second edit.
        (out as Record<string, unknown>)[field] = (source as Record<string, unknown>)[field];
    }
    return out as Pick<EDSConfig, StorefrontDerivedField>;
}

/**
 * Build the EDS config for a storefront, preserving the user's own entries.
 *
 * Storefront-derived fields are always overwritten — a stale value from a previously
 * selected package is exactly the bug this function exists to prevent. User-owned fields
 * (`accsHost`, `storeViewCode`, `customerGroup`, `repoName`, `daLiveOrg`, `daLiveSite`)
 * carry over from `prev`, defaulting to `''`. Any other field on `prev` is left untouched.
 *
 * @param storefront - The selected package's storefront entry for the chosen stack.
 * @param prev - The existing EDS config, if any.
 * @returns The merged EDS config.
 */
export function buildEdsConfigFromStorefront(
    storefront: Storefront,
    prev: EDSConfig | undefined,
): EDSConfig {
    return {
        ...prev,
        // User-owned — never sourced from the storefront.
        accsHost: prev?.accsHost || '',
        storeViewCode: prev?.storeViewCode || '',
        customerGroup: prev?.customerGroup || '',
        repoName: prev?.repoName || '',
        daLiveOrg: prev?.daLiveOrg || '',
        daLiveSite: prev?.daLiveSite || '',
        // Storefront-derived — the storefront is the source of truth.
        ...pickStorefrontDerived(storefront),
    } as EDSConfig;
}
