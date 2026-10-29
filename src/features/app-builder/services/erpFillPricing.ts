/**
 * The reverse pricing seed (AB-44): Commerce's custom shared catalogs → the ERP's price
 * groups, each company's group, and the catalogs' tier prices → the groups' price lists. Sent
 * once at fill, after products and partners, so the ERP adopts the store's existing contract
 * pricing instead of starting blind. Pure shape-mapping; the reads live in erpFillReaders and
 * the wiring in erpFill.
 *
 * @module features/app-builder/services/erpFillPricing
 */

import type { CommerceCompanyRow } from './erpFillRows';

/** A Commerce POST over the project's signed client, answering the parsed body. */
export type CommercePost = (path: string, body: unknown) => Promise<unknown>;

/** A Commerce custom shared catalog (GET sharedCatalog, type 0). */
export interface SharedCatalog {
    id: number;
    name: string;
    customerGroupId: number;
}

/** One shared-catalog tier price (POST products/tier-prices-information answers a bare array). */
export interface TierPrice {
    sku: string;
    /** The customer group CODE (a string), the way Commerce answers it. */
    customerGroup: string;
    quantity: number;
    price: number;
    priceType: 'fixed' | 'discount';
}

/** One price list the ERP seeds for a group. */
export interface ErpSeedContract {
    priceGroup: string;
    description: string;
    startingDate: string;
    lines: Array<{
        sku: string;
        kind: 'price' | 'discount';
        price?: number;
        percent?: number;
        minQty: number;
    }>;
}

/** The one-time pricing seed sent to the ERP's admin/import under `seed`. */
export interface ErpSeed {
    priceGroups: Array<{ code: string; name: string }>;
    partnerGroups: Array<{ id: string; priceGroup: string }>;
    contracts: ErpSeedContract[];
}

const MAX_CODE = 20;

/**
 * A Commerce customer-group code (any text) → a valid ERP price-group code: upper case,
 * `[A-Z0-9_-]`, at most 20 characters. "ServerSavvy Solutions" → "SERVERSAVVY_SOLUTIO".
 */
export function erpGroupCode(commerceCode: string): string {
    const code = String(commerceCode)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/gu, '_')
        .slice(0, MAX_CODE);
    return code || 'GROUP';
}

/** A price group per custom shared catalog: the ERP code from the group's code, the catalog's name. */
export function priceGroupsFrom(
    catalogs: SharedCatalog[],
    groupCodes: Map<number, string>,
): Array<{ code: string; name: string }> {
    const out = new Map<string, { code: string; name: string }>();
    for (const catalog of catalogs) {
        const commerceCode = groupCodes.get(catalog.customerGroupId);
        if (!commerceCode) continue;
        const code = erpGroupCode(commerceCode);
        if (!out.has(code)) out.set(code, { code, name: catalog.name });
    }
    return [...out.values()];
}

/** Each company's price group, for companies whose customer group has a custom shared catalog. */
export function partnerGroupsFrom(
    companies: CommerceCompanyRow[],
    catalogs: SharedCatalog[],
    groupCodes: Map<number, string>,
): Array<{ id: string; priceGroup: string }> {
    const catalogGroupIds = new Set(catalogs.map((c) => c.customerGroupId));
    const out: Array<{ id: string; priceGroup: string }> = [];
    for (const company of companies) {
        const groupId = company.customerGroupId;
        if (groupId === null || groupId === undefined || !catalogGroupIds.has(groupId)) continue;
        const commerceCode = groupCodes.get(groupId);
        if (!commerceCode) continue;
        out.push({ id: `C${company.id}`, priceGroup: erpGroupCode(commerceCode) });
    }
    return out;
}

/**
 * The catalogs' tier prices as the ERP's group price lists: one contract per group, its lines
 * the tier prices for SKUs this ERP owns. A `fixed` tier price is an agreed price; a `discount`
 * tier price is a percentage off.
 */
export function contractsFrom(
    tierPrices: TierPrice[],
    catalogGroupCodes: Set<string>,
    groupNamesByErpCode: Map<string, string>,
    ownedSkus: Set<string>,
    startingDate: string,
): ErpSeedContract[] {
    const linesByGroup = new Map<string, ErpSeedContract['lines']>();
    for (const tier of tierPrices) {
        if (!catalogGroupCodes.has(tier.customerGroup)) continue;
        if (!ownedSkus.has(tier.sku)) continue;
        const code = erpGroupCode(tier.customerGroup);
        const line =
            tier.priceType === 'discount'
                ? {
                      sku: tier.sku,
                      kind: 'discount' as const,
                      percent: tier.price,
                      minQty: tier.quantity || 1,
                  }
                : {
                      sku: tier.sku,
                      kind: 'price' as const,
                      price: tier.price,
                      minQty: tier.quantity || 1,
                  };
        const existing = linesByGroup.get(code);
        if (existing) existing.push(line);
        else linesByGroup.set(code, [line]);
    }
    return [...linesByGroup.entries()].map(([priceGroup, lines]) => ({
        priceGroup,
        description: groupNamesByErpCode.get(priceGroup) ?? priceGroup,
        startingDate,
        lines,
    }));
}

/** Assemble the whole seed from the Commerce reads. `startingDate` is the fill's day (YYYY-MM-DD). */
export function seedFrom(args: {
    catalogs: SharedCatalog[];
    groupCodes: Map<number, string>;
    companies: CommerceCompanyRow[];
    tierPrices: TierPrice[];
    ownedSkus: Set<string>;
    startingDate: string;
}): ErpSeed {
    const { catalogs, groupCodes, companies, tierPrices, ownedSkus, startingDate } = args;
    const priceGroups = priceGroupsFrom(catalogs, groupCodes);
    const partnerGroups = partnerGroupsFrom(companies, catalogs, groupCodes);
    const catalogGroupCodes = new Set(
        catalogs
            .map((c) => groupCodes.get(c.customerGroupId))
            .filter((code): code is string => Boolean(code)),
    );
    const namesByErpCode = new Map(priceGroups.map((g) => [g.code, g.name]));
    const contracts = contractsFrom(
        tierPrices,
        catalogGroupCodes,
        namesByErpCode,
        ownedSkus,
        startingDate,
    );
    return { priceGroups, partnerGroups, contracts };
}
