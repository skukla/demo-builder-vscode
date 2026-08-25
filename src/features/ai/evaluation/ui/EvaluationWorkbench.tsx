/**
 * The workbench shell — two modes, one panel.
 *
 * **Try a prompt out** is the loop the feature was built for: type a prompt, see
 * what it would do and cost, refine, run it for real.
 *
 * **What the agent did** is the other half, and it was missing. With the dry run
 * on you could chat normally and get the safety with none of the visibility —
 * every call was being recorded and nothing read it.
 *
 * They are DISTINCT modes rather than one layout with fields blanked. An ambient
 * trace has no prompt and no cost; fitting it into a view built around a verdict
 * would weaken the thing that view does well.
 *
 * @module features/ai/evaluation/ui/EvaluationWorkbench
 */

import { Button, ButtonGroup } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { AgentTraceView } from './AgentTraceView';
import { PromptWorkbench } from './PromptWorkbench';
import { PageHeader, PageLayout } from '@/core/ui/components/layout';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';
import type { WorkbenchMode } from '@/types/webviewPayloads';

/** What the header says in each mode. */
const HEADINGS: Record<WorkbenchMode, { title: string; description: string }> = {
    prompt: {
        title: 'Try a prompt out',
        description:
            'Nothing is changed. You will see what the agent would do, what it would cost, and where it wasted steps.',
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
}

export function EvaluationWorkbench({
    project,
    initialMode = 'prompt',
}: EvaluationWorkbenchProps): React.JSX.Element {
    const [mode, setMode] = useState<WorkbenchMode>(initialMode);

    // The panel is reused, so a second command has to reach an ALREADY OPEN
    // window. Initial data only arrives once; this is how the trace command
    // switches a workbench the producer already had open.
    useEffect(
        () =>
            webviewClient.onMessage('workbench-mode', (data) => {
                const next = (data as { mode?: WorkbenchMode })?.mode;
                if (next === 'prompt' || next === 'trace') setMode(next);
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
                <ButtonGroup>
                    <Button
                        variant={mode === 'prompt' ? 'accent' : 'secondary'}
                        onPress={() => setMode('prompt')}
                    >
                        Try a prompt
                    </Button>
                    <Button
                        variant={mode === 'trace' ? 'accent' : 'secondary'}
                        onPress={() => setMode('trace')}
                    >
                        What the agent did
                    </Button>
                </ButtonGroup>

                {mode === 'prompt' ? <PromptWorkbench project={project} /> : <AgentTraceView />}
            </div>
        </PageLayout>
    );
}
