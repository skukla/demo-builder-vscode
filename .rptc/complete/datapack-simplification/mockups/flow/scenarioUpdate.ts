/**
 * J9's data: what the newer Luma changed against the copy this demo installed, and the update run as
 * steps at any moment of it. Luma is a Demo Builder datapack; the owner updated it in the library,
 * and the demo still holds the older copy plus some of the SC's own edits (decisions, "Back on track
 * (owner, 2026-11-14)": Update writes only what the datapack changed and keeps the SC's edits).
 *
 * Only types that changed are listed (rule 7). A type's row counts what the update writes, bare
 * verbs ("3 updated", "12 added, 36 updated"; rule 5). Records the SC edited, which the update leaves
 * alone, are each type's `keptRecords`: shown as Clear's spot check shows kept records (J1-3b: the
 * notice dot after the count, a Kept tab), never as a line (rule 6).
 */

import type { ImportStep } from '@/features/data-installer/importSteps';
import { dataTypeLabel } from '@/features/data-installer/ui/dataTypeLabel';
import type { TypeOutcome } from './scenarioClear';
import { LUMA_PACK, PACKS, endTick, typesStep, unitStep, type Pack, type RunPlan } from './scenarioInstall';

/**
 * The panel's "Flyout state (J9)": Luma with a newer version in the library (and your edits), the
 * same with every change already in Commerce (J9-4), Luma with your edits, My Luma with nothing
 * unsaved, My Luma with unsaved edits.
 */
export type J9State = 'luma-newer' | 'luma-applied' | 'luma-edits' | 'my-clean' | 'my-edits';

/** One type the newer Luma changed. */
export interface LumaChange {
    code: string;
    /** What the update writes, as the row says it. */
    happens: string;
    /** How many records it writes. */
    count: number;
    /** A few of them by name, for the spot check; the rest are numbered. */
    examples: string[];
    /** Records of this type the SC edited since installing: the update leaves them as they are. */
    kept: string[];
}

/** The newer Luma's changes, in the order an install writes the types. */
export const LUMA_CHANGES: LumaChange[] = [
    { code: 'product_attributes', happens: '3 updated', count: 3, examples: ['Activity', 'Material', 'Strap/Handle'], kept: ['Climate'] },
    { code: 'categories', happens: '2 added', count: 2, examples: ['Trail Running', 'Recovery'], kept: [] },
    {
        code: 'products',
        happens: '12 added, 36 updated',
        count: 48,
        examples: ['Aero Trail Shoe', 'Summit Shell Jacket', 'Ridge Running Tee'],
        kept: ['Argus All-Weather Tank', 'Breathe-Easy Tank', 'Juno Jacket', 'Proteus Fitness Jackshirt'],
    },
    { code: 'cart_rules', happens: '1 updated', count: 1, examples: ['Spring Sale'], kept: [] },
];

/** Every changed type's code: what the check finds while nothing has been applied. */
export const ALL_CHANGED: readonly string[] = LUMA_CHANGES.map((c) => c.code);

/** The changes still to apply, as the check finds them. */
export const changesLeft = (left: readonly string[]): LumaChange[] => LUMA_CHANGES.filter((c) => left.includes(c.code));

/** The summary's rows (rule 8), with the kept records the spot check shows behind the dot. */
export function updateRows(changes: readonly LumaChange[]): TypeOutcome[] {
    return changes.map((c) => ({
        type: dataTypeLabel(c.code),
        happens: c.happens,
        examples: c.examples,
        more: c.count - c.examples.length,
        keptRecords: c.kept.map((name) => ({ name })),
    }));
}

/** The update's run: the chosen types as one Update Luma step, then Verify Installation. */
export interface UpdateRun {
    running: string;
    done: string;
    last: number;
    steps: (tick: number) => ImportStep[];
}

/** The datapack the run writes: only the chosen types, each counted by what the update writes. */
function chosenPack(codes: readonly string[]): Pack {
    const types = changesLeft(codes).map((c) => ({ code: c.code, count: c.count, change: c.happens }));
    return { ...PACKS[LUMA_PACK], types };
}

/**
 * The run's words. The plan names none: "Updating Luma" and "Luma Updated" are the prototype's, in
 * the form of "Installing Bodea" and "Bodea Installed" (rule 21: the thing first).
 */
export function updateRun(codes: readonly string[]): UpdateRun {
    const plan: RunPlan = { pack: chosenPack(codes), saves: false, ending: 'clean' };
    const last = endTick(plan);
    const verifyAt = plan.pack.types.length;
    return {
        running: `Updating ${LUMA_PACK}`,
        done: `${LUMA_PACK} Updated`,
        last,
        steps: (tick) => {
            const ended = tick >= last;
            const update = typesStep(plan, tick, ended, { kind: 'install', label: `Update ${LUMA_PACK}`, done: 'Updated' });
            const verify = unitStep('verify', 'Verify Installation', ended ? 1 : tick - verifyAt, 'Recording installed items', 'Matches the datapack');
            return [update, verify];
        },
    };
}

/** The longest run (every type chosen), for the self-check's wait. */
export const UPDATE_LONGEST = updateRun(ALL_CHANGED).last;
