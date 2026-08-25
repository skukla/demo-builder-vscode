/**
 * The workbench — the loop this whole feature exists for.
 *
 * Type a prompt, see what it WOULD do and what it costs, apply a suggestion,
 * try it again and watch the delta, then run it for real or save it.
 *
 * THE ONE HARD RULE: "Run for real" must be unmistakable. The user will have
 * spent minutes reading "would have deployed"; the transition to actually
 * deploying cannot look like the other buttons. It is `negative` variant, it
 * names what it is about to do, and it sits apart from the try-it-out controls.
 */

import { Button, ButtonGroup, Flex, Heading, Text, TextArea, View } from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import { EvaluationVerdict } from './EvaluationVerdict';
import { InlineNotice } from '@/core/ui/components/feedback';
import { PageHeader, PageLayout } from '@/core/ui/components/layout';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
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

/** What a completed evaluation left on screen. */
type Verdict = NonNullable<EvaluatePromptResponse['data']>;

export interface EvaluationWorkbenchProps {
    project: Project;
}

export function EvaluationWorkbench({ project }: EvaluationWorkbenchProps): React.JSX.Element {
    const [prompt, setPrompt] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verdict, setVerdict] = useState<Verdict | null>(null);
    /** The previous run, so the headline can be a DELTA rather than a number. */
    const [previous, setPrevious] = useState<Verdict | null>(null);

    const evaluate = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            // Typed as the ENVELOPE and branched on `success`. A handler that
            // returns {success:false} does NOT reject here — it arrives looking
            // exactly like a success, because only a THROW sets an error field.
            const response = await webviewClient.request<EvaluatePromptResponse>(
                'evaluate-prompt',
                { prompt },
            );
            if (!response?.success || !response.data) {
                setError(response?.error ?? 'The evaluation did not finish.');
                return;
            }
            setPrevious(verdict);
            setVerdict(response.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }, [prompt, verdict]);

    const applySuggestion = useCallback((append: string) => {
        // Appended, never replaced: the user's words are theirs, and a
        // suggestion that rewrote the prompt would lose whatever it did not
        // understand.
        setPrompt((current) => `${current.trimEnd()}${append}`);
    }, []);

    const runForReal = useCallback(async () => {
        // The EXISTING route the Prompt Library's Launch button uses. Real work
        // belongs in the chat, where the user can watch it and stop it — not in
        // a headless run they cannot see.
        await webviewClient.request('openInClaude', { prompt });
    }, [prompt]);

    const savePrompt = useCallback(async () => {
        await webviewClient.request('save-ai-prompt', {
            name: prompt.slice(0, 60),
            prompt,
        });
    }, [prompt]);

    const canRun = prompt.trim().length > 0 && !busy;

    return (
        <PageLayout
            header={
                <PageHeader
                    title="Try a prompt out"
                    subtitle={getProjectDisplayName(project)}
                    description="Nothing is changed. You will see what the agent would do, what it would cost, and where it wasted steps."
                />
            }
        >
            {/*
              A plain div with flex styles, NOT a Spectrum Flex: Spectrum's Flex
              constrains width at 450px, which is the documented trap for any
              full-width webview layout in this project.
            */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
                <TextArea
                    label="What would you ask the agent to do?"
                    value={prompt}
                    onChange={setPrompt}
                    width="100%"
                    height="size-1600"
                    isDisabled={busy}
                    placeholder="Set up Bodea with B2B"
                />

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
                                Save to library
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
                        previous={previous}
                        onApply={applySuggestion}
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
        </PageLayout>
    );
}
