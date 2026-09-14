/**
 * DemoSourceNotice
 *
 * The dashboard's notice for a project built on an added demo whose source
 * does not answer: the demo-source check's own sentence ("Jen's demo can't be
 * reached. Reset and updates are unavailable until it is.") with the one
 * recovery, "Change source", which reopens the Add a demo package dialog to point the
 * project at another copy of the same kind. The same shape as
 * `OrgContextNotice`: an `InlineNotice` shown only on a warning, null otherwise.
 *
 * @module features/dashboard/ui/components/DemoSourceNotice
 */

import { Button, Text } from '@adobe/react-spectrum';
import React from 'react';
import type { DemoSourceIssue } from '../hooks/dashboardCheckRouting';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';

export interface DemoSourceNoticeProps {
    /** The check's warning; the notice renders nothing without one. */
    issue?: DemoSourceIssue;
    /** Open the change-source dialog. Absent when the project has no demo row. */
    onChangeSource?: () => void;
}

export const DEMO_SOURCE_NOTICE_TITLE = "This demo's source can't be reached";
export const CHANGE_SOURCE_LABEL = 'Change source';

export function DemoSourceNotice({ issue, onChangeSource }: DemoSourceNoticeProps): React.ReactElement | null {
    if (!issue) return null;
    return (
        <div className="page-container-padded">
            <InlineNotice
                title={DEMO_SOURCE_NOTICE_TITLE}
                testId="demo-source-banner"
                action={
                    onChangeSource ? (
                        <Button variant="accent" onPress={onChangeSource}>
                            <Text>{CHANGE_SOURCE_LABEL}</Text>
                        </Button>
                    ) : undefined
                }
            >
                {issue.message}
            </InlineNotice>
        </div>
    );
}
