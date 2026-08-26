/**
 * The transcript — what the agent did, read as a conversation.
 *
 * ONE renderer, two surfaces. A workbench run and the window's ambient trace ask
 * different questions and carry different fields, but the middle of both is the
 * same thing: a sequence of tool calls that should read as plain English phases
 * rather than a numbered list of tool names. Rendering that twice is how the two
 * views would drift, which is why the bands live here and not inside whichever
 * view needed them first.
 *
 * Three files, three jobs: `transcriptPhases.ts` decides the grouping and the
 * words (pure, testable without a panel), this file is the markup, and
 * `workbench.css` is the look. The look is a SEPARATE concern here because the
 * first pass at step 10 did the first two and skipped the third — the surface
 * came out structurally right and visually flat, which is what the owner saw.
 *
 * WHAT THE AMBIENT VIEW MUST NOT GROW. `AgentTraceView` renders the same bands
 * and no speaker turns, because the extension does not own the chat's process:
 * there is no assistant text for it and no cost. {@link SpeakerTurn} is
 * deliberately a separate export that the ambient view never calls, so the two
 * cannot quietly converge into one surface implying we know more than we do.
 *
 * ## What was reused rather than rebuilt
 *
 * - The collapsible is Spectrum's `Disclosure`, which this surface already used
 *   for its "Show every step" list. No new expander.
 * - The status glyphs are the wizard's own vocabulary — `CheckmarkCircle` /
 *   `AlertCircle` — the same set `StatusSection` draws.
 * - `StatusSection` itself was considered and rejected: it is a wizard SUMMARY
 *   ROW (label, value, status) with no children slot, so it cannot be a band
 *   that opens. `StatusCard`/`StatusDot` are dashboard status badges with a
 *   colour vocabulary, which is a different job again.
 *
 * @module features/ai/evaluation/ui/Transcript
 */

import { Disclosure, DisclosurePanel, DisclosureTitle } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import Cancel from '@spectrum-icons/workflow/Cancel';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import {
    describeStep,
    formatSpan,
    groupIntoPhases,
    phaseStatus,
    stepCount,
    type PhaseIcon,
    type TranscriptStep,
} from '../transcriptPhases';
import './workbench.css';

/**
 * The glyph for a phase's state.
 *
 * A helper rather than a nested ternary — the SOP forbids those and a scan
 * enforces it. `Cancel` for a simulated phase, deliberately: a checkmark would
 * claim work happened and an alert would claim something broke, and neither is
 * true of a call the dry run stopped. It always sits beside the words
 * "simulated — nothing changed", which carry the meaning.
 */
function PhaseGlyph({ icon }: { icon: PhaseIcon }): React.JSX.Element {
    if (icon === 'failed') return <AlertCircle size="S" UNSAFE_className="text-red-600" />;
    if (icon === 'simulated') return <Cancel size="S" UNSAFE_className="text-gray-700" />;
    return <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />;
}

/** The band's rule colour and its note colour both key off the state. */
const PHASE_MODIFIER: Record<PhaseIcon, string> = {
    done: '',
    failed: ' wb-phase-failed',
    simulated: ' wb-phase-simulated',
};

const NOTE_MODIFIER: Record<PhaseIcon, string> = {
    done: '',
    failed: ' wb-phase-note-failed',
    simulated: ' wb-phase-note-simulated',
};

export interface TranscriptPhasesProps {
    /** The trace, oldest first. */
    steps: readonly TranscriptStep[];
    /** Test hook for the container. */
    testId?: string;
}

/**
 * The trace as expandable phase bands.
 *
 * Collapsed, a band says what the phase was, how many calls it took, how long it
 * ran, and — crucially, without being expanded — whether anything failed or was
 * simulated. That last part is the point: "did something go wrong" is what a
 * producer scans for, and finding out by opening eleven bands is not scanning.
 * The rule down the left is what makes the boundary between two phases findable
 * while scrolling; see `workbench.css`.
 */
export function TranscriptPhases({ steps, testId }: TranscriptPhasesProps): React.JSX.Element {
    const phases = groupIntoPhases(steps);

    if (phases.length === 0) {
        // Not an error and not an empty state — a real and informative answer.
        // It means the agent worked it out without asking Demo Builder anything.
        return (
            <div className="wb-phases" data-testid={testId}>
                <span className="wb-step-label" data-testid="transcript-no-steps">
                    It did not use any Demo Builder tools.
                </span>
            </div>
        );
    }

    return (
        <div className="wb-phases" data-testid={testId}>
            {phases.map((phase, i) => {
                const status = phaseStatus(phase);
                return (
                    <div
                        className={`wb-phase${PHASE_MODIFIER[status.icon]}`}
                        key={`${phase.tool}-${phase.startedAt}-${i}`}
                    >
                        <Disclosure>
                            <DisclosureTitle>
                                <span className="wb-phase-band" data-testid="transcript-phase">
                                    <PhaseGlyph icon={status.icon} />
                                    <span className="wb-phase-label">{phase.label}</span>
                                    <span className="wb-phase-meta">
                                        <span>{stepCount(phase.steps.length)}</span>
                                        <span>{formatSpan(phase.elapsedMs)}</span>
                                        {status.note && (
                                            <span className={NOTE_MODIFIER[status.icon].trim()}>
                                                {status.note}
                                            </span>
                                        )}
                                    </span>
                                </span>
                            </DisclosureTitle>
                            <DisclosurePanel>
                                <TranscriptSteps steps={phase.steps} />
                            </DisclosurePanel>
                        </Disclosure>
                    </div>
                );
            })}
        </div>
    );
}

export interface TranscriptStepsProps {
    /** The calls to list, in order. */
    steps: readonly TranscriptStep[];
    /** Test hook for the container. */
    testId?: string;
}

/**
 * A flat list of calls, each in plain English with its identifiers behind it.
 *
 * Used inside an expanded phase, and on its own for the ambient view's short
 * "what stood out" list — those are picked across the whole window and are
 * deliberately not in one run of consecutive calls, so they are not phases and
 * must not be drawn as any.
 */
export function TranscriptSteps({ steps, testId }: TranscriptStepsProps): React.JSX.Element {
    return (
        <div className="wb-steps" data-testid={testId}>
            {steps.map((step, i) => {
                const view = describeStep(step);
                return (
                    <div
                        key={`${step.tool}-${step.at}-${i}`}
                        className="wb-step"
                        data-testid="transcript-step"
                    >
                        <span className="wb-step-label">{view.label}</span>
                        <span className="wb-step-outcome">{view.outcome}</span>
                        {/* The raw tool name lives here and nowhere else — the
                            reader who opened a phase is the one who asked. */}
                        <span className="wb-step-detail">{view.detail}</span>
                    </div>
                );
            })}
        </div>
    );
}

export interface SpeakerTurnProps {
    /** Who is speaking — "You" or "Claude". */
    who: string;
    /** What they said, verbatim. */
    children: React.ReactNode;
    /** True for the producer's own words, which get the tint and the rule. */
    isYou?: boolean;
    /** Test hook for the block. */
    testId?: string;
}

/**
 * One side of the conversation.
 *
 * Only the workbench renders these. The ambient view has tool calls and nothing
 * else — see the file note.
 */
export function SpeakerTurn({
    who,
    children,
    isYou = false,
    testId,
}: SpeakerTurnProps): React.JSX.Element {
    return (
        <div className={`wb-turn${isYou ? ' wb-turn-you' : ''}`} data-testid={testId}>
            <span className="wb-turn-who">{who}</span>
            <div className="wb-turn-body">{children}</div>
        </div>
    );
}
