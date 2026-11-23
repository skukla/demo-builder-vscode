/**
 * J1 prototype data for the two Clear windows as the plan settles them (overview.md, Phase 6
 * item 3): Clear Demo Data for one project (no picker), and Clear Commerce Instance (choose
 * websites). Fake numbers, one shape: what happens to each type of data.
 *
 * The shape is the prototype's question, not today's contract. Where each record came from (the
 * datapack, or added by hand) is not shown: owner, 2026-11-11, J1-3, "noise we don't need".
 */

/** What happens to one type of data. */
export interface TypeOutcome {
    /** The type, as a heading: "Products". */
    type: string;
    /** What happens, counted: "2,060 removed". */
    happens: string;
    /** A few of them by name, so the SC recognises them. */
    examples?: string[];
    /** How many there are beyond `examples`. */
    more?: number;
    /** The records as a tree, for a type that nests (categories). Its nodes are the count. */
    tree?: TreeNode[];
    /**
     * Records of this type that stay, each with why. Shown in the spot check's list, tagged Kept,
     * not as a sentence (owner, 2026-11-11, J1-3); not counted in `happens`.
     */
    keptRecords?: KeptRecord[];
}

/**
 * What the spot check's first tab says for a type: "Removed", or "Closed" for orders, which are
 * never deleted. Every demo order ends Canceled or Closed (owner, 2026-11-11: invoice what is not
 * invoiced, then refund it all offline; Experience League, Order status and Credit memos).
 */
export const doneTab = (type: string): string => (type === 'Orders' ? 'Closed' : 'Removed');

/** One node of a nested type: a category and the categories under it. */
export interface TreeNode {
    name: string;
    children?: TreeNode[];
}

/**
 * A record that stays. There is one reason left, so none is stored or shown: another demo uses it,
 * which the summary's lead already says ("Anything another demo uses is kept"). Owner, 2026-11-11,
 * J1-3b, as the reasons were cut one by one: a failed read is a problem with Retry; orders all end
 * Canceled or Closed in Commerce (payment review is reported by the run's result); already-closed
 * orders and protected settings need nothing from the SC; and "Owner Unknown" only arose on a website
 * partly chosen, which Clear no longer does (it clears whole websites: overview.md, Phase 6 item 3).
 */
export interface KeptRecord {
    name: string;
}

/** A shorthand for a tree: "Name" for a leaf, ["Name", [...children]] for a parent. */
export type TreeSpec = string | [string, TreeSpec[]];

export const treeOf = (specs: TreeSpec[]): TreeNode[] =>
    specs.map((spec) => (typeof spec === 'string' ? { name: spec } : { name: spec[0], children: treeOf(spec[1]) }));

/** How many nodes a tree holds. */
export const nodeCount = (nodes: readonly TreeNode[]): number => nodes.reduce((n, node) => n + 1 + nodeCount(node.children ?? []), 0);

/** Bodea B2B's categories: 42 nodes under its root. */
const B2B_CATEGORIES = treeOf([
    ['Bodea B2B Catalog', [
        ['Lab Equipment', [['Centrifuges', ['Benchtop', 'Floor Standing']], ['Microscopes', ['Compound', 'Stereo', 'Digital']], ['Pipettes', ['Single Channel', 'Multichannel']], 'Balances']],
        ['Safety', [['Gloves', ['Nitrile', 'Latex', 'Vinyl']], ['Eye Protection', ['Goggles', 'Face Shields']], 'Lab Coats']],
        ['Clinical Supplies', ['Gauze and Dressings', ['Syringes', ['Luer Lock', 'Slip Tip']], 'Specimen Containers', 'Sharps Disposal']],
        ['Consumables', [['Tubes', ['Microcentrifuge', 'Conical']], ['Plates', ['96-Well', '384-Well']], 'Filters']],
        'Contract Pricing Test',
        ['Clearance', ['Overstock', 'Discontinued']],
        'New This Week',
    ]],
]);

/** Main Website's categories: 44 nodes under its root. */
const MAIN_CATEGORIES = treeOf([
    ['Main Website Root', [
        ['Gear', ['Bags', 'Fitness Equipment', 'Watches']],
        ['Men', [['Tops', ['Jackets', 'Hoodies', 'Tees', 'Tanks']], ['Bottoms', ['Pants', 'Shorts']]]],
        ['Women', [['Tops', ['Jackets', 'Hoodies', 'Tees', 'Bras and Tanks']], ['Bottoms', ['Pants', 'Shorts']]]],
        ['Training', ['Video Download']],
        ['Collections', ['New Luma Yoga', 'Erin Recommends', 'Performance Fabrics', 'Eco Friendly']],
        ['Promotions', ['Women Sale', 'Men Sale', 'Pants', 'Tees']],
        'Sale',
        "What's New",
        ['Trade Show', ['Booth Giveaways', 'Samples']],
        ['Clearance', ['Last Chance']],
        ['Test Categories', ['QA Only']],
    ]],
]);

/** CitiSignal's categories: 12 nodes under its root. */
const CITISIGNAL_CATEGORIES = treeOf([
    ['CitiSignal Root', [['Phones', ['iPhone', 'Android']], ['Plans', ['Unlimited', 'Prepaid']], ['Internet', ['Fiber', '5G Home']], ['Accessories', ['Cases']]]],
]);

export interface ClearCheck {
    rows: TypeOutcome[];
    /** How many things the clearing changes: the button's count. */
    total: number;
}

/** Clear Demo Data for the Bodea project, which uses one website (Bodea B2B). */
export const PROJECT_CLEAR: ClearCheck & { project: string; websites: string[] } = {
    project: 'Bodea',
    websites: ['Bodea B2B'],
    total: 2_126,
    rows: [
        {
            type: 'Products',
            happens: '2,052 removed',
            examples: ['Sample Kit A', 'Sample Kit B', 'Quote Test SKU'],
            more: 2_049,
            keptRecords: [
                { name: 'Nitrile Gloves' },
                { name: 'Sterile Gauze' },
            ],
        },
        { type: 'Categories', happens: '42 removed', tree: B2B_CATEGORIES, keptRecords: [{ name: 'Default Category' }] },
        {
            type: 'Customers',
            happens: '10 removed',
            examples: ['buyer@riverside.example.com', 'ops@northbridge.example.com', 'admin@summit.example.com'],
            more: 7,
            keptRecords: [
                { name: 'jamie.ortiz@example.com' },
                { name: 'pat.lee@example.com' },
            ],
        },
        {
            type: 'Companies',
            happens: '9 removed',
            examples: ['Riverside Medical Center', 'Northbridge Labs', 'Summit Clinics'],
            more: 6,
        },
        { type: 'Shared Catalogs', happens: '3 removed', examples: ['Riverside Medical Center', 'Northbridge Labs', 'Summit Clinics'] },
        { type: 'Cart Rules', happens: '1 removed', examples: ['B2B Volume Tier'] },
        // Each shared catalog's own customer group, counted here rather than as "with their customer
        // groups" on the catalog (owner, 2026-11-11, J1-5: every record under its own type).
        { type: 'Customer Groups', happens: '3 removed', examples: ['Riverside Medical Center', 'Northbridge Labs', 'Summit Clinics'] },
        { type: 'Attribute Sets', happens: '1 removed', examples: ['Lab Equipment'] },
        {
            type: 'Website Settings',
            happens: '7 set back to the default value',
            examples: ['Company enabled', 'Shared catalog enabled', 'Quick order enabled'],
            more: 4,
        },
        {
            type: 'Orders',
            happens: '12 closed',
            examples: ['000000140', '000000141', '000000144'],
            more: 9,
        },
    ],
};

/** A website on the instance, the projects on this computer using it, and its data by type. */
export interface InstanceWebsite {
    code: string;
    name: string;
    projects: string[];
    rows: TypeOutcome[];
    total: number;
}

export const INSTANCE_WEBSITES: InstanceWebsite[] = [
    {
        code: 'base',
        name: 'Main Website',
        projects: ['Kukla Luma', 'Luma Test'],
        total: 2_131,
        rows: [
            { type: 'Products', happens: '2,060 removed', examples: ['Joust Duffle Bag', 'Demo Hoodie', 'Test Mug'], more: 2_057 },
            { type: 'Categories', happens: '44 removed', tree: MAIN_CATEGORIES },
            { type: 'Customers', happens: '33 removed', examples: ['roni_cost@example.com', 'jamie.ortiz@example.com', 'pat.lee@example.com'], more: 30 },
            { type: 'Cart Rules', happens: '2 removed', examples: ['Booth Discount', 'QA Test Rule'] },
            { type: 'Customer Groups', happens: '1 removed', examples: ['Event Attendees'] },
            { type: 'Website Settings', happens: '4 set back to the default value', examples: ['Home page', 'Products per page', 'Locale'], more: 1 },
            { type: 'Orders', happens: '8 closed', examples: ['000000112', '000000113', '000000117'], more: 5 },
        ],
    },
    {
        code: 'b2b',
        name: 'Bodea B2B',
        projects: ['Bodea', 'Bodea Copy', 'Bodea Training', 'Bodea Pharma'],
        total: 2_128,
        rows: PROJECT_CLEAR.rows.map((r) => (r.type === 'Customers' ? { ...r, happens: '12 removed', more: 9, keptRecords: undefined } : r)),
    },
    {
        code: 'citisignal',
        name: 'CitiSignal',
        projects: ['CitiSignal Demo'],
        total: 412,
        rows: [
            { type: 'Products', happens: '388 removed', examples: ['Pixel Pro', 'Unlimited Plan', 'Fiber 1 Gig'], more: 385 },
            { type: 'Categories', happens: '12 removed', tree: CITISIGNAL_CATEGORIES },
            { type: 'Customers', happens: '9 removed', examples: ['casey@example.com', 'drew@example.com', 'eli@example.com'], more: 6 },
            { type: 'Orders', happens: '3 closed', examples: ['000000201', '000000202', '000000203'] },
        ],
    },
];

/** "Kukla Luma and Luma Test", "Bodea, Bodea Copy and 2 more": two names, then a count. */
export function namesLine(names: readonly string[]): string {
    if (names.length <= 2) return names.join(' and ');
    return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** The order the types are listed in, whichever websites they come from. */
const TYPE_ORDER = ['Products', 'Categories', 'Customers', 'Companies', 'Shared Catalogs', 'Cart Rules', 'Customer Groups', 'Attribute Sets', 'Attributes', 'Website Settings', 'Orders'];

/** Types Clear does not have, added only to show the left column holding more than it was sized for. */
const OVERFLOW_TYPES = ['CMS Pages', 'CMS Blocks', 'Catalog Price Rules', 'Tax Rules'];

/** Which types the spot check lists: the data's own, all eleven Clear knows, or more than fit. */
export type TypeSpread = 'data' | 'all' | 'overflow';

/** The rows with stand-in rows added for the types the spread asks for and the data lacks. */
export function spreadTypes(rows: TypeOutcome[], spread: TypeSpread): TypeOutcome[] {
    if (spread === 'data') return rows;
    const names = [...TYPE_ORDER, ...(spread === 'overflow' ? OVERFLOW_TYPES : [])];
    const have = new Map(rows.map((r) => [r.type, r]));
    return names.map((type) => have.get(type) ?? { type, happens: '1 removed', examples: [`Example ${type.replace(/s$/u, '')}`] });
}

/** The leading number of "2,060 removed". */
const leading = (text: string): number => Number(text.replace(/,/gu, '').match(/^\d+/u)?.[0] ?? 0);

/** What clearing these websites does, type by type: the counts added, the first website's names. */
export function instanceCheck(codes: ReadonlySet<string>): ClearCheck {
    const chosen = INSTANCE_WEBSITES.filter((w) => codes.has(w.code));
    const byType = new Map<string, { row: TypeOutcome; count: number; rest: string; tree: TreeNode[]; kept: KeptRecord[] }>();
    for (const site of chosen) {
        for (const row of site.rows) {
            const seen = byType.get(row.type);
            const count = leading(row.happens);
            const rest = row.happens.replace(/^[\d,]+\s*/u, '');
            if (seen) {
                seen.count += count;
                seen.tree.push(...(row.tree ?? []));
                seen.kept.push(...(row.keptRecords ?? []));
            } else byType.set(row.type, { row, count, rest, tree: [...(row.tree ?? [])], kept: [...(row.keptRecords ?? [])] });
        }
    }
    const order = (type: string): number => TYPE_ORDER.indexOf(type);
    const rows = [...byType.values()].sort((a, b) => order(a.row.type) - order(b.row.type)).map(({ row, count, rest, tree, kept }) => ({
        type: row.type,
        happens: `${count.toLocaleString('en-US')} ${rest}`,
        examples: row.examples,
        more: Math.max(0, count - (row.examples?.length ?? 0)),
        ...(tree.length ? { tree } : {}),
        ...(kept.length ? { keptRecords: kept } : {}),
    }));
    return { rows, total: chosen.reduce((t, w) => t + w.total, 0) };
}

/** The most records the prototype draws for one type: enough to scroll, not 4,500 rows. */
const RECORD_CAP = 120;

/**
 * The spot check's flat list for a type that does not nest: the named examples, then made-up names
 * for the rest, up to `RECORD_CAP`. The real check returns three names per type today, so a full
 * list is new work for the check, not something it already has.
 */
export function recordsOf(row: TypeOutcome): string[] {
    const named = row.examples ?? [];
    const total = named.length + (row.more ?? 0);
    const noun = row.type.replace(/ies$/u, 'y').replace(/s$/u, '');
    const made = Array.from({ length: Math.max(0, Math.min(total, RECORD_CAP) - named.length) }, (_, i) => `${noun} ${i + named.length + 1}`);
    return [...named, ...made];
}

/** How many of the type are removed: a tree's nodes, or the named ones and the rest. */
export const countOf = (row: TypeOutcome): number => (row.tree ? nodeCount(row.tree) : (row.examples?.length ?? 0) + (row.more ?? 0));
