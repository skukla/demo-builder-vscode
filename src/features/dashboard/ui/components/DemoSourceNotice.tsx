/**
 * DemoSourceNotice
 *
 * The dashboard's notice for a project built on an added demo whose source
 * does not answer: the demo-source check's own sentence ("The AI Store demo's
 * repository can't be reached. Reset and updates are unavailable until it is.")
 * with two ways out. "Change source" reopens the Add a demo package dialog to
 * point the project at another copy of the same kind (the author moved it);
 * "Keep as my own demo" opens the Share dialog, whose save puts this project's
 * storefront on the SC's Welcome step as their own (the author deleted it, owner
 * 2026-09-15; one dialog since 2026-10-22). When only the pages are out of reach
 * the title says so and Keep is not offered. The same shape as
 * `OrgContextNotice`: an `InlineNotice` shown only on a warning, null otherwise.
 *
 * @module features/dashboard/ui/components/DemoSourceNotice
 */

import { Button, Flex, Text } from '@adobe/react-spectrum';
import React from 'react';
import type { DemoSourceIssue } from '../hooks/dashboardCheckRouting';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';

export interface DemoSourceNoticeProps {
    /** The check's warning; the notice renders nothing without one. */
    issue?: DemoSourceIssue;
    /** Open the change-source dialog. Absent when the project has no demo row. */
    onChangeSource?: () => void;
    /**
     * Open the Share dialog to keep this project as the SC's own. Absent for a
     * project that cannot (a headless project: its code is a local copy nothing
     * pushes to a repository of its own).
     */
    onKeepAsOwn?: () => void;
}

export const DEMO_SOURCE_NOTICE_TITLE = "This demo's source can't be reached";
export const DEMO_PAGES_NOTICE_TITLE = "This demo's pages can't be reached";
export const CHANGE_SOURCE_LABEL = 'Change source';
export const KEEP_AS_OWN_LABEL = 'Keep as my own demo';
/**
 * Which door fits, said without claiming which happened: a deleted repository
 * and a network failure read the same from here.
 */
export const WHICH_DOOR =
    "If it moved, change the source. If it's gone for good, keep this project as your own demo.";

export function DemoSourceNotice({
    issue,
    onChangeSource,
    onKeepAsOwn,
}: DemoSourceNoticeProps): React.ReactElement | null {
    if (!issue) return null;
    // The pages alone: the repository answers, so saving a copy is not the remedy.
    const sourceGone = issue.data?.unreachable !== false;
    const offerKeep = sourceGone && onKeepAsOwn !== undefined;
    return (
        <div className="page-container-padded">
            <InlineNotice
                title={sourceGone ? DEMO_SOURCE_NOTICE_TITLE : DEMO_PAGES_NOTICE_TITLE}
                testId="demo-source-banner"
                action={
                    onChangeSource || offerKeep ? (
                        <Flex gap="size-100">
                            {offerKeep ? (
                                <Button variant="secondary" onPress={onKeepAsOwn}>
                                    <Text>{KEEP_AS_OWN_LABEL}</Text>
                                </Button>
                            ) : null}
                            {onChangeSource ? (
                                <Button variant="accent" onPress={onChangeSource}>
                                    <Text>{CHANGE_SOURCE_LABEL}</Text>
                                </Button>
                            ) : null}
                        </Flex>
                    ) : undefined
                }
            >
                {offerKeep ? `${issue.message} ${WHICH_DOOR}` : issue.message}
            </InlineNotice>
        </div>
    );
}
