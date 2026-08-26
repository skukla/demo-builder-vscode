/**
 * The workbench shell — two modes, one panel.
 *
 * **Prompt workbench** is the loop the feature was built for: type a prompt,
 * simulate it, see what it would do and cost, refine, run it for real.
 *
 * **What the agent did** is the other half, and it was missing. With the dry run
 * on you could chat normally and get the safety with none of the visibility —
 * every call was being recorded and nothing read it.
 *
 * They are DISTINCT modes rather than one layout with fields blanked. An ambient
 * trace has no prompt and no cost; fitting it into a view built around a verdict
 * would weaken the thing that view does well.
 *
 * ## One push, not two
 *
 * A command can reach a panel that is ALREADY OPEN, and initial data only
 * arrives once — so anything a second command wants to say has to be pushed.
 * There is exactly one such message, `workbench-open`, and it carries everything
 * an opening decides: which mode, and (for the Prompt Library's "Open in
 * workbench") which saved prompt to load. It was called `workbench-mode` while
 * mode was all it carried; a message named for one of its two fields is how the
 * next reader gets misled.
 *
 * @module features/ai/evaluation/ui/EvaluationWorkbench
 */

import { Button, ButtonGroup } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { AgentTraceView } from './AgentTraceView';
import { PromptWorkbench } from './PromptWorkbench';
import './workbench.css';
import { PageHeader, PageLayout } from '@/core/ui/components/layout';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { AiPrompt, Project } from '@/types/base';
import type { WorkbenchMode, WorkbenchOpenPayload } from '@/types/webviewPayloads';

/** What the header says in each mode. */
const HEADINGS: Record<WorkbenchMode, { title: string; description: string }> = {
    prompt: {
        title: 'Prompt Workbench',
        description:
            'Simulate a prompt: nothing is changed, and you see what the agent would do, what it would cost, and where it wasted steps.',
    },
    trace: {
        title: 'What the agent did',
        description:
            'Every tool call this window has seen, newest last. Cost is not recorded for a chat session.',
    },
};

export interface EvaluationWorkbenchProps {
    project: Project;
    /** Which mode the command that opened the panel asked for. */
    initialMode?: WorkbenchMode;
    /** A saved prompt the Prompt Library's "Open in workbench" sent over. */
    initialPrompt?: AiPrompt;
}

export function EvaluationWorkbench({
    project,
    initialMode = 'prompt',
    initialPrompt,
}: EvaluationWorkbenchProps): React.JSX.Element {
    const [mode, setMode] = useState<WorkbenchMode>(initialMode);
    const [handedOver, setHandedOver] = useState<AiPrompt | undefined>(initialPrompt);

    // The panel is reused, so a second command has to reach an ALREADY OPEN
    // window. Initial data only arrives once; this is how the trace command
    // switches a workbench the producer already had open, and how the library
    // hands a prompt to one.
    useEffect(
        () =>
            webviewClient.onMessage('workbench-open', (data) => {
                const payload = data as WorkbenchOpenPayload | undefined;
                if (payload?.mode === 'prompt' || payload?.mode === 'trace') setMode(payload.mode);
                // Only when one was sent. A mode-only push must not wipe the
                // prompt the producer is part-way through editing.
                if (payload?.prompt) setHandedOver(payload.prompt);
            }),
        [],
    );

    return (
        <PageLayout
            header={
                <PageHeader
                    title={HEADINGS[mode].title}
                    subtitle={getProjectDisplayName(project)}
                    description={HEADINGS[mode].description}
                />
            }
        >
            <div className="wb-panel">
                <ButtonGroup>
                    <Button
                        variant={mode === 'prompt' ? 'accent' : 'secondary'}
                        onPress={() => setMode('prompt')}
                    >
                        Simulate a prompt
                    </Button>
                    <Button
                        variant={mode === 'trace' ? 'accent' : 'secondary'}
                        onPress={() => setMode('trace')}
                    >
                        What the agent did
                    </Button>
                </ButtonGroup>

                {mode === 'prompt' ? (
                    <PromptWorkbench handedOver={handedOver} />
                ) : (
                    <AgentTraceView />
                )}
            </div>
        </PageLayout>
    );
}
