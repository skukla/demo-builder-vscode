/**
 * Try a prompt out — the loop this whole feature exists for.
 *
 * Type a prompt, see what it WOULD do and what it costs, apply a suggestion,
 * try it again and watch the delta, then run it for real or save it. Come back
 * tomorrow, load the saved prompt, and carry on from where the numbers left off.
 *
 * THE ONE HARD RULE: "Run for real" must be unmistakable. The user will have
 * spent minutes reading "would have deployed"; the transition to actually
 * deploying cannot look like the other buttons. It is `negative` variant, it
 * names what it is about to do, and it sits apart from the try-it-out controls.
 *
 * Thread state — which piece of work this prompt belongs to, which saved prompt
 * it came from — lives in `usePromptThread`, not here. This file is the layout.
 */

import {
    Button,
    ButtonGroup,
    Flex,
    Heading,
    Item,
    Picker,
    Text,
    TextArea,
    View,
} from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import { EvaluationVerdict } from './EvaluationVerdict';
import { usePromptThread, type ThreadState } from './usePromptThread';
import { InlineNotice } from '@/core/ui/components/feedback';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { Project } from '@/types/base';
import type { EvaluatePromptResponse } from '@/types/webviewRequests';

/**
 * What the try-it-out button says.
 *
 * A helper, not a nested ternary — the project's SOP forbids those and a scan
 * enforces it. Three states also read better named than stacked.
 */
function tryButtonLabel(busy: boolean, hasVerdict: boolean): string {
    if (busy) return 'Trying it out…';
    return hasVerdict ? 'Try it again' : 'Try it out';
}

/**
 * One line saying which piece of work this is, when it is not a blank start.
 *
 * Silent for a brand-new thread: "this is the first run" is what an empty
 * workbench already looks like, and saying it would be noise.
 */
function threadLine(thread: ThreadState): string | undefined {
    if (thread.priorRuns > 0) {
        const runs = thread.priorRuns === 1 ? '1 earlier run' : `${thread.priorRuns} earlier runs`;
        return `Carrying on from ${runs}. The next result compares against those.`;
    }
    if (thread.promptId) {
        return 'Loaded from your library. It has not been tried out here yet.';
    }
    return undefined;
}

/** What a completed evaluation left on screen. */
type Verdict = NonNullable<EvaluatePromptResponse['data']>;

export interface PromptWorkbenchProps {
    project: Project;
}

export function PromptWorkbench({ project }: PromptWorkbenchProps): React.JSX.Element {
    const {
        prompt,
        setPrompt,
        appendToPrompt,
        thread,
        savedPrompts,
        loadSaved,
        startFresh,
        saveToLibrary,
        noteRun,
    } = usePromptThread(project.aiPrompts ?? []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verdict, setVerdict] = useState<Verdict | null>(null);

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
    const note = threadLine(thread);

    // A plain div with flex styles, NOT a Spectrum Flex: Spectrum's Flex
    // constrains width at 450px, which is the documented trap for any
    // full-width webview layout in this project.
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            {savedPrompts.length > 0 && (
                <Flex gap="size-200" alignItems="end" wrap>
                    <Picker
                        label="Pick up a saved prompt"
                        items={savedPrompts}
                        selectedKey={thread.promptId ?? null}
                        onSelectionChange={(key) => void loadSaved(String(key))}
                        isDisabled={busy}
                        data-testid="saved-prompt-picker"
                    >
                        {(item) => <Item key={item.id}>{item.title}</Item>}
                    </Picker>
                    {(thread.promptId || thread.priorRuns > 0) && (
                        <Button variant="secondary" onPress={forkThread} isDisabled={busy}>
                            Start fresh
                        </Button>
                    )}
                </Flex>
            )}

            <TextArea
                label="What would you ask the agent to do?"
                value={prompt}
                onChange={setPrompt}
                width="100%"
                height="size-1600"
                isDisabled={busy}
                placeholder="Set up Bodea with B2B"
            />

            {note && <Text data-testid="evaluation-thread-note">{note}</Text>}

            {error && (
                <InlineNotice title="The prompt was not tried out" testId="evaluation-error">
                    {error}
                </InlineNotice>
            )}

            <Flex justifyContent="space-between" alignItems="center" wrap>
                <ButtonGroup>
                    <Button variant="cta" onPress={evaluate} isDisabled={!canRun}>
                        {tryButtonLabel(busy, verdict !== null)}
                    </Button>
                    {verdict && (
                        <Button variant="secondary" onPress={savePrompt} isDisabled={busy}>
                            {thread.promptId ? 'Update in library' : 'Save to library'}
                        </Button>
                    )}
                </ButtonGroup>

                {/*
                  Set apart, and worded as what it does. See the file note:
                  after minutes of "would have", this button must not read
                  as one more thing to click.
                */}
                {verdict && (
                    <View>
                        <Button variant="negative" onPress={runForReal} isDisabled={busy}>
                            Run this for real in the chat
                        </Button>
                    </View>
                )}
            </Flex>

            {busy && (
                <Text>
                    Running your prompt with every change simulated. This takes up to two
                    minutes.
                </Text>
            )}

            {verdict && !busy && (
                <EvaluationVerdict
                    verdict={verdict}
                    onApply={appendToPrompt}
                    onRevert={setPrompt}
                />
            )}

            {!verdict && !busy && (
                <View>
                    <Heading level={3}>Nothing tried yet</Heading>
                    <Text>
                        Type what you would normally ask, then try it out. Your project is not
                        touched.
                    </Text>
                </View>
            )}
        </div>
    );
}
