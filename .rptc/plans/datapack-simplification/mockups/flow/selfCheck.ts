/**
 * The prototype's self-check: opens every built step in turn, waits for its window to settle, and
 * reads the panel's measurement of it (`window.__J1_LAST__`, sampled every 50ms by proto-j1.html,
 * and `window.__J1_SEEN__`, every earlier window the step showed: J2's run is followed by a new
 * small result, and both are judged): whether a window's height changed once on screen, and
 * whether anything in it scrolled. The
 * owner's rules are that a window never grows once shown and nothing scrolls for ordinary content
 * (2026-11-11). Runs in the page, so it needs no browser driver; the results go to the panel and to
 * `window.__CHECK__` for an agent to read.
 */

import type { BuiltStep, StepWindow } from './reviewSteps';
import { undoEnd } from './scenarioSave';
import { UNINSTALL_LONGEST } from './scenarioUninstall';

/** The panel's measurement of the window on screen (proto-j1.html). */
interface Measure {
    label: string;
    first: number | null;
    last: number | null;
    changes: string[];
    scrolls: boolean;
    /** The room between the last thing drawn and the buttons (rules 12 and 14: should be small). */
    empty: number;
}

export interface CheckResult {
    id: string;
    title: string;
    /** No window to measure (a step that only shows the screen). */
    skipped: boolean;
    opened?: number;
    final?: number;
    changes: string[];
    scrolls: boolean;
    /** How many windows the step showed (a run, then its small result, is two). */
    windows?: number;
    /** Each window's label, height and empty room above its buttons: "Install: form 412px, 18px empty". */
    sizes?: string[];
    ok: boolean;
}

declare global {
    interface Window {
        __J1_LAST__?: Measure;
        __J1_SEEN__?: Measure[];
        __CHECK__?: CheckResult[];
    }
}

/** How long a clean result shows before it closes itself. */
const GLANCE_MS = 1500;

/** A step's run length in units of the panel's Run pace, and any result that closes itself. */
const RUN_UNITS: Partial<Record<StepWindow, number>> = {
    'project-result': 11,
    'install-run': 12,
    'restore-run': undoEnd(),
    'uninstall-run': UNINSTALL_LONGEST,
    'background-success': UNINSTALL_LONGEST,
    'background-failure': UNINSTALL_LONGEST,
};
const GLANCE: Partial<Record<StepWindow, number>> = {
    'install-run': GLANCE_MS,
    'restore-same': GLANCE_MS,
    'restore-run': GLANCE_MS,
    'uninstall-run': GLANCE_MS,
    'background-success': GLANCE_MS,
};

/** Steps that show the screen only, with no window to measure (J4-1: the amber dot on a card; J6's card, flyout and dashboard; J8's screen). */
const NO_WINDOW: readonly StepWindow[] = ['none', 'restore-dot', 'failed-card', 'failed-flyout', 'failed-dashboard', 'header', 'card-tags', 'flyout-menu'];

/** How long a step takes to settle: its reads, its check, and a run's steps at the panel's pace. */
function settleMs(step: BuiltStep, readMs: number, checkMs: number): number {
    const run = (RUN_UNITS[step.window] ?? 0) * window.__J1__.paceMs();
    return readMs + checkMs + run + (GLANCE[step.window] ?? 0) + 900;
}

/** Every window the step showed, in order: the ones it replaced, then the one on screen. */
function measured(): Measure[] {
    const last = window.__J1_LAST__;
    const seen = window.__J1_SEEN__ ?? [];
    return last && !seen.includes(last) ? [...seen, last] : seen;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens each step with `open`, waits, and reads what the panel measured. */
export async function checkSteps(steps: BuiltStep[], open: (step: BuiltStep) => void, timing: { readMs: number; checkMs: number }): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    // A font arriving mid-run moves text by a few pixels: the first run after a page load once
    // reported a 3px growth that no later run or hand test could reproduce (2026-11-11).
    await document.fonts.ready;
    for (const step of steps) {
        if (NO_WINDOW.includes(step.window)) {
            results.push({ id: step.id, title: step.title, skipped: true, changes: [], scrolls: false, ok: true });
            continue;
        }
        window.__J1__.reset();
        open(step);
        await sleep(settleMs(step, timing.readMs, timing.checkMs));
        const all = measured().filter((w) => w.first !== null);
        const m = all[all.length - 1];
        const named = all.length > 1;
        const changes = all.flatMap((w) => w.changes.map((c) => (named ? `${w.label} ${c}` : c)));
        const scrolls = all.some((w) => w.scrolls);
        results.push({
            id: step.id,
            title: step.title,
            skipped: false,
            opened: m?.first ?? undefined,
            final: m?.last ?? undefined,
            changes,
            scrolls,
            windows: all.length,
            sizes: all.map((w) => `${w.label} ${w.last ?? 0}px, ${w.empty}px empty`),
            ok: Boolean(m) && changes.length === 0 && !scrolls,
        });
    }
    window.__CHECK__ = results;
    return results;
}

/** One line per step for the panel: "J1-2 The Summary: 560px, steady". */
export function resultLine(r: CheckResult): string {
    if (r.skipped) return `${r.id} ${r.title}: no window`;
    if (r.opened === undefined) return `${r.id} ${r.title}: NOT MEASURED`;
    const problems = [r.changes.length ? `GREW ${r.changes.join(', ')}` : '', r.scrolls ? 'SCROLLS' : ''].filter(Boolean);
    const sizes = r.sizes?.length ? ` [${r.sizes.join('; ')}]` : '';
    return `${r.id} ${r.title}: ${problems.length ? problems.join(', ') : 'steady'}${sizes}`;
}
