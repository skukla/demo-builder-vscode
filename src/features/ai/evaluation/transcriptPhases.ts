/**
 * The trace, folded into phases a person can read.
 *
 * WHY THIS EXISTS. Both evaluation surfaces rendered the trace as a numbered
 * list of RAW TOOL NAMES — `1. get_current_project — 5ms` — while
 * `toolNarration.ts` held 103 authored plain-English phrases for exactly those
 * tools and neither view imported it. The phrases were written for the chat and
 * never brought into the panel. This module is the bridge, and it is pure so the
 * grouping rules can be tested without a panel, a socket or React.
 *
 * ## Phases, not steps
 *
 * A run of eleven calls rendered one line each is a log. Rendered as three
 * bands — "Reading the project · 2 steps · 1s" — it is a story, and the
 * individual calls are still there on expand. The shape is borrowed from
 * `tech-case-studio`'s `transcript-groups.ts`, whose own docstring records the
 * failure to avoid: a grouping rule so loose that a long turn collapsed into "a
 * couple of opaque 'N steps' blobs, and the label often described none of what
 * was inside".
 *
 * **A phase is a run of consecutive calls to the SAME tool.** That is the
 * strictest useful rule, and it is chosen because it makes the label
 * unimpeachable: every call in the phase is the call the phrase describes.
 * `narrationFor('check_mesh')` gives "Checking the API mesh", which is right for
 * one such call and equally right for four of them.
 *
 * The looser alternative — grouping by CATEGORY, so a read of the project and a
 * read of the mesh share one band — needs a second vocabulary of phase-level
 * labels that nobody has authored, and the reference's docstring is a warning
 * about exactly that gap. It can come later if same-tool grouping proves too
 * thin in practice. Nothing here has to change for it: the label is one function.
 *
 * ## No phrase invented from a tool name, ever
 *
 * `toolNarration.ts` refuses to derive a phrase from a tool's name, and says why
 * at length: deriving is the defect it exists to remove. This module honours
 * that. A tool with no authored phrase gets {@link UNNAMED_PHASE}, a visibly
 * generic stand-in, and its raw name appears only in the expanded detail where
 * the reader asked for it. `toolNarration.test.ts` asserts every registered tool
 * has a phrase, so the stand-in is defensive rather than expected.
 *
 * @module features/ai/evaluation/transcriptPhases
 */

import { narrationFor } from '../server/toolNarration';

/**
 * The least a call has to carry to be rendered.
 *
 * Deliberately narrower than either caller's type. `EvaluationTraceStep` (a
 * workbench run) and `AgentTraceRow` (the window's ambient trace) are different
 * shapes for different questions, and forcing them into one would mean giving
 * the ambient view fields it has no honest values for. Both are structurally
 * assignable to this, so neither needs a mapping step.
 */
export interface TranscriptStep {
    /** MCP tool name. Shown only in the expanded detail. */
    tool: string;
    outcome: 'ok' | 'error' | 'blocked-by-dry-run';
    durationMs: number;
    /** Milliseconds since the recorder started. */
    at: number;
    /** Argument NAMES, never values — the recorder keeps no values by design. */
    argumentKeys?: string[];
    /**
     * Why this call is worth looking at, when the ambient trace marked it.
     *
     * `failed` and `blocked` restate the outcome; `repeated` and `slow` are
     * facts the outcome cannot carry, and they are the ENTIRE reason a call
     * appears in the "what stood out" list. A step row that dropped them would
     * present a short list of ordinary-looking calls with no explanation of why
     * they were singled out.
     */
    flag?: 'failed' | 'blocked' | 'repeated' | 'slow';
}

/** A run of consecutive calls to one tool, as a band the reader can expand. */
export interface TranscriptPhase {
    /** The authored phrase for the tool this phase ran. */
    label: string;
    /** The MCP tool name every step in this phase shares. */
    tool: string;
    /** The calls inside, in the order they happened. */
    steps: TranscriptStep[];
    /** Where the phase begins, ms since the recorder started. */
    startedAt: number;
    /** First call's start to last call's end. */
    elapsedMs: number;
    /** How many calls in this phase failed. */
    failed: number;
    /** How many the dry run stopped, so nothing they would have changed changed. */
    simulated: number;
}

/**
 * What a phase is called when its tool has no authored phrase.
 *
 * Visibly generic on purpose. The alternatives are both worse: a phrase built
 * from the tool name is the invention `toolNarration.ts` exists to prevent, and
 * the raw name is the defect this module was written to fix.
 */
export const UNNAMED_PHASE = 'Working';

/**
 * The phrase for a tool, or the generic stand-in.
 *
 * @param tool - MCP tool name
 * @returns plain-English words for what the tool does
 */
export function phraseFor(tool: string): string {
    return narrationFor(tool) ?? UNNAMED_PHASE;
}

/**
 * Fold consecutive calls to one tool into a single phase.
 *
 * @param steps - the trace, oldest first
 * @returns one band per run of same-tool calls, in the same order
 */
export function groupIntoPhases(steps: readonly TranscriptStep[]): TranscriptPhase[] {
    const phases: TranscriptPhase[] = [];
    for (const step of steps) {
        const open = phases[phases.length - 1];
        if (open && open.tool === step.tool) {
            open.steps.push(step);
        } else {
            phases.push({
                label: phraseFor(step.tool),
                tool: step.tool,
                steps: [step],
                startedAt: step.at,
                elapsedMs: 0,
                failed: 0,
                simulated: 0,
            });
        }
    }
    for (const phase of phases) {
        summarise(phase);
    }
    return phases;
}

/**
 * Fill in a finished phase's counts and span.
 *
 * The span runs from the first call's START to the last call's END, so a phase
 * of four 200ms calls reads as the second of waiting it was, not as 200ms.
 */
function summarise(phase: TranscriptPhase): void {
    const last = phase.steps[phase.steps.length - 1];
    phase.elapsedMs = Math.max(0, last.at + last.durationMs - phase.startedAt);
    phase.failed = phase.steps.filter((s) => s.outcome === 'error').length;
    phase.simulated = phase.steps.filter((s) => s.outcome === 'blocked-by-dry-run').length;
}

/**
 * A short, human span — "5ms", "1.4s", "41s", "2m 5s".
 *
 * NOT `core/utils/timeFormatting.formatDuration`, and the difference is
 * deliberate rather than an oversight. That one is the LOGGING formatter: it has
 * thirty call sites, all of them log lines, and its test pins whole seconds as
 * "59.0s". A trailing ".0" is fine in a debug channel and wrong on a surface
 * whose whole complaint was that it read like a log. Merging them would mean
 * changing thirty log lines to fix one panel.
 *
 * @param ms - a duration
 * @returns the span in the fewest characters that stay honest
 */
export function formatSpan(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = ms / 1000;
    if (seconds < 10) return `${seconds.toFixed(1)}s`;
    const whole = Math.round(seconds);
    if (whole < 60) return `${whole}s`;
    const minutes = Math.floor(whole / 60);
    const rest = whole % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

/** "2 steps", "1 step" — the count as the band says it. */
export function stepCount(n: number): string {
    return n === 1 ? '1 step' : `${n} steps`;
}

/**
 * Which glyph a band shows — named, not drawn.
 *
 * The name rather than the icon keeps this module free of React, which is what
 * lets the grouping rules be tested without a panel.
 */
export type PhaseIcon = 'done' | 'failed' | 'simulated';

/** How a phase's band reads at a glance, without being expanded. */
export interface PhaseStatus {
    icon: PhaseIcon;
    /**
     * What the band says beyond the counts, when there is something to say.
     *
     * A failed or simulated phase must be readable WITHOUT expanding it — the
     * plan pins both, because "did anything go wrong" is the question a producer
     * scans for and expanding eleven bands to find out is not scanning.
     */
    note?: string;
}

/**
 * Whether a phase failed, was simulated, or simply finished.
 *
 * A helper rather than a nested ternary — the SOP forbids those and a scan
 * enforces it. Failure outranks simulation: a call that errored is the one thing
 * a producer has to act on, and a phase can be both.
 */
export function phaseStatus(phase: TranscriptPhase): PhaseStatus {
    if (phase.failed > 0) {
        return {
            icon: 'failed',
            note: phase.failed === phase.steps.length ? 'failed' : `${phase.failed} failed`,
        };
    }
    if (phase.simulated > 0) {
        return { icon: 'simulated', note: 'simulated — nothing changed' };
    }
    return { icon: 'done' };
}

/** One call, in the words the expanded detail uses. */
export interface StepView {
    /** The authored phrase for this call's tool. */
    label: string;
    /** What happened — simulated, failed, or how long it took. */
    outcome: string;
    /**
     * The tool's own name and the arguments it was given, for the reader who
     * asked. Argument NAMES only: the recorder keeps a one-way hash of the
     * values precisely so it never holds anything readable.
     */
    detail: string;
}

/**
 * One call, ready to render.
 *
 * @param step - a recorded call
 * @returns its phrase, its outcome, and the identifiers behind both
 */
export function describeStep(step: TranscriptStep): StepView {
    const keys = step.argumentKeys ?? [];
    const note = flagNote(step);
    return {
        label: phraseFor(step.tool),
        outcome: note ? `${stepOutcome(step)} · ${note}` : stepOutcome(step),
        detail: keys.length > 0 ? `${step.tool} · ${keys.join(', ')}` : step.tool,
    };
}

/**
 * What a flag adds beyond the outcome, if anything.
 *
 * `failed` and `blocked` say nothing the outcome has not already said, so they
 * are silent here rather than doubled. A helper rather than a nested ternary —
 * the SOP forbids those and a scan enforces it.
 */
function flagNote(step: TranscriptStep): string | undefined {
    if (step.flag === 'repeated') return 'asked again';
    if (step.flag === 'slow') return 'slow';
    return undefined;
}

/**
 * What one call's outcome reads as.
 *
 * A helper rather than a nested ternary, same reason as {@link phaseStatus}.
 */
function stepOutcome(step: TranscriptStep): string {
    if (step.outcome === 'blocked-by-dry-run') return 'simulated — nothing changed';
    if (step.outcome === 'error') return 'failed';
    return formatSpan(step.durationMs);
}
