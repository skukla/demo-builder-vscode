/**
 * What the agent just did — the chat's own trace, in a surface we control.
 *
 * WHY THIS EXISTS. Turning the dry run on and chatting normally gave a producer
 * the safety and none of the visibility: nothing changed, and there was no trace
 * and no cost. Every one of those calls was already being recorded; nothing read
 * it. This is the read.
 *
 * It is a DISTINCT mode, not the verdict layout with two fields blanked. An
 * ambient trace has no prompt and no cost, and squeezing it into a view built
 * around a verdict would weaken the thing that view does well.
 *
 * THE HONEST LINE: cost is stated as unavailable, never shown as zero. It comes
 * from a run's own output and the extension does not own the chat's process. A
 * per-call estimate would be a number that looks authoritative and is not — in a
 * feature whose whole purpose is replacing guesses with measurements.
 */

import { Button, ButtonGroup, Flex, Heading, Text, View } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { InlineNotice } from '@/core/ui/components/feedback';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AgentTraceResponse, AgentTraceRow } from '@/types/webviewRequests';

type Report = NonNullable<AgentTraceResponse['data']>;

/** What a flag means, in words a producer can act on. */
const FLAG_TEXT: Record<NonNullable<AgentTraceRow['flag']>, string> = {
    failed: 'failed',
    blocked: 'simulated — nothing changed',
    repeated: 'asked again',
    slow: 'slow',
};

/** One call, as a line. A helper so both lists render identically. */
function TraceLine({ row, index }: { row: AgentTraceRow; index: number }): React.JSX.Element {
    return (
        <Flex gap="size-100">
            <Text>
                {index}. {row.tool}
            </Text>
            <Text>
                {row.durationMs}ms{row.flag ? ` · ${FLAG_TEXT[row.flag]}` : ''}
            </Text>
        </Flex>
    );
}

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
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
                    <View
                        backgroundColor="gray-100"
                        padding="size-200"
                        borderRadius="medium"
                        data-testid="trace-summary"
                    >
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
                            Cost is not recorded for a chat session — try a prompt out to measure
                            it.
                        </Text>
                        <br />
                        <Text>
                            This is everything the agent did in this VS Code window, not one
                            conversation, and it resets when the window reloads.
                        </Text>
                    </View>

                    {report.standouts.length > 0 && (
                        <View data-testid="trace-standouts">
                            <Heading level={4}>What stood out</Heading>
                            {report.standouts.map((row, i) => (
                                <TraceLine key={`${row.tool}-${row.at}-${i}`} row={row} index={i + 1} />
                            ))}
                        </View>
                    )}

                    <View data-testid="trace-steps">
                        <Heading level={4}>Every step, in order</Heading>
                        {report.rows.map((row, i) => (
                            <TraceLine key={`${row.tool}-${row.at}-${i}`} row={row} index={i + 1} />
                        ))}
                    </View>
                </>
            )}
        </div>
    );
}
