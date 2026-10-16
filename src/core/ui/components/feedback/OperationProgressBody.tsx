/**
 * OperationProgressBody — the one row of the progress modal that changes: a question
 * the run is paused on, its failure, its success, or where the work has got to and
 * how long the run has been going.
 *
 * Split out of {@link OperationProgressModal} (2026-10-16), which keeps the dialog,
 * its buttons and the state that drives them.
 *
 * @module core/ui/components/feedback/OperationProgressBody
 */

import { Flex, Text } from '@adobe/react-spectrum';
import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { OperationPromptForm } from '@/core/ui/components/feedback/OperationPromptForm';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { tookLine, useRunClock } from '@/core/ui/hooks/useRunClock';
import { expectationLine, stageLine } from '@/core/utils/stageLine';
import type { OperationPrompt, OperationProgressPayload } from '@/types/webviewPayloads';

export interface OperationProgressBodyProps {
    prompt?: OperationPrompt;
    failed: boolean;
    succeeded: boolean;
    failureTitle: string;
    successTitle: string;
    /** The success view's second line: the run's warning or note, then what is left to do. */
    successMessage?: string;
    /** The run succeeded with a warning: the view is a warning's, not a green tick. A note keeps the tick. */
    warned: boolean;
    progress?: OperationProgressPayload | null;
    /** Every keystroke in a question's fields, for the buttons to hand back. */
    onTyped: (values: Record<string, string>) => void;
}

/** The one row that changes: a question, a failure, or where the work has got to. */
export function OperationProgressBody({
    prompt,
    failed,
    succeeded,
    failureTitle,
    successTitle,
    successMessage,
    warned,
    progress,
    onTyped,
}: OperationProgressBodyProps): React.ReactElement {
    // The whole run, from the start the extension stamped on every push. The only
    // thing that moves while a step waits on Adobe.
    const total = useRunClock(progress?.state === 'running' ? progress.startedAt : undefined);
    // "Took 3 minutes, 12 seconds" on the last view, when the extension timed the run.
    const took = progress?.tookMs === undefined ? undefined : [tookLine(progress.tookMs)];
    if (prompt?.fields?.length) {
        // The question and what it needs typed, together: the modal owns the form
        // rather than handing off to a VS Code input box (owner, 2026-09-20).
        return (
            <Flex direction="column" gap="size-200" width="100%">
                <Text>{prompt.message}</Text>
                <OperationPromptForm fields={prompt.fields} onChange={onTyped} />
            </Flex>
        );
    }
    if (prompt) {
        return <StatusDisplay variant="warning" title="Waiting for you" message={prompt.message} />;
    }
    if (failed) {
        return <StatusDisplay variant="error" title={failureTitle} message={progress?.error} details={took} />;
    }
    if (succeeded) {
        return (
            // Centred under the centred tick and title (owner, 2026-10-16). A failure's
            // message stays left-aligned: it can run to several lines.
            <StatusDisplay
                variant={warned ? 'warning' : 'success'}
                title={successTitle}
                message={successMessage}
                details={took}
                centerMessage
            />
        );
    }
    // Size L, as every other progress display here: M left-aligns and shrinks
    // the text (ImportDatapackModal).
    return (
        <LoadingDisplay
            size="L"
            steady
            message={progress?.stage ? stageLine(progress.stage, progress.position) : 'Starting'}
            subMessage={progress?.step}
            helperText={expectationLine(progress?.expectation, total)}
        />
    );
}
