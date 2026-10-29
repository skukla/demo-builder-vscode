/**
 * DefaultBranchNotice
 *
 * The warning shown above the repository list when the chosen repository's
 * default branch is not `main`.
 *
 * @module features/eds/ui/steps/DefaultBranchNotice
 */

import React from 'react';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import type { GitHubRepoItem } from '@/types/webview';

/**
 * The non-`main` default-branch notice.
 *
 * A NOTICE, not a full-pane `StatusDisplay`: nothing here is fatal and the repo
 * picker below stays usable. Rendered as a wall once (2026-08-20) and it
 * swallowed the list while Continue was one checkbox away.
 *
 * Returns null when the branch is fine or unknown — unknown is not a fault (a
 * repo list cached before `defaultBranch` existed carries none).
 *
 * @param selectedRepo - The chosen repo, if any
 * @returns The notice, or null
 */
export function DefaultBranchNotice({
    selectedRepo,
}: {
    selectedRepo?: GitHubRepoItem;
}): React.ReactElement | null {
    const branch = selectedRepo?.defaultBranch;
    if (!selectedRepo || !branch || branch === 'main') return null;

    return (
        <InlineNotice
            title="This repository uses a different default branch"
            testId="default-branch-notice"
        >
            Demo Builder builds storefronts from <strong>main</strong>, and {selectedRepo.fullName}{' '}
            defaults to <strong>{branch}</strong>. Rename its default branch to main on GitHub, or
            choose a different repository.
        </InlineNotice>
    );
}
