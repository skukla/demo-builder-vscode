/**
 * J2's data: the two datapacks, what Commerce holds against the demo's one, and the install run as
 * steps at any moment of it. The steps are built here, not by the extension's `importSteps`,
 * because the plan words them differently from today: no version or date in a name (D3), the save
 * step says where it saved ("Saved to My Luma", the Phase 4 mockup), and a replace's first step
 * uninstalls the old datapack "from Commerce" (Phase 5). The data types under Install are the
 * extension's own rows (`runRows`, `doingLine`), so a data type reads as it does in the real window.
 */

import { doingLine, type ImportStep } from '@/features/data-installer/importSteps';
import { SAVE_RUN, runRows } from '@/features/data-installer/runRows';
import type { DataTypeStatus } from '@/features/data-installer/types';
import { dataTypeLabel } from '@/features/data-installer/ui/dataTypeLabel';
import { treeOf, type TreeNode, type TypeOutcome } from './scenarioClear';

/** The demo's datapack, and another. */
export const DEMO_PACK = 'My Luma';
export const OTHER_PACK = 'Bodea';
export type PackName = typeof DEMO_PACK | typeof OTHER_PACK;

/** Which datapack the demo uses: none yet, or one of the two (the card with the blue check). */
export type DemoUses = PackName | 'none';

/** Whether Commerce holds changes the SC has not saved to the demo's datapack (Phase 3). */
export type CommerceState = 'clean' | 'unsaved';

/** How the install run ends, as the panel's "Install ends" select picks it (J2-2). */
export type RunEnding = 'clean' | 'warning' | 'stopped';

/** The Dry Run's answer, as the panel's "Dry Run result" select picks it (J2-4, D6). */
export type DryRunAnswer = 'passed' | 'problem' | 'failed';

/** One data type in a datapack: its code (the extension's), how many, and what installing changes. */
export interface PackType {
    code: string;
    count: number;
    /** What installing adds: the bare count when every record is new ("56"); "53 added, 3 updated" only when some already exist (owner, J2-1). */
    change: string;
}

export interface Pack {
    name: PackName;
    /** The card's date, information only (D3). */
    saved: string;
    types: PackType[];
    /** Its categories as a tree, for the spot check (J1-3a: categories are an indented tree). */
    categories?: TreeNode[];
    /** A few records by name per type code, for the spot check; the rest are numbered. */
    examples?: Record<string, string[]>;
}

/** Bodea's 21 categories, the count its Categories row says. */
const BODEA_CATEGORIES = treeOf([
    ['Bodea Catalog', [
        ['Lab Equipment', ['Centrifuges', 'Microscopes', 'Pipettes']],
        ['Safety', ['Gloves', 'Eye Protection', 'Lab Coats']],
        ['Clinical Supplies', ['Gauze and Dressings', 'Syringes', 'Specimen Containers']],
        ['Consumables', ['Tubes', 'Plates', 'Filters']],
        ['Clearance', ['Overstock', 'Discontinued']],
        'New This Week',
    ]],
]);

export const PACKS: Record<PackName, Pack> = {
    [DEMO_PACK]: {
        name: DEMO_PACK,
        saved: 'Saved Nov 10, 9:15 AM',
        types: [
            { code: 'product_attributes', count: 46, change: '46' },
            { code: 'attribute_sets', count: 9, change: '9' },
            { code: 'categories', count: 38, change: '38' },
            { code: 'customer_groups', count: 4, change: '4' },
            { code: 'products', count: 2_046, change: '2,046' },
            { code: 'customers', count: 10, change: '10' },
            { code: 'cart_rules', count: 3, change: '3' },
            { code: 'coupons', count: 6, change: '6' },
            { code: 'source_items', count: 2_046, change: '2,046' },
        ],
    },
    [OTHER_PACK]: {
        name: OTHER_PACK,
        saved: 'Saved Nov 8, 4:02 PM',
        types: [
            { code: 'attribute_sets', count: 4, change: '4' },
            { code: 'categories', count: 21, change: '21' },
            { code: 'customer_groups', count: 3, change: '3' },
            { code: 'products', count: 56, change: '56' },
            { code: 'customers', count: 8, change: '8' },
            { code: 'cart_rules', count: 2, change: '2' },
            { code: 'coupons', count: 4, change: '4' },
            { code: 'source_items', count: 56, change: '56' },
        ],
        categories: BODEA_CATEGORIES,
        examples: { products: ['Benchtop Centrifuge', 'Compound Microscope', 'Nitrile Gloves'], customers: ['Ava Chen', 'Marcus Reed'] },
    },
};

/**
 * The SC's unsaved changes to the demo's datapack, for "Save Your Changes First?": counts by type,
 * no example names (owner, 2026-11-11, J2-1), in Clear's summary form.
 */
export const UNSAVED: TypeOutcome[] = [
    { type: 'Products', happens: '4 changed' },
    { type: 'Categories', happens: '1 changed' },
];

/**
 * What installing a datapack does, as the summary's rows (prototype-conventions.md rule 8): one row
 * per type with something to change, its plain name and its count, "56" (rule 7: nothing else listed).
 */
export function installRows(pack: Pack): TypeOutcome[] {
    return pack.types.filter((t) => t.count > 0).map((t) => {
        const row = { type: dataTypeLabel(t.code), happens: t.change };
        if (t.code === 'categories' && pack.categories) return { ...row, tree: pack.categories };
        const examples = pack.examples?.[t.code] ?? [];
        return { ...row, examples, more: t.count - examples.length };
    });
}

/** How long the run "took", as a real one would time it: a minute or more shows "Took …". */
export const RUN_TOOK_MS = 192_000;

/** The one problem each ending with a problem shows, on the row it is about. One short line each. */
const VERIFY_DIFFER = 3;
export const STOP_REASON = "Commerce didn't answer in time";
const STOP_AT = 'products';

/** The Dry Run's three answers: the result names the datapack and says nothing was written (D6). */
export const DRY_RUN: Record<DryRunAnswer, { title: string; status: 'success' | 'warning' | 'error'; lead: (pack: string) => string }> = {
    passed: { title: 'Dry Run Passed', status: 'success', lead: (pack) => `${pack} can be installed here. Nothing was written.` },
    problem: {
        title: 'Dry Run Found a Problem',
        status: 'warning',
        lead: (pack) => `${pack}'s products name an attribute set Commerce doesn't have, Bags. Nothing was written.`,
    },
    failed: { title: 'Dry Run Failed', status: 'error', lead: (pack) => `The dry run of ${pack} couldn't reach Commerce. Nothing was written.` },
};

/** What one run is: the datapack, the one it replaces, whether it saves first, and how it ends. */
export interface RunPlan {
    pack: Pack;
    replaces?: PackName;
    saves: boolean;
    ending: RunEnding;
}

/** The run's units of work, one per tick: the save, the uninstall, each data type, then Verify. */
function unitsBefore(plan: RunPlan): number {
    return (plan.saves ? 1 : 0) + (plan.replaces ? 1 : 0);
}

/** The tick the run ends at: after Verify, or on the data type it stopped at. */
export function endTick(plan: RunPlan): number {
    const before = unitsBefore(plan);
    if (plan.ending === 'stopped') return before + plan.pack.types.findIndex((t) => t.code === STOP_AT);
    return before + plan.pack.types.length + 1;
}

const digits = (n: number): string => n.toLocaleString('en-US');

/** A step that is one unit of work: waiting, working on its line, then done on its line. */
export function unitStep(kind: string, label: string, state: number, working: string, done: string): ImportStep {
    if (state < 0) return { kind, label, status: 'pending', line: 'Waiting' };
    if (state === 0) return { kind, label, status: 'checking', line: working };
    return { kind, label, status: 'success', line: done };
}

/** Each data type's state at `tick`, as the engine reports it. */
function perType(plan: RunPlan, tick: number, ended: boolean): Record<string, DataTypeStatus> {
    const first = unitsBefore(plan);
    const states: Record<string, DataTypeStatus> = {};
    plan.pack.types.forEach((t, i) => {
        const at = first + i;
        if (ended && plan.ending === 'stopped' && t.code === STOP_AT) states[t.code] = 'error';
        else if (tick > at || (ended && plan.ending !== 'stopped')) states[t.code] = 'success';
        else if (tick === at && !ended) states[t.code] = 'processing';
        else states[t.code] = ended ? 'error' : 'pending';
    });
    return states;
}

/** A save's working word on its export rows (J3-1). */
const EXPORTING = 'Exporting';

/** What a types step is called and says when done: Install My Luma / Installed, Save My Luma / Saved (J3). */
export interface TypesStepWords {
    kind: string;
    label: string;
    done: string;
    /**
     * A save's export from Commerce: the extension's save rows, working word "Exporting" ("Exporting
     * 2 of 4"; owner, 2026-11-12, J3-1: Commerce's own word for taking data out).
     */
    save?: true;
}

/**
 * A step with the datapack's data types under it: the extension's rows, the working one saying what
 * it does. Install's step, and J3's save and create steps, which run over data types the same way.
 */
export function typesStep(plan: RunPlan, tick: number, ended: boolean, words: TypesStepWords): ImportStep {
    const states = perType(plan, tick, ended);
    const working = plan.pack.types.find((t) => states[t.code] === 'processing');
    const detail = working ? `${digits(Math.ceil(working.count / 2))} of ${digits(working.count)} ${dataTypeLabel(working.code).toLowerCase()}` : undefined;
    const source = { perType: states, dataTypes: plan.pack.types.map((t) => t.code), running: !ended, ...(detail ? { detail } : {}) };
    const stopped = ended && plan.ending === 'stopped' ? { stoppedAt: STOP_AT, reason: STOP_REASON } : {};
    const count = detail?.match(/^[\d,]+ of [\d,]+/u)?.[0];
    const exportRun = { ...SAVE_RUN, doing: EXPORTING };
    const doing = words.save ? `${EXPORTING}${count ? ` ${count}` : ''}` : doingLine(detail);
    const types = runRows({ ...source, ...stopped }, ...(words.save ? [exportRun] : [])).map((row) => (row.status === 'checking' ? { ...row, line: doing } : row));
    const row = { kind: words.kind, label: words.label, types };
    const done = types.filter((t) => t.status === 'success').length;
    if (types.some((t) => t.status === 'error')) return { ...row, status: 'error', line: 'Stopped' };
    if (done === types.length) return { ...row, status: 'success', line: words.done };
    if (working) return { ...row, status: 'checking', line: `${done} of ${types.length} data types` };
    return { ...row, status: 'pending', line: 'Waiting' };
}

/** Verify Installation: recording what went in, then what the check found. */
function verifyStep(plan: RunPlan, tick: number, ended: boolean): ImportStep {
    const row = { kind: 'verify', label: 'Verify Installation' };
    if (plan.ending === 'stopped' && ended) return { ...row, status: 'pending', line: 'Not run' };
    const at = endTick(plan) - 1;
    if (tick < at) return { ...row, status: 'pending', line: 'Waiting' };
    if (!ended) return { ...row, status: 'checking', line: 'Recording installed items' };
    const products = plan.pack.types.find((t) => t.code === 'products')?.count ?? 0;
    if (plan.ending === 'warning') {
        return { ...row, status: 'warning', problem: { text: `${VERIFY_DIFFER} of ${digits(products)} products differ from the datapack`, failed: false } };
    }
    return { ...row, status: 'success', line: `${digits(products)} products match the datapack` };
}

/** The run's steps at `tick`: only those that apply, in the order they run. */
export function runSteps(plan: RunPlan, tick: number): ImportStep[] {
    const ended = tick >= endTick(plan);
    const steps: ImportStep[] = [];
    let unit = 0;
    if (plan.saves) {
        const to = plan.replaces ?? DEMO_PACK;
        steps.push(unitStep('save', 'Save Your Changes', tick - unit, `Saving to ${to}`, `Saved to ${to}`));
        unit += 1;
    }
    if (plan.replaces) {
        steps.push(unitStep('replace', `Uninstall ${plan.replaces}`, tick - unit, 'Uninstalling from Commerce', 'Uninstalled'));
    }
    const install = typesStep(plan, tick, ended, { kind: 'install', label: `Install ${plan.pack.name}`, done: 'Installed' });
    return [...steps, install, verifyStep(plan, tick, ended)];
}
