/**
 * A cart rule's condition trees, both ways (datapack-engine step 11): a pack names what a product
 * condition tests by what a person reads, and Commerce stores this store's ids. Read off the Data
 * Installer's `condition_substitutions` for `cart_rules` (import and export,
 * `config/data_processors_*.json`), which walk the `condition` and `action_condition` trees:
 *
 * | Product condition on | In a pack | In Commerce |
 * |---|---|---|
 * | `category_ids` | url keys, comma-separated (`skincare,beauty,hair-care`) | category ids, comma-separated |
 * | `attribute_set_id` | the set's name (`Wipers`) | the set's id |
 * | a select or multiselect attribute the SC made | option labels | option ids |
 * | `sku`, and anything else | as it is | as it is |
 *
 * Where this differs from the service: an attribute the store does not describe (Commerce's own
 * cart fields, `quote_item_qty` and the like) or one that is not a select is sent as it is, where
 * the service looked an option up for every attribute; and a name that cannot be found stops the
 * install, as every lookup in this engine does.
 *
 * A customer segment condition (`Magento\CustomerSegment\…\Segment`) names a segment by THIS
 * store's id, which no lookup can carry to another store: it is sent as it is, and the install says
 * so in Debug Logs (the import-datapack skill already tells the SC such a rule needs fixing).
 *
 * @module features/data-installer/services/demoBuilderEngine/ruleConditions
 */

import { type ProductLookups, isNumeric } from './productLookups';
import type { CommerceRuleCondition } from '@/types/commerceSalesRule';

/** The condition type a product attribute is tested by. */
const PRODUCT_CONDITION = 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product';

/** A condition that names a customer segment by the store's own id. */
const SEGMENT_CONDITION = /CustomerSegment/u;

/** Inputs whose stored values are option ids. */
const OPTION_INPUTS = new Set(['select', 'multiselect']);

type Direction = 'install' | 'capture';

const splitList = (value: unknown): string[] => String(value ?? '').split(',').map((v) => v.trim()).filter(Boolean);

/** The value, or the id it came from when the lookup has no name for it (capture keeps ids it cannot name). */
async function nameOr(id: string, lookup: () => Promise<string | undefined>): Promise<string> {
    try {
        return (await lookup()) ?? id;
    } catch {
        return id;
    }
}

async function categories(lk: ProductLookups, value: unknown, way: Direction): Promise<string> {
    const each = splitList(value);
    if (way === 'install') return (await Promise.all(each.map((key) => (isNumeric(key) ? key : lk.categoryId(key))))).join(',');
    return (await Promise.all(each.map((id) => nameOr(id, () => lk.categoryUrlKey(id))))).join(',');
}

async function attributeSet(lk: ProductLookups, value: unknown, way: Direction): Promise<string> {
    const text = String(value ?? '');
    if (way === 'install') return isNumeric(text) ? text : String(await lk.setId(text));
    return nameOr(text, () => lk.setName(text));
}

/** An option attribute's value, labels to ids or back; anything else as it is. */
async function optionValue(lk: ProductLookups, code: string, value: unknown, way: Direction): Promise<unknown> {
    let input: string | undefined;
    let userDefined = false;
    try {
        const attribute = await lk.attribute(code);
        input = attribute.frontend_input;
        userDefined = attribute.is_user_defined === true;
    } catch {
        return value;
    }
    if (!OPTION_INPUTS.has(input ?? '') || (way === 'capture' && !userDefined)) return value;
    const each = splitList(value);
    if (way === 'install') return (await Promise.all(each.map((label) => (isNumeric(label) ? label : lk.optionId(code, label))))).join(',');
    return (await Promise.all(each.map((id) => nameOr(id, () => lk.optionLabel(code, id))))).join(',');
}

async function nodeValue(lk: ProductLookups, node: CommerceRuleCondition, way: Direction): Promise<CommerceRuleCondition['value']> {
    const code = node.attribute_name ?? '';
    if (node.condition_type !== PRODUCT_CONDITION || code === '' || code === 'sku' || node.value === null || node.value === undefined) return node.value;
    if (code === 'category_ids') return categories(lk, node.value, way);
    if (code === 'attribute_set_id') return attributeSet(lk, node.value, way);
    return (await optionValue(lk, code, node.value, way)) as CommerceRuleCondition['value'];
}

/** One tree, every node's value turned the given way; the shape kept exactly. */
async function mapTree(lk: ProductLookups, node: CommerceRuleCondition, way: Direction): Promise<CommerceRuleCondition> {
    const mapped: CommerceRuleCondition = { ...node };
    if (node.value !== undefined) mapped.value = await nodeValue(lk, node, way);
    if (node.conditions) mapped.conditions = await Promise.all(node.conditions.map((child) => mapTree(lk, child, way)));
    return mapped;
}

/** A pack's condition tree with this store's ids in it. */
export const conditionsForStore = (lk: ProductLookups, node: CommerceRuleCondition): Promise<CommerceRuleCondition> => mapTree(lk, node, 'install');

/** A store's condition tree with names in it, as a pack holds it. */
export const conditionsForPack = (lk: ProductLookups, node: CommerceRuleCondition): Promise<CommerceRuleCondition> => mapTree(lk, node, 'capture');

/** Whether a tree tests a customer segment anywhere in it. */
export function namesSegment(node: CommerceRuleCondition | undefined): boolean {
    if (!node) return false;
    return SEGMENT_CONDITION.test(node.condition_type) || (node.conditions ?? []).some(namesSegment);
}
