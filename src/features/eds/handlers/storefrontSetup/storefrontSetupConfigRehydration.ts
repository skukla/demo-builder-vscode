/**
 * Restore package-derived storefront config that edit mode cannot supply.
 *
 * `WelcomeStep` is the only producer of the storefront fields that come from
 * `demo-packages.json` — the patch lists and their sources, the BYOM overlay
 * URL, the account content source. It runs when the user picks a package during
 * project creation.
 *
 * Edit mode never passes through it. There, `edsConfig` is reconstructed from
 * project metadata, which persists repo and DA.live identity and nothing else.
 * Every package-derived field arrived `undefined`, and the consumers — which all
 * guard on presence — skipped silently.
 *
 * Found 2026-07-29: five configured code patches, including the ADR-007
 * SKU-encoding trio that PDP routing depends on, never fetched on any republish
 * of an existing project. Shipping since before v1.0.0-beta.121.
 *
 * The package config stays the source of truth: these values are looked up
 * fresh, never persisted into project metadata, so a package can change what it
 * patches between releases and existing projects pick it up on their next run.
 */

import { getStorefrontForStack } from '@/features/components/services/demoPackageLoader';
import type { Logger } from '@/types/logger';

/**
 * Fields owned by the package definition rather than by the project.
 *
 * All are assigned together in `WelcomeStep` (via `buildEdsConfigFromStorefront`)
 * and go missing together, so they are restored together — fixing only the code
 * patches would leave content patches failing in precisely the same silent way.
 */
const PACKAGE_DERIVED_KEYS = [
    'patches',
    'contentPatches',
    'contentPatchSource',
    'codePatches',
    'codePatchSource',
    'byomOverlayUrl',
    'accountContentSource',
    'brandAssets',
] as const;

/**
 * Fill in any package-derived field the caller left undefined.
 *
 * Values already present win: creation flows arrive fully populated, and a
 * deliberate choice must never be clobbered by the package default.
 *
 * Degrades to the input on every failure path — unknown package, missing
 * package/stack, malformed config. Setup proceeding without patches is the
 * behavior that shipped for months; taking setup down over a config lookup
 * would be a worse outcome than the bug this fixes.
 *
 * @param edsConfig - Storefront config as assembled by the caller
 * @param packageId - Project's selected package (e.g. `'custom'`)
 * @param stackId - Project's selected stack (e.g. `'eds-accs'`)
 * @param logger - Logger; restored fields are reported at info
 */
export async function rehydratePackageDerivedConfig<T extends object>(
    edsConfig: T,
    packageId: string | undefined,
    stackId: string | undefined,
    logger: Logger,
): Promise<T> {
    if (!packageId || !stackId) {
        // Never silent. This returned without a word when selectedStack failed to
        // reach the payload, and the whole patch subsystem stayed dead with no
        // trace — the same failure mode this function exists to fix.
        logger.warn(
            '[Storefront Setup] Cannot resolve package settings — '
                + `package=${packageId ?? 'missing'}, stack=${stackId ?? 'missing'}. `
                + 'Patches and overlay settings will not be applied.',
        );
        return edsConfig;
    }

    let storefront: Record<string, unknown> | undefined;
    try {
        storefront = (await getStorefrontForStack(packageId, stackId)) as
            | Record<string, unknown>
            | undefined;
    } catch (error) {
        logger.warn(
            `[Storefront Setup] Could not read package config for ${packageId}/${stackId}: ` +
                `${(error as Error).message} — continuing without package-derived settings`,
        );
        return edsConfig;
    }

    if (!storefront) return edsConfig;

    const current = edsConfig as Record<string, unknown>;
    const restored: string[] = [];
    const merged: Record<string, unknown> = { ...current };

    for (const key of PACKAGE_DERIVED_KEYS) {
        if (current[key] !== undefined) continue;
        if (storefront[key] === undefined) continue;
        merged[key] = storefront[key];
        restored.push(key);
    }

    if (restored.length > 0) {
        logger.info(
            `[Storefront Setup] Restored package settings from ${packageId}/${stackId}: ` +
                restored.join(', '),
        );
    }

    return merged as T;
}
