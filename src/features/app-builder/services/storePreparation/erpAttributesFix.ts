/**
 * The `create-erp-attributes` fix (AB-77): `erp_owner` and `brand` created as Text Fields
 * (`POST products/attributes`, the body from Magento's ProductAttributeInterface and the data
 * installer's product_attributes schema), then `erp_owner` added to every attribute set the
 * store's products use that lacks it (AB-74's `addOwnerToSets`).
 *
 * The undo deletes only an attribute THIS run created, never one that pre-existed, and takes
 * `erp_owner` out of only the sets this run added it to. It refuses while a product carries an
 * `erp_owner` value that the removal would lose.
 *
 * @module features/app-builder/services/storePreparation/erpAttributesFix
 */

import { listAssignableProducts } from '../erpAssignSelection';
import { CommerceReadError, type CommerceGet } from '../erpFillReaders';
import { addOwnerToSets, OWNER_CODE, readProductSets, removeOwnerFromSets, setsWithoutOwner } from '../erpOwnerAttributeSets';
import { taggedRefusal } from '../erpTaggedRefusal';
import { errorText, type FixApplied, type FixPreview, type FixUndone, type StepFix } from './fixContract';
import type { CommerceProductAttribute } from '@/types/commerceWire';
import type { AttributeSetWithoutOwner } from '@/types/erpAssign';
import type { ErpAttributesStepRecord, StorePreparationStepRecord } from '@/types/storePreparation';

const BRAND_CODE = 'brand';
const CODES = [OWNER_CODE, BRAND_CODE] as const;
const LABELS: Record<(typeof CODES)[number], string> = { erp_owner: 'ERP Owner', brand: 'Brand' };
const TEXT_FIELD = 'text';

/** The attribute, or `null` when Commerce has none (it answers a 404). */
async function readAttribute(get: CommerceGet, code: string): Promise<CommerceProductAttribute | null> {
    try {
        return (await get(`products/attributes/${code}`)) as CommerceProductAttribute | null;
    } catch (error) {
        if (error instanceof CommerceReadError && error.status === 404) return null;
        throw error;
    }
}

/** The body `POST products/attributes` takes for a plain Text Field. */
export function textAttributeBody(code: string): { attribute: CommerceProductAttribute } {
    return {
        attribute: {
            attribute_code: code,
            frontend_input: TEXT_FIELD,
            default_frontend_label: LABELS[code as (typeof CODES)[number]] ?? code,
            frontend_labels: [{ store_id: 0, label: LABELS[code as (typeof CODES)[number]] ?? code }],
            is_required: false,
            is_user_defined: true,
            scope: 'global',
            backend_type: 'varchar',
        },
    };
}

interface Plan {
    missing: string[];
    /** `erp_owner` exists but is not a Text Field: Demo Builder does not change an attribute's type. */
    wrongType?: string;
    sets: AttributeSetWithoutOwner[];
}

/** What the fix would do: which attributes to create, which sets to add `erp_owner` to. */
async function plan(get: CommerceGet): Promise<Plan> {
    const missing: string[] = [];
    let wrongType: string | undefined;
    for (const code of CODES) {
        const row = await readAttribute(get, code);
        if (!row) missing.push(code);
        else if (code === OWNER_CODE && row.frontend_input !== TEXT_FIELD) {
            wrongType = `erp_owner exists as a ${row.frontend_input}; it must be a Text Field. Change its type in the Admin, or delete it and apply this step again.`;
        }
    }
    const sets = await setsWithoutOwner(get, await readProductSets(get));
    return { missing, ...(wrongType ? { wrongType } : {}), sets };
}

const createLine = (code: string): string => `Create the ${code} product attribute as a Text Field`;
const setLine = (set: { name: string; products?: number }): string =>
    `Add erp_owner to the attribute set ${set.name}${set.products === undefined ? '' : ` (${set.products} products)`}`;
/** The same lines said as done, for what an apply reports (the result screen lists them). */
const createdLine = (code: string): string => `Created the ${code} product attribute as a Text Field`;
const addedLine = (set: { name: string; products?: number }): string => setLine(set).replace(/^Add /, 'Added ');

export const erpAttributesFix: StepFix = {
    async preview(deps): Promise<FixPreview> {
        const planned = await plan(deps.commerce.get);
        return {
            changes: [...planned.missing.map(createLine), ...planned.sets.map(setLine)],
            ...(planned.wrongType ? { manual: planned.wrongType } : {}),
        };
    },
    async apply(deps): Promise<FixApplied> {
        const { get, send } = deps.commerce;
        const planned = await plan(get);
        const changes: string[] = [];
        const rejected: string[] = [];
        const created: string[] = [];
        for (const code of planned.missing) {
            try {
                await send('POST', 'products/attributes', textAttributeBody(code));
                created.push(code);
                changes.push(createdLine(code));
            } catch (error) {
                rejected.push(`${createLine(code)}: ${errorText(error)}`);
            }
        }
        const ownerStands = !planned.missing.includes(OWNER_CODE) || created.includes(OWNER_CODE);
        const added = ownerStands && !planned.wrongType ? await addOwnerToSets(get, send, planned.sets) : { changed: [] };
        changes.push(...added.changed.map((set) => addedLine(planned.sets.find((wanted) => wanted.id === set.id) ?? set)));
        if ('error' in added && added.error) rejected.push(`Add erp_owner to the attribute set ${added.error}`);
        if (!ownerStands) rejected.push(...planned.sets.map((set) => `${setLine(set)}: erp_owner was not created`));
        const record: ErpAttributesStepRecord | undefined =
            created.length > 0 || added.changed.length > 0 ? { kind: 'erp-attributes', createdAttributes: created, sets: added.changed } : undefined;
        return { changes, rejected, ...(record ? { record } : {}), ...(planned.wrongType ? { manual: planned.wrongType } : {}) };
    },
    async undo(deps, record: StorePreparationStepRecord): Promise<FixUndone> {
        if (record.kind !== 'erp-attributes') return { changes: [], rejected: [`The record is not an attributes record (${record.kind}).`] };
        const { get, send } = deps.commerce;
        const deletesOwner = record.createdAttributes.includes(OWNER_CODE);
        const setIds = new Set(record.sets.map((set) => set.id));
        const tagged = (await listAssignableProducts(get)).filter((row) => row.owner !== '' && (deletesOwner || setIds.has(row.attributeSetId)));
        if (tagged.length > 0) return { changes: [], rejected: [taggedRefusal(tagged.map((row) => row.owner), deps.erpNames)] };
        const changes: string[] = [];
        const rejected: string[] = [];
        const removed = await removeOwnerFromSets(send, record.sets);
        changes.push(...removed.changed.map((set) => `Took erp_owner out of the attribute set ${set.name}`));
        if (removed.error) rejected.push(`Take erp_owner out of the attribute set ${removed.error}`);
        for (const code of record.createdAttributes) {
            try {
                await send('DELETE', `products/attributes/${code}`, undefined);
                changes.push(`Deleted the ${code} product attribute (Demo Builder created it)`);
            } catch (error) {
                rejected.push(`Delete the ${code} product attribute: ${errorText(error)}`);
            }
        }
        return { changes, rejected };
    },
};
