/**
 * The line under each of the clearing's removal steps: how far it has got through that step's
 * items ("12 of 40 customers"), as an install counts through its data types (owner, 2026-11-04).
 *
 * @module features/data-installer/services/demoDataWipe/wipeStepLine
 */

/** Each step's items, one and more than one; a step taking things off sites counts the same things. */
const NOUNS = {
    customers: ['customer', 'customers'],
    products: ['product', 'products'],
    takenOff: ['product', 'products'],
    cartRules: ['cart rule', 'cart rules'],
    rulesTakenOff: ['cart rule', 'cart rules'],
    categories: ['category', 'categories'],
    companies: ['company', 'companies'],
    catalogs: ['shared catalog', 'shared catalogs'],
    customerGroups: ['customer group', 'customer groups'],
    attributeSets: ['attribute set', 'attribute sets'],
    attributes: ['attribute', 'attributes'],
    returns: ['return', 'returns'],
    orders: ['order', 'orders'],
} as const;

export type WipeStepKey = keyof typeof NOUNS;

/** "12 of 40 customers", "0 of 1 order". */
export function stepLine(key: WipeStepKey, done: number, total: number): string {
    const [one, many] = NOUNS[key];
    return `${done} of ${total} ${total === 1 ? one : many}`;
}
