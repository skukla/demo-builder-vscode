/**
 * J5's data: the uninstall run as steps at any moment of it. Overview.md Phase 4: "Uninstall uses
 * ImportRunView with the steps that apply (Save Your Changes, Uninstall)". The save row is J2's
 * (`runSteps`' "Save Your Changes"), the uninstall row is the replace's first step under the
 * datapack's own name, so the same job reads the same in both runs.
 */

import type { ImportStep } from '@/features/data-installer/importSteps';
import { DEMO_PACK, STOP_REASON, unitStep, type PackName } from './scenarioInstall';
import { OWN_PACKS } from './scenarioSave';

/** How the uninstall ends, as the panel's "Uninstall ends (J5)" select picks it. */
export type UninstallEnding = 'succeeds' | 'fails';

/** One uninstall run: whether it saves the SC's changes first, and how it ends. */
export interface UninstallPlan {
    saves: boolean;
    ending: UninstallEnding;
}

/**
 * How many ticks the uninstall row works for: long enough at the panel's pace to press Run in
 * Background while it runs (J5-3, J5-4).
 */
const UNINSTALL_TICKS = 8;

/** The tick the run ends at: after the save, if any, and the uninstall. */
export const uninstallEnd = (plan: UninstallPlan): number => (plan.saves ? 1 : 0) + UNINSTALL_TICKS;

/** The longest run, for the self-check's wait: one that saves first. */
export const UNINSTALL_LONGEST = uninstallEnd({ saves: true, ending: 'succeeds' });

/** The uninstall row's state from its tick within the run: waiting, working, done. */
const uninstallState = (at: number): number => {
    if (at < 0) return -1;
    return at < UNINSTALL_TICKS ? 0 : 1;
};

/** The run's steps at `tick`: the save when saving first, then the uninstall. */
export function uninstallSteps(plan: UninstallPlan, tick: number, pack: PackName = DEMO_PACK): ImportStep[] {
    const steps: ImportStep[] = [];
    const first = plan.saves ? 1 : 0;
    // Someone else's datapack saves into a new one of the SC's, "My <Pack>" (J3-1).
    const into = OWN_PACKS.includes(pack) ? pack : `My ${pack}`;
    if (plan.saves) steps.push(unitStep('save', 'Save Your Changes', tick, `Saving to ${into}`, `Saved to ${into}`));
    const label = `Uninstall ${pack}`;
    if (plan.ending === 'fails' && tick >= uninstallEnd(plan)) {
        // A problem sits on its row as one line (rule 15): J2's stopped reason, word for word.
        steps.push({ kind: 'uninstall', label, status: 'error', problem: { text: STOP_REASON, failed: true } });
        return steps;
    }
    steps.push(unitStep('uninstall', label, uninstallState(tick - first), 'Uninstalling from Commerce', 'Uninstalled'));
    return steps;
}
