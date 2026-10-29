/**
 * useRepoReadiness
 *
 * Ask the extension what the selected repository contains (empty, a
 * storefront, or something else) so the reset-to-template control can ask
 * only when there is something to lose.
 *
 * @module features/eds/ui/hooks/useRepoReadiness
 */

import { useEffect, useState } from 'react';
import type { RepoReadinessState } from '../steps/repoSelectionInline.helpers';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { GitHubRepoItem } from '@/types/webview';

/**
 * Classify the selected repo. Undefined while in flight — the gate treats that
 * as "do not block", so the step never flickers to invalid mid-check.
 *
 * @param repoMode - 'existing' or 'new'; only an existing selection is checked
 * @param selectedRepo - the list's current selection
 * @returns the verdict, or undefined while it is unknown
 */
export function useRepoReadiness(
    repoMode: string,
    selectedRepo: GitHubRepoItem | undefined,
): RepoReadinessState | undefined {
    const [readiness, setReadiness] = useState<RepoReadinessState | undefined>(undefined);

    useEffect(() => {
        if (repoMode !== 'existing' || !selectedRepo) {
            setReadiness(undefined);
            return;
        }
        const [owner, name] = selectedRepo.fullName.split('/');
        if (!owner || !name) return;

        let cancelled = false;
        setReadiness(undefined);
        webviewClient
            .request<{ success: boolean; readiness?: RepoReadinessState }>(
                'check-repo-readiness',
                { owner, repo: name },
            )
            .then((result) => {
                // A stale response must not overwrite a newer selection's answer.
                //
                // Fall back to `undetermined` rather than leaving it undefined: a
                // successful response with no `readiness` field would otherwise be
                // indistinguishable from a request still in flight, and the reset
                // control reads that distinction. Matches the catch below.
                if (!cancelled) setReadiness(result?.readiness ?? { kind: 'undetermined' });
            })
            .catch(() => {
                if (!cancelled) setReadiness({ kind: 'undetermined' });
            });
        return () => {
            cancelled = true;
        };
    }, [repoMode, selectedRepo]);

    return readiness;
}
