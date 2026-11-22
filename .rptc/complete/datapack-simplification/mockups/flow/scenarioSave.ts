/**
 * J3's data: what My Luma will hold after Save Changes, what the store has for Create Datapack's
 * picker, and the three runs (save, create, undo) as steps at any moment. The save and create runs
 * are Install's types step (`typesStep`) under another verb; Undo Last Save runs Install's own steps
 * over My Luma (overview.md Phase 2: "the same steps window (Uninstall, Install, Verify)").
 */

import type { ImportStep } from '@/features/data-installer/importSteps';
import { dataTypeLabel } from '@/features/data-installer/ui/dataTypeLabel';
import { DEMO_PACK, OTHER_PACK, PACKS, endTick, installRows, runSteps, typesStep, unitStep, type Pack, type PackName, type PackType, type RunPlan } from './scenarioInstall';
import type { TypeOutcome } from './scenarioClear';

/** Which save J3-1 shows, as the panel's "Save (J3-1)" select picks it. */
export type SaveVariant = 'save' | 'as-new' | 'as-new-other';

/** The SC's own datapacks: Save As New refuses their names. Bodea is someone else's. */
export const OWN_PACKS: readonly string[] = [DEMO_PACK];

/** Which datapack the demo uses for each J3-1 variant. */
export const SAVE_DEMO: Record<SaveVariant, PackName> = { save: DEMO_PACK, 'as-new': DEMO_PACK, 'as-new-other': OTHER_PACK };

/** The types the SC changed since the last save, and how many of each. */
const CHANGED: Readonly<Record<string, number>> = { products: 4, categories: 1 };

const digits = (n: number): string => n.toLocaleString('en-US');

/**
 * What the datapack will hold after the save, by type: the bare count, with what changed only where
 * something did ("2,046, 4 changed"; prototype-conventions.md rule 5: a verb only when it says
 * something new).
 */
export function saveRows(pack: Pack): TypeOutcome[] {
    return installRows(pack).map((row, i) => {
        const code = pack.types[i]?.code ?? '';
        const changed = CHANGED[code];
        return changed ? { ...row, happens: `${row.happens}, ${digits(changed)} changed` } : row;
    });
}

/** One kind of the store, for Create Datapack's picker: its items by name. */
export interface StoreKind {
    code: string;
    items: string[];
}

/** A few real-looking names per kind; the rest numbered, as the spot check does. */
const NAMED: Readonly<Record<string, string[]>> = {
    products: ['Aero Daily Fitness Tee', 'Antonia Racer Tank', 'Breathe-Easy Tank', 'Circe Hooded Ice Fleece'],
    categories: ['Women', 'Men', 'Gear', 'Training', 'Sale'],
    cart_rules: ['Spend $50, Save $5', 'Free Shipping Over $100', 'Buy 3 Tees, Get 1 Free'],
    customers: ['Veronica Costello', 'Roni Cost', 'Jane Smith'],
    customer_groups: ['Wholesale', 'Retailer', 'VIP', 'Staff'],
};

const STORE_COUNTS: ReadonlyArray<[string, number]> = [
    ['products', 48],
    ['categories', 12],
    ['cart_rules', 3],
    ['customers', 10],
    ['customer_groups', 4],
    ['product_attributes', 18],
    ['attribute_sets', 3],
];

/** Everything in the project's store, by kind, in the pick list's order (`PICKABLE_KINDS`). */
export const STORE: StoreKind[] = STORE_COUNTS.map(([code, count]) => {
    const named = (NAMED[code] ?? []).slice(0, count);
    const noun = dataTypeLabel(code).replace(/ies$/u, 'y').replace(/s$/u, '');
    const made = Array.from({ length: count - named.length }, (_, i) => `${noun} ${named.length + i + 1}`);
    return { code, items: [...named, ...made] };
});

/** Every item ticked: Create Datapack's picker starts with everything (Phase 7b). */
export const allPicked = (): Record<string, string[]> => Object.fromEntries(STORE.map((k) => [k.code, [...k.items]]));

/** A run over data types under one verb: the save, the save as new, or the create. */
export interface TypesRun {
    plan: RunPlan;
    /** The second step's label, working line and done word: "Save My Luma" / "Saving" / "Saved". */
    label: string;
    working: string;
    done: string;
}

/** The pack a run writes, under the run's own types (a create holds only what was ticked). */
function packWith(types: PackType[]): Pack {
    return { ...PACKS[DEMO_PACK], types };
}

/** Save Changes or Save As New: everything the demo has, into the datapack named. */
export function saveRun(pack: Pack, name: string): TypesRun {
    return { plan: { pack: packWith(pack.types), saves: false, ending: 'clean' }, label: `Save ${name}`, working: 'Saving', done: 'Saved' };
}

/** Create Datapack: the ticked items, by kind, into a new datapack. */
export function createRun(name: string, picked: Record<string, string[]>): TypesRun {
    const types = STORE.map((k) => ({ code: k.code, count: picked[k.code]?.length ?? 0, change: '' })).filter((t) => t.count > 0);
    return { plan: { pack: packWith(types), saves: false, ending: 'clean' }, label: `Create ${name}`, working: 'Creating', done: 'Created' };
}

/** The tick a types run ends at: one per data type, then the write. */
export const typesEnd = (run: TypesRun): number => run.plan.pack.types.length + 1;

/**
 * The run's two steps at `tick`, as the engine does them (`saveStore.ts`): Export from Commerce, with
 * the data types under it, then the write into My Datapacks as one row (owner, 2026-11-12, J3-1).
 */
export function typesRunSteps(run: TypesRun, tick: number): ImportStep[] {
    const types = run.plan.pack.types.length;
    const exported = typesStep(run.plan, tick, tick >= types, { kind: 'export', label: 'Export from Commerce', done: 'Exported', save: true });
    return [exported, unitStep('save', run.label, tick - types, run.working, run.done)];
}

/** Undo Last Save: Commerce follows, through Install's own steps over My Luma (Phase 2). */
export const UNDO_PLAN: RunPlan = { pack: PACKS[DEMO_PACK], replaces: DEMO_PACK, saves: false, ending: 'clean' };
export const undoEnd = (): number => endTick(UNDO_PLAN);
export const undoSteps = (tick: number): ImportStep[] => runSteps(UNDO_PLAN, tick);

/** What Commerce holds when J4's Restore My Luma is pressed, as the panel's "Commerce (J4)" select picks it. */
export type RestoreCommerce = 'edits' | 'newer' | 'matches';
