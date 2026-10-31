/**
 * The project's Adobe Commerce Optimizer settings, read in one place (PL-60): whether the ACO add-on
 * is on, and the instance, catalog view, locale and price book the SC picked (owner, 2026-10-31,
 * P2). The storefront config (`eds/services/configGenerator.ts`) and the engine's ACO packs
 * (`data-installer/services/buildDatapackEngine.ts`) both read it, so the two never disagree about
 * which instance the project uses.
 *
 * @module features/components/services/acoSettings
 */

import {
    ACO_CATALOG_VIEW_ID,
    ACO_ENVIRONMENT,
    ACO_LOCALE,
    ACO_PRICE_BOOK_ID,
    ACO_REGION,
    ACO_TENANT_ID,
} from '@/core/config/envVarKeys';
import type { AcoEnvironment, AcoStorefrontSettings } from '@/types/aco';

/** The ACO add-on's id, in `components.json` `addons` and `stacks.json` `addonDefinitions`. */
export const ACO_ADDON_ID = 'adobe-commerce-aco';

/** What a reader needs from a project: its add-ons and the ACO component's values. */
export interface AcoSettingsSource {
    selectedAddons?: readonly string[];
    componentConfigs?: Record<string, Record<string, string | boolean | number | undefined> | undefined>;
}

/** The project's ACO settings, or the fields still empty. */
export type AcoSettingsRead = { settings: AcoStorefrontSettings } | { missing: string[] };

/** Whether the project has the ACO add-on on. */
export function usesAco(source: AcoSettingsSource): boolean {
    return (source.selectedAddons ?? []).includes(ACO_ADDON_ID);
}

function environmentOf(value: string): AcoEnvironment | undefined {
    return value === 'sandbox' || value === 'production' ? value : undefined;
}

function valueOf(values: Record<string, unknown>, key: string): string {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value).trim();
}

/**
 * The ACO settings the project names.
 *
 * @returns undefined when the add-on is off; the fields still empty when it is on but incomplete
 */
export function readAcoSettings(source: AcoSettingsSource): AcoSettingsRead | undefined {
    if (!usesAco(source)) return undefined;
    const values = source.componentConfigs?.[ACO_ADDON_ID] ?? {};
    const required = [ACO_TENANT_ID, ACO_REGION, ACO_ENVIRONMENT, ACO_CATALOG_VIEW_ID, ACO_LOCALE];
    const missing = required.filter((key) => valueOf(values, key) === '');
    const environment = environmentOf(valueOf(values, ACO_ENVIRONMENT));
    if (!environment && !missing.includes(ACO_ENVIRONMENT)) missing.push(ACO_ENVIRONMENT);
    if (missing.length > 0 || !environment) return { missing };
    const priceBookId = valueOf(values, ACO_PRICE_BOOK_ID);
    return {
        settings: {
            tenantId: valueOf(values, ACO_TENANT_ID),
            region: valueOf(values, ACO_REGION),
            environment,
            catalogViewId: valueOf(values, ACO_CATALOG_VIEW_ID),
            locale: valueOf(values, ACO_LOCALE),
            ...(priceBookId ? { priceBookId } : {}),
        },
    };
}

/** Why a read gave no settings, in words, for a refusal. */
export function acoSettingsProblem(read: AcoSettingsRead | undefined): string | undefined {
    if (!read) return 'This project does not use Adobe Commerce Optimizer. Turn ACO on for the project first.';
    if ('missing' in read) return `The project's Adobe Commerce Optimizer settings are not complete: set ${read.missing.join(', ')} in Configure.`;
    return undefined;
}
