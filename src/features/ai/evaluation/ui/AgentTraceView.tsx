/**
 * What the agent just did — the chat's own trace, in a surface we control.
 *
 * WHY THIS EXISTS. Turning the dry run on and chatting normally gave a producer
 * the safety and none of the visibility: nothing changed, and there was no trace
 * and no cost. Every one of those calls was already being recorded; nothing read
 * it. This is the read.
 *
 * It renders the SAME phase bands as a workbench run — one renderer, in
 * `Transcript.tsx`, so the two views cannot drift — and deliberately nothing
 * else that view has:
 *
 * - **No speaker turns.** The extension does not own the chat's process, so
 *   there is no prompt to quote and no assistant reply to show. Growing them
 *   here would mean inventing them.
 * - **No cost, and no estimate.** It comes from a run's own output. A per-call
 *   guess would be a number that looks authoritative and is not — in a feature
 *   whose whole purpose is replacing guesses with measurements. The line says so
 *   out loud rather than showing a zero.
 *
 * Those two absences are the reason this is a distinct view rather than the
 * verdict layout with fields blanked, and they are what must not converge.
 */

import { Button, ButtonGroup, Heading, Text, View } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { TranscriptPhases, TranscriptSteps } from './Transcript';
import './workbench.css';
import { InlineNotice } from '@/core/ui/components/feedback';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AgentTraceResponse } from '@/types/webviewRequests';

type Report = NonNullable<AgentTraceResponse['data']>;

export function AgentTraceView(): React.JSX.Element {
    const [report, setReport] = useState<Report | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        setSaved(null);
        const response = await webviewClient.request<AgentTraceResponse>('get-agent-trace');
        // Branch on `success` first: a handler that returns {success:false}
        // arrives looking exactly like a success, because only a THROW sets an
        // error field.
        if (!response?.success || !response.data) {
            setError(response?.error ?? 'The trace could not be read.');
            return;
        }
        setReport(response.data);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const copy = useCallback(async () => {
        const text = await webviewClient.request<{ success: boolean; data?: { text: string } }>(
            'get-agent-trace-text',
        );
        if (!text?.success || !text.data) return;
        // The Prompt Library owns the one clipboard write; a second would be a
        // second thing to keep correct.
        await webviewClient.request('copyAiPrompt', {
            prompt: text.data.text,
            name: 'Agent trace',
        });
    }, []);

    const save = useCallback(async () => {
        const response = await webviewClient.request<{
            success: boolean;
            error?: string;
            data?: { saved: boolean; path?: string };
        }>('save-agent-trace');
        if (!response?.success) {
            setError(response?.error ?? 'The trace could not be saved.');
            return;
        }
        setSaved(response.data?.saved ? (response.data.path ?? 'Saved.') : null);
    }, []);

    return (
        <div className="wb-panel">
            {error && (
                <InlineNotice title="The trace could not be shown" testId="trace-error">
                    {error}
                </InlineNotice>
            )}

            <ButtonGroup>
                <Button variant="secondary" onPress={load}>
                    Refresh
                </Button>
                <Button variant="secondary" onPress={copy} isDisabled={!report?.totalCalls}>
                    Copy
                </Button>
                <Button variant="secondary" onPress={save} isDisabled={!report?.totalCalls}>
                    Save to a file
                </Button>
            </ButtonGroup>

            {saved && <Text data-testid="trace-saved">Saved to {saved}</Text>}

            {report && report.totalCalls === 0 && (
                <View data-testid="trace-empty">
                    <Heading level={3}>The agent has not done anything yet</Heading>
                    <Text>
                        Ask it for something in the chat, then come back. This list is kept in
                        memory for this window only, so it starts empty again after a reload.
                    </Text>
                </View>
            )}

            {report && report.totalCalls > 0 && (
                <>
                    {/* The trace FIRST, because it is what someone opened this
                        for. The counts and the caveats follow it, the same way
                        the workbench puts its numbers after its transcript. */}
                    <TranscriptPhases steps={report.rows} testId="trace-steps" />

                    {report.standouts.length > 0 && (
                        <View data-testid="trace-standouts">
                            <p className="wb-section-title">What stood out</p>
                            {/* A flat list, NOT bands: these are picked from
                                across the whole window and are not a run of
                                consecutive calls, so drawing them as phases
                                would claim an adjacency they do not have. */}
                            <TranscriptSteps steps={report.standouts} />
                        </View>
                    )}

                    <View data-testid="trace-summary">
                        <Heading level={3} marginBottom="size-50">
                            {report.totalCalls} step{report.totalCalls === 1 ? '' : 's'} in this
                            window
                        </Heading>
                        <Text>
                            {report.wastedCalls} asked again, {report.blockedCalls} simulated,{' '}
                            {report.failedCalls} failed.
                        </Text>
                        <br />
                        {/* Said, never estimated. See the file note. */}
                        <Text data-testid="trace-no-cost">
                            Cost is not recorded for a chat session — simulate a prompt to
                            measure it.
                        </Text>
                        <br />
                        <Text>
                            This is everything the agent did in this VS Code window, not one
                            conversation, and it resets when the window reloads.
                        </Text>
                    </View>
                </>
            )}
        </div>
    );
}
