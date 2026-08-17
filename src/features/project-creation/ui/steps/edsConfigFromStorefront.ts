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
        templateOwner: storefront.templateOwner,
        templateRepo: storefront.templateRepo,
        contentSource: storefront.contentSource,
        accountContentSource: storefront.accountContentSource,
        byomOverlayUrl: storefront.byomOverlayUrl,
        patches: storefront.patches,
        contentPatches: storefront.contentPatches,
        contentPatchSource: storefront.contentPatchSource,
        codePatches: storefront.codePatches,
        codePatchSource: storefront.codePatchSource,
        brandAssets: storefront.brandAssets,
    } as EDSConfig;
}
