/**
 * Whether a removal keeps an attribute, or an option of one, the pack made (datapack-simplification
 * step-06 C3 review, 2026-11-13): kept while a product that stays carries a value for it. Commerce
 * deletes an attribute's values with it, and an option's from every product that has it, which on
 * another demo's products is the damage DI-8 did by another route. `removers.ts` asks it with the
 * other containers; Clear's check reads the same carriers (`wipeAttributes.ts`), so the two agree.
 *
 * | Read | Endpoint and field | Confirmed from a real answer? |
 * |---|---|---|
 * | who carries an attribute | `GET products`, its code `notnull` (as `demoUses.ts` asks), `fields=total_count,items[sku]` | yes (`demoUses.ts`, 2026-11-09). A value set on one store view alone may not show |
 * | who carries an option of it | the same, `fields=total_count,items[sku,custom_attributes]`, read only when an option is decided | the values field, **no** |
 *
 * One read per attribute serves it, and one with values all its options (`carriersOnce`). A read that fails keeps it;
 * a store with no such search (404) has no carriers.
 *
 * @module features/data-installer/services/demoBuilderEngine/attributeHolds
 */

import { ATTRIBUTE_OPTION_KIND } from './attributesKind';
import type { CreatedObject } from './installRecord';
import { CommerceReadError, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceGet } from '@/types/commerceWire';

/** A product carrying a value for an attribute, and its values (a list attribute's split). */
export interface Carrier {
    sku: string;
    values: string[];
}

type CarrierRow = { sku: string; custom_attributes?: Array<{ attribute_code: string; value?: unknown }> };

function valuesOf(row: CarrierRow, code: string): string[] {
    const value = row.custom_attributes?.find((a) => a.attribute_code === code)?.value;
    if (Array.isArray(value)) return value.map(String);
    return value === undefined || value === null ? [] : String(value).split(',');
}

/**
 * Who carries a value for an attribute; none when the store has no such search. With `values`, each
 * carrier's values too (an option's hold needs them); without, SKUs only, the cheap read.
 */
export async function carriersOf(get: CommerceGet, code: string, values = false): Promise<Carrier[]> {
    const filter = 'searchCriteria[filterGroups][0][filters][0]';
    const fields = values ? 'items[sku,custom_attributes]' : 'items[sku]';
    const criteria = `&${filter}[field]=${code}&${filter}[value]=1&${filter}[conditionType]=notnull&fields=total_count,${fields}`;
    try {
        return (await readAllPages<CarrierRow>(get, 'products', criteria)).map((row) => ({ sku: row.sku, values: valuesOf(row, code) }));
    } catch (error) {
        if (error instanceof CommerceReadError && error.status === 404) return [];
        throw error;
    }
}

/** Each attribute's carriers, read once, and once with values however many of its options ask. */
export function carriersOnce(get: CommerceGet): (code: string, values: boolean) => Promise<Carrier[]> {
    const read = new Map<string, Promise<Carrier[]>>();
    return (code, values) => {
        const key = `${values ? 'values' : 'skus'}:${code}`;
        const known = read.get(key) ?? carriersOf(get, code, values);
        read.set(key, known);
        return known;
    };
}

const staysWord = (count: number): string => (count === 1 ? '1 product that stays carries' : `${count} products that stay carry`);

/** Why an attribute or option stays, or undefined when it may go. */
export interface AttributeHold {
    count: number;
    holds: 'product' | 'thing';
    reason: string;
}

/**
 * Whether an attribute (`<code>`) or option (`<code>/<value>`) stays.
 *
 * @param stays - whether a product, by SKU, stays (is not going in the same removal)
 */
export async function attributeHold(read: (code: string, values: boolean) => Promise<Carrier[]>, object: CreatedObject, stays: (sku: string) => boolean): Promise<AttributeHold | undefined> {
    const [code, value] = object.id.split('/');
    const option = object.kind === ATTRIBUTE_OPTION_KIND ? (value ?? '') : undefined;
    let staying: Carrier[];
    try {
        staying = (await read(code, option !== undefined)).filter((c) => stays(c.sku) && (option === undefined || c.values.includes(option)));
    } catch {
        return { count: 0, holds: 'thing', reason: 'Demo Builder could not read which products carry it' };
    }
    if (staying.length === 0) return undefined;
    return { count: staying.length, holds: 'product', reason: `${staysWord(staying.length)} ${option === undefined ? 'a value for it' : 'it'}` };
}
