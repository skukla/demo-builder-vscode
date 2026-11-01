/**
 * The project's Adobe Commerce Optimizer settings, read in one place (PL-60): whether the ACO add-on
 * is on, and the instance, catalog view and locale the SC picked (owner, 2026-10-31,
 * P2). The storefront config (`eds/services/configGenerator.ts`) and the engine's ACO packs
 * (`data-installer/services/buildDatapackEngine.ts`) both read it, so the two never disagree about
 * which instance the project uses.
 *
 * @module features/components/services/acoSettings
 */

import {
    ACO_CATALOG_VIEW_ID,
    ACO_LOCALE,
    ACO_TENANT_ID,
} from '@/core/config/envVarKeys';
import type { AcoInstance, AcoStorefrontSettings } from '@/types/aco';

/** The ACO add-on's id, in `components.json` `addons` and `stacks.json` `addonDefinitions`. */
export const ACO_ADDON_ID = 'adobe-commerce-aco';

/** What a reader needs from a project: its add-ons and the ACO component's values. */
export interface AcoSettingsSource {
    selectedAddons?: readonly string[];
    componentConfigs?: Record<string, Record<string, string | boolean | number | undefined> | undefined>;
}

const TENANT_ID = /^[A-Za-z0-9_-]+$/u;
const REGION = /^[a-z0-9]+$/u;

/**
 * The instance's API root: `https://{region}[-sandbox].api.commerce.adobe.com/{tenantId}` (Adobe's
 * documented base URL). Its parts come from the SC, so each is checked before it builds a URL.
 *
 * @throws Error naming the part that could not be one
 */
export function acoApiBase(instance: AcoInstance): string {
    if (!TENANT_ID.test(instance.tenantId)) throw new Error(`"${instance.tenantId}" is not an ACO tenant id.`);
    if (!REGION.test(instance.region)) throw new Error(`"${instance.region}" is not an ACO region.`);
    const host = instance.environment === 'sandbox' ? `${instance.region}-sandbox` : instance.region;
    return `https://${host}.api.commerce.adobe.com/${instance.tenantId}`;
}

/** The storefront's GraphQL endpoint for the instance (the Merchandising API). */
export function acoGraphqlUrl(instance: AcoInstance): string {
    return `${acoApiBase(instance)}/graphql`;
}

/** Where an instance URL names its region and type: `https://{region}[-sandbox].api.commerce.adobe.com/{tenant}`. */
const API_URL = /^https?:\/\/([a-z0-9]+?)(-sandbox)?\.api\.commerce\.adobe\.com\/([A-Za-z0-9_-]+)/u;
/** Where a Commerce Optimizer Studio URL names the tenant: `…/in:{tenant}/commerce-optimizer-studio…`. */
const STUDIO_URL = /\/in:([A-Za-z0-9_-]+)/u;

/**
 * The instance an SC pasted: an API URL, a Studio URL, or a bare id. Only an API URL says its region
 * and type, so the others are read as a sandbox in na1, which is the only region sandboxes exist in.
 *
 * @returns undefined when it names no instance
 */
export function parseAcoInstance(raw: string): AcoInstance | undefined {
    const text = raw.trim();
    const api = API_URL.exec(text);
    if (api) return { tenantId: api[3], region: api[1], environment: api[2] ? 'sandbox' : 'production' };
    const tenantId = STUDIO_URL.exec(text)?.[1] ?? (TENANT_ID.test(text) ? text : undefined);
    return tenantId ? { tenantId, region: 'na1', environment: 'sandbox' } : undefined;
}

/** The project's ACO settings, or the fields still empty. */
export type AcoSettingsRead = { settings: AcoStorefrontSettings } | { missing: string[] };

/** Whether the project has the ACO add-on on. */
export function usesAco(source: AcoSettingsSource): boolean {
    return (source.selectedAddons ?? []).includes(ACO_ADDON_ID);
}

function valueOf(values: Record<string, unknown>, key: string): string {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value).trim();
}

/**
 * The instance alone, for what needs no catalog view: above all listing and creating the views, which
 * is how a project gets its first one, and loading rows, which name their own locale.
 *
 * @returns undefined when the add-on is off or no instance is named
 */
export function readAcoInstance(source: AcoSettingsSource): AcoInstance | undefined {
    if (!usesAco(source)) return undefined;
    return parseAcoInstance(valueOf(source.componentConfigs?.[ACO_ADDON_ID] ?? {}, ACO_TENANT_ID));
}

/**
 * The ACO settings the project names.
 *
 * @returns undefined when the add-on is off; the fields still empty when it is on but incomplete
 */
export function readAcoSettings(source: AcoSettingsSource): AcoSettingsRead | undefined {
    if (!usesAco(source)) return undefined;
    const values = source.componentConfigs?.[ACO_ADDON_ID] ?? {};
    const missing = [ACO_TENANT_ID, ACO_CATALOG_VIEW_ID, ACO_LOCALE].filter((key) => valueOf(values, key) === '');
    const instance = parseAcoInstance(valueOf(values, ACO_TENANT_ID));
    if (!instance && !missing.includes(ACO_TENANT_ID)) missing.push(ACO_TENANT_ID);
    if (missing.length > 0 || !instance) return { missing };
    return {
        settings: {
            ...instance,
            catalogViewId: valueOf(values, ACO_CATALOG_VIEW_ID),
            locale: valueOf(values, ACO_LOCALE),
        },
    };
}

/** Why a read gave no settings, in words, for a refusal. */
export function acoSettingsProblem(read: AcoSettingsRead | undefined): string | undefined {
    if (!read) return 'This project does not use Adobe Commerce Optimizer. Turn ACO on for the project first.';
    if ('missing' in read) return `The project's Adobe Commerce Optimizer settings are not complete: set ${read.missing.join(', ')} in Configure.`;
    return undefined;
}
