/**
 * What the run would have done — read as a conversation, not a log.
 *
 * WHAT CHANGED, AND WHY. This view used to render the trace as a numbered list
 * of raw tool names (`1. get_current_project — 5ms`) under a grey verdict box,
 * while `toolNarration.ts` held 103 authored plain-English phrases for exactly
 * those tools and nothing imported them. The owner used it and said so. It now
 * reads top to bottom the way a chat does:
 *
 *     You      — the prompt as it was run
 *     phases   — what it did, in plain English, expandable
 *     Claude   — what it would have told you
 *     ─────    — the numbers, once, at the end
 *
 * The ORDER is the argument. A producer reads what they asked, what happened,
 * and what they would have been told; the measurement comes last because it is
 * the thing they check rather than the thing they read.
 *
 * WHAT SURVIVED. The waste, what was blocked, the suggestions with their
 * evidence, and the way back to the cheapest version are all still here and
 * still ranked ahead of the raw trace — they answer "could this prompt be
 * better", which is the question the feature exists for. Only the rendering of
 * the trace changed.
 */

import { Button, Text, View } from '@adobe/react-spectrum';
import React from 'react';
import { SpeakerTurn, TranscriptPhases } from './Transcript';
import './workbench.css';
import type { EvaluationSuggestion, EvaluatePromptResponse } from '@/types/webviewRequests';

type Verdict = NonNullable<EvaluatePromptResponse['data']>;

export interface EvaluationVerdictProps {
    verdict: Verdict;
    /** Append this text to the prompt. Only offered for mechanical fixes. */
    onApply: (append: string) => void;
    /** Replace the prompt with an earlier version of it. */
    onRevert: (prompt: string) => void;
    /** Hand the prompt to the chat to run for real. Set apart, deliberately. */
    onRunForReal: () => void;
    /** Save the prompt to the library, or update it there. */
    onSave: () => void;
    /** True when this thread already came from the library. */
    isSaved: boolean;
    /** Nothing may be pressed while a run is in flight. */
    isBusy: boolean;
}

/**
 * Dollars — REVERSED 2026-08-26, pending step 11.
 *
 * The metric becomes tokens: dollars measure our cost, tokens measure what the
 * producer has left to work with. Kept until step 11 rebuilds this panel, so the
 * three surfaces reporting a run do not disagree mid-flight.
 */
function money(usd: number): string {
    return `$${usd.toFixed(2)}`;
}

/**
 * One statistic, with its delta when there is something to compare.
 *
 * A ROW of discrete stats rather than a run-on sentence: each is findable, and
 * they line up down the page between runs (the CSS sets `tabular-nums`). The
 * delta is the one coloured thing, because "is this getting better" is the
 * question the whole feature exists to answer.
 */
function Stat({
    value,
    label,
    now,
    before,
    format,
}: {
    value: string;
    label: string;
    now?: number;
    before?: number;
    format?: (n: number) => string;
}): React.JSX.Element {
    const showDelta =
        now !== undefined && before !== undefined && before !== now && format !== undefined;
    const down = showDelta && now < before;
    return (
        <span>
            <span className="wb-stat-value">{value}</span> {label}
            {showDelta && (
                // The arrow is the glance-readable form (it is what the plan's
                // own sketch drew), and `aria-label` carries the word for anyone
                // who cannot see it — a bare glyph reads as nothing aloud.
                <span
                    className={down ? 'wb-stat-down' : 'wb-stat-up'}
                    aria-label={`${down ? 'down' : 'up'} from ${format(before)}`}
                >
                    {' '}
                    {down ? '↓' : '↑'} from {format(before)}
                </span>
            )}
        </span>
    );
}

export function EvaluationVerdict({
    verdict,
    onApply,
    onRevert,
    onRunForReal,
    onSave,
    isSaved,
    isBusy,
}: EvaluationVerdictProps): React.JSX.Element {
    // Read from the RESPONSE, which read it from disk. Holding the previous run
    // in React state made the delta die with the window — and "is this getting
    // better" is the question the feature exists to answer.
    const previous = verdict.previousRun;
    // Offered only when going back would actually help: a cheaper run, wearing
    // different words from the ones on screen. History keeps the best run even
    // when it is the oldest, which is what makes this possible at all.
    const best = verdict.bestRun;
    const canRevert =
        best !== undefined && best.costUSD < verdict.costUSD && best.prompt !== verdict.prompt;
    const steps = verdict.trace.length;
    const wasted = verdict.repeats.length;
    const seconds = Math.round(verdict.durationMs / 1000);

    return (
        <div className="wb-panel">
            <SpeakerTurn who="You" isYou testId="evaluation-prompt-turn">
                {verdict.prompt}
            </SpeakerTurn>

            <TranscriptPhases steps={verdict.trace} testId="evaluation-transcript" />

            {/* Only when the run actually said something. A "Claude" heading
                over nothing reads as a reply that failed to load. */}
            {verdict.reply && (
                <SpeakerTurn who="Claude" testId="evaluation-reply">
                    {verdict.reply}
                </SpeakerTurn>
            )}

            {/* A CARD, not a rule and a paragraph. After a transcript full of
                "would have", the reassurance is what the eye should land on. */}
            <div className="wb-verdict">
                <p className="wb-verdict-headline">Nothing was changed.</p>
                <div className="wb-stats" data-testid="evaluation-verdict">
                    <Stat
                        value={`${steps}`}
                        label={steps === 1 ? 'step' : 'steps'}
                        now={steps}
                        before={previous?.steps}
                        format={(n) => `${n}`}
                    />
                    <Stat
                        value={money(verdict.costUSD)}
                        label="cost"
                        now={verdict.costUSD}
                        before={previous?.costUSD}
                        format={money}
                    />
                    <Stat value={`${seconds}s`} label="elapsed" />
                    <Stat
                        value={`${wasted}`}
                        label={wasted === 1 ? 'wasted step' : 'wasted steps'}
                    />
                    {verdict.priorRuns > 1 && (
                        <Stat value={`${verdict.priorRuns + 1}`} label="runs of this prompt" />
                    )}
                </div>
            </div>

            {canRevert && best && (
                <View data-testid="evaluation-best-run">
                    <Text>
                        Your cheapest version of this cost {money(best.costUSD)}.{' '}
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                onRevert(best.prompt);
                            }}
                        >
                            Go back to it
                        </a>
                    </Text>
                </View>
            )}

            {verdict.suggestions.length > 0 && (
                <View data-testid="evaluation-suggestions">
                    <p className="wb-section-title">What would make this better</p>
                    {verdict.suggestions.map((s, i) => (
                        <SuggestionRow key={`${s.text}-${i}`} suggestion={s} onApply={onApply} />
                    ))}
                </View>
            )}

            {verdict.blocked.length > 0 && (
                <View data-testid="evaluation-blocked">
                    <p className="wb-section-title">What it would have changed</p>
                    <Text>
                        These were simulated, so nothing happened:{' '}
                        {[...new Set(verdict.blocked.map((b) => b.tool))].join(', ')}.
                    </Text>
                </View>
            )}

            {/*
              THE ONE HARD RULE. After minutes of reading "would have", the move
              to actually doing it cannot look like one more thing to click. It
              is `negative`, it names what it is about to do, and it sits at the
              END of the result — a whole transcript away from "Simulate",
              which now lives in the composer at the bottom of the panel. That is
              the furthest apart the two have ever been.
            */}
            <div className="wb-actions" data-testid="evaluation-actions">
                <Button variant="secondary" onPress={onSave} isDisabled={isBusy}>
                    {isSaved ? 'Update in library' : 'Save to library'}
                </Button>
                <Button variant="negative" onPress={onRunForReal} isDisabled={isBusy}>
                    Run this for real in the chat
                </Button>
            </div>
        </div>
    );
}

/** One suggestion, with its evidence and (when mechanical) a one-click fix. */
function SuggestionRow({
    suggestion,
    onApply,
}: {
    suggestion: EvaluationSuggestion;
    onApply: (append: string) => void;
}): React.JSX.Element {
    return (
        <View marginTop="size-100">
            <Text>{suggestion.text}</Text>
            <br />
            {/* The EVIDENCE, always. A suggestion without the trace fact behind
                it is an opinion, and the user cannot check it. */}
            <Text>{suggestion.evidence}</Text>
            {suggestion.append && (
                <>
                    {' '}
                    <a
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            onApply(suggestion.append as string);
                        }}
                    >
                        Add it to my prompt
                    </a>
                </>
            )}
        </View>
    );
}
