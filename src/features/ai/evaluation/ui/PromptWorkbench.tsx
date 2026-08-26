/**
 * The Prompt Workbench — the loop this whole feature exists for.
 *
 * Type a prompt, SIMULATE it, see what it would do and what it costs, apply a
 * suggestion, simulate again and watch the delta, then run it for real or save
 * it. Come back tomorrow, pick "Open in workbench" on the saved prompt, and
 * carry on from where the numbers left off.
 *
 * ## The vocabulary, settled 2026-08-25
 *
 * The action is **simulate**, never "try it out". Every blocked write in the
 * transcript already reads "simulated — nothing changed", so the button and the
 * steps it produces now speak the same word, and it pairs against the one
 * control that does not simulate: "Run this for real in the chat".
 *
 * ## It reads like a chat now, because the old shape read like a form
 *
 * The result is the page and the COMPOSER SITS UNDER IT, one box, the way every
 * chat a producer has ever used is laid out. Before this it was a picker, a
 * labelled text area, a row of buttons, and then output somewhere below — which
 * is half of why the owner said the surface read like a log.
 *
 * ## The picker is gone, and that is the design
 *
 * A saved-prompt dropdown used to sit at the top of this panel. It duplicated
 * the Prompt Library's entire job. **Each surface does one thing: the library
 * PICKS, the terminal RUNS, the workbench MEASURES.** A prompt now arrives here
 * from the library's "Open in workbench", and this door opens empty for starting
 * from scratch. See `usePromptThread`'s note for the longer version.
 *
 * ## THE ONE HARD RULE
 *
 * "Run this for real" must be unmistakable. The producer will have spent minutes
 * reading "would have"; the transition to actually deploying cannot look like
 * the other buttons. It is `negative`, it names what it is about to do, and it
 * lives in the RESULT (`EvaluationVerdict`) — a whole transcript away from the
 * "Simulate" button down in the composer. A test pins both halves.
 */

import { Button, Heading, Text, TextArea, View } from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import { EvaluationVerdict } from './EvaluationVerdict';
import { usePromptThread, type ThreadState } from './usePromptThread';
import './workbench.css';
import { InlineNotice, LoadingDisplay } from '@/core/ui/components/feedback';
import { useElapsedStage, type ElapsedStage } from '@/core/ui/hooks/useElapsedStage';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AiPrompt } from '@/types/base';
import type { EvaluatePromptResponse } from '@/types/webviewRequests';

/**
 * What the wait says as it drags on.
 *
 * A run is thirty seconds to two minutes and there is nothing to stream yet, so
 * a frozen label is the worst of both: the producer cannot tell a slow run from
 * a hung one. `useElapsedStage` is the extension's existing answer to exactly
 * this — it was built for a 39-second Adobe catalog fetch — and it idles when
 * the wait ends, which is the behaviour worth copying rather than hand-rolling
 * a ticker that keeps running when nothing does.
 */
const RUN_STAGES: ElapsedStage[] = [
    { afterMs: 20_000, message: 'Still going — a full run is usually under a minute.' },
    { afterMs: 75_000, message: 'This is a long one. A run is abandoned after five minutes.' },
];

/**
 * What the simulate button says.
 *
 * A helper, not a nested ternary — the project's SOP forbids those and a scan
 * enforces it. Three states also read better named than stacked.
 */
function simulateButtonLabel(busy: boolean, hasVerdict: boolean): string {
    if (busy) return 'Simulating…';
    return hasVerdict ? 'Simulate again' : 'Simulate';
}

/** What a completed evaluation left on screen. */
type Verdict = NonNullable<EvaluatePromptResponse['data']>;

export interface PromptWorkbenchProps {
    /**
     * A prompt handed over by the Prompt Library's "Open in workbench".
     *
     * The only way words get in here besides typing. There is no `project` prop:
     * this component took one to seed the deleted picker's list from
     * `project.aiPrompts`, and with the picker gone it had nothing left to read.
     * The shell owns the project (it names it in the header).
     */
    handedOver?: AiPrompt;
}

export function PromptWorkbench({ handedOver }: PromptWorkbenchProps): React.JSX.Element {
    const { prompt, setPrompt, appendToPrompt, thread, startFresh, saveToLibrary, noteRun } =
        usePromptThread(handedOver);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verdict, setVerdict] = useState<Verdict | null>(null);
    const waitMessage = useElapsedStage(busy, RUN_STAGES);

    const evaluate = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            // Typed as the ENVELOPE and branched on `success`. A handler that
            // returns {success:false} does NOT reject here — it arrives looking
            // exactly like a success, because only a THROW sets an error field.
            const response = await webviewClient.request<EvaluatePromptResponse>(
                'evaluate-prompt',
                { prompt, threadId: thread.threadId, promptId: thread.promptId },
            );
            if (!response?.success || !response.data) {
                setError(response?.error ?? 'The evaluation did not finish.');
                return;
            }
            // The previous run comes from the RESPONSE, not from React state.
            // Session state cannot survive a reload, which is the whole point:
            // "down from $0.21" has to still be true tomorrow.
            setVerdict(response.data);
            // Keep refining the SAME thread, including the one just minted.
            noteRun(response.data.threadId, response.data.priorRuns + 1);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }, [prompt, thread.threadId, thread.promptId, noteRun]);

    const runForReal = useCallback(async () => {
        // The EXISTING route the Prompt Library's Launch button uses. Real work
        // belongs in the chat, where the user can watch it and stop it — not in
        // a headless run they cannot see.
        await webviewClient.request('openInClaude', { prompt });
    }, [prompt]);

    const savePrompt = useCallback(async () => {
        const saved = await saveToLibrary();
        if (!saved) setError('The prompt could not be saved to your library.');
    }, [saveToLibrary]);

    const forkThread = useCallback(() => {
        // A fork keeps the words and drops the past — the deliberate way to get
        // a clean comparison from the same starting point.
        startFresh();
        setVerdict(null);
    }, [startFresh]);

    const canRun = prompt.trim().length > 0 && !busy;

    return (
        <div className="wb-panel">
            {error && (
                <InlineNotice title="The prompt was not simulated" testId="evaluation-error">
                    {error}
                </InlineNotice>
            )}

            {busy && (
                <LoadingDisplay
                    message="Simulating the prompt"
                    subMessage={waitMessage}
                    helperText="Every change is simulated. Your project is not touched."
                />
            )}

            {verdict && !busy && (
                <EvaluationVerdict
                    verdict={verdict}
                    onApply={appendToPrompt}
                    onRevert={setPrompt}
                    onRunForReal={runForReal}
                    onSave={savePrompt}
                    isSaved={Boolean(thread.promptId)}
                    isBusy={busy}
                />
            )}

            {!verdict && !busy && (
                <View>
                    <Heading level={3}>Nothing simulated yet</Heading>
                    <Text>
                        Type what you would normally ask, then simulate it. You will see what the
                        agent would do, in plain English, and what it would cost. Your project is
                        not touched.
                    </Text>
                </View>
            )}

            <div className="wb-composer">
                <TextArea
                    aria-label="What would you ask the agent to do?"
                    value={prompt}
                    onChange={setPrompt}
                    width="100%"
                    height="size-1200"
                    isDisabled={busy}
                    placeholder="Set up Bodea with B2B"
                />

                <div className="wb-composer-actions">
                    <ThreadNote thread={thread} onStartFresh={forkThread} isDisabled={busy} />
                    <Button variant="cta" onPress={evaluate} isDisabled={!canRun}>
                        {simulateButtonLabel(busy, verdict !== null)}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/**
 * One line saying which piece of work this is, and the way to leave it.
 *
 * Silent for a brand-new thread: "this is the first run" is what an empty
 * workbench already looks like, and saying it would be noise.
 *
 * "Start fresh" is a LINK inside this sentence rather than a button in a row of
 * its own. The row it used to sit in belonged to the deleted picker, and a
 * standalone button for forking a thread reads as a peer of "Simulate", which it
 * is not. Here it reads as what it is: the alternative to the sentence in front
 * of it.
 */
function ThreadNote({
    thread,
    onStartFresh,
    isDisabled,
}: {
    thread: ThreadState;
    onStartFresh: () => void;
    isDisabled: boolean;
}): React.JSX.Element | null {
    if (thread.priorRuns > 0) {
        const runs = thread.priorRuns === 1 ? '1 earlier run' : `${thread.priorRuns} earlier runs`;
        return (
            <span className="wb-composer-note" data-testid="evaluation-thread-note">
                Carrying on from {runs}. The next result compares against those.{' '}
                {!isDisabled && (
                    <a
                        href="#"
                        data-testid="evaluation-start-fresh"
                        onClick={(e) => {
                            e.preventDefault();
                            onStartFresh();
                        }}
                    >
                        Start fresh instead
                    </a>
                )}
            </span>
        );
    }
    if (thread.promptId) {
        return (
            <span className="wb-composer-note" data-testid="evaluation-thread-note">
                Loaded from your library. It has not been simulated here yet.
            </span>
        );
    }
    return null;
}
