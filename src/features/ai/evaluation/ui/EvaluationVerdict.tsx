/**
 * What the run would have done — the result surface.
 *
 * Four things, in the order a person needs them:
 *
 *   1. The VERDICT, one line, with the delta when there is a previous run.
 *   2. What it WASTED — equal billing with what it stopped, because that is the
 *      question this feature exists to answer. Blocked writes tell you your
 *      project is safe; wasted steps tell you the prompt could be better.
 *   3. What it STOPPED, so nobody is left unsure whether something ran.
 *   4. The TRACE, in plain language, tool names on expand.
 */

import {
    Disclosure,
    DisclosurePanel,
    DisclosureTitle,
    Flex,
    Heading,
    Text,
    View,
} from '@adobe/react-spectrum';
import React from 'react';
import type {
    EvaluationSuggestion,
    EvaluationTraceStep,
    EvaluatePromptResponse,
} from '@/types/webviewRequests';

type Verdict = NonNullable<EvaluatePromptResponse['data']>;

export interface EvaluationVerdictProps {
    verdict: Verdict;
    /** Append this text to the prompt. Only offered for mechanical fixes. */
    onApply: (append: string) => void;
}

/** Dollars, because "$0.21" means something and "47,550 tokens" does not. */
function money(usd: number): string {
    return `$${usd.toFixed(2)}`;
}

/**
 * What one step's outcome should read as.
 *
 * A helper rather than a nested ternary — the project's SOP forbids those, and
 * a scan enforces it. Three outcomes is already one too many to read inline.
 */
function stepOutcome(step: EvaluationTraceStep): string {
    if (step.outcome === 'blocked-by-dry-run') return '(simulated)';
    if (step.outcome === 'error') return '(failed)';
    return `${step.durationMs}ms`;
}

/** "down from $0.24", or nothing when there is nothing to compare. */
function delta(now: number, before: number | undefined, format: (n: number) => string): string {
    if (before === undefined || before === now) return '';
    return `, ${now < before ? 'down' : 'up'} from ${format(before)}`;
}

export function EvaluationVerdict({
    verdict,
    onApply,
}: EvaluationVerdictProps): React.JSX.Element {
    // Read from the RESPONSE, which read it from disk. Holding the previous run
    // in React state made the delta die with the window — and "is this getting
    // better" is the question the feature exists to answer.
    const previous = verdict.previousRun;
    const steps = verdict.trace.length;
    const wasted = verdict.repeats.length;
    const seconds = Math.round(verdict.durationMs / 1000);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <View
                backgroundColor="gray-100"
                padding="size-200"
                borderRadius="medium"
                data-testid="evaluation-verdict"
            >
                <Heading level={3} marginBottom="size-50">
                    Nothing was changed.
                </Heading>
                <Text>
                    {steps} step{steps === 1 ? '' : 's'}
                    {delta(steps, previous?.steps, (n) => `${n}`)}, {money(verdict.costUSD)}
                    {delta(verdict.costUSD, previous?.costUSD, money)}, {seconds}s
                    {wasted > 0 ? `, ${wasted} wasted` : ', nothing wasted'}.
                    {verdict.priorRuns > 1 ? ` Run ${verdict.priorRuns + 1} of this prompt.` : ''}
                </Text>
            </View>

            {verdict.suggestions.length > 0 && (
                <View data-testid="evaluation-suggestions">
                    <Heading level={4}>What would make this better</Heading>
                    {verdict.suggestions.map((s, i) => (
                        <SuggestionRow key={`${s.text}-${i}`} suggestion={s} onApply={onApply} />
                    ))}
                </View>
            )}

            {verdict.blocked.length > 0 && (
                <View data-testid="evaluation-blocked">
                    <Heading level={4}>What it would have changed</Heading>
                    <Text>
                        These were simulated, so nothing happened:{' '}
                        {[...new Set(verdict.blocked.map((b) => b.tool))].join(', ')}.
                    </Text>
                </View>
            )}

            <Disclosure>
                <DisclosureTitle>Show every step ({steps})</DisclosureTitle>
                <DisclosurePanel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {verdict.trace.map((step, i) => (
                            <Flex key={`${step.tool}-${step.at}-${i}`} gap="size-100">
                                <Text>
                                    {i + 1}. {step.tool}
                                </Text>
                                <Text>{stepOutcome(step)}</Text>
                            </Flex>
                        ))}
                    </div>
                </DisclosurePanel>
            </Disclosure>
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
