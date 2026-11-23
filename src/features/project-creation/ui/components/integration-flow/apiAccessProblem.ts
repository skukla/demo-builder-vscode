/**
 * apiAccessProblem — what the Add Integration dialog says when it could not read the org's APIs:
 * the outcome as its title with a status icon, and what is left to know or do
 * (`docs/development/sop/dialog-design.md`). Signed out is not retryable: Retry would re-run the
 * same unauthenticated call and fail identically, so it offers a sign-in, which reads the list
 * again once it finishes.
 *
 * @module features/project-creation/ui/components/integration-flow/apiAccessProblem
 */

import type { OrgApis } from './useOrgApis';
import type { ModalStatus } from '@/core/ui/components/ui/Modal';

export interface ApiAccessProblem {
    title: string;
    status: ModalStatus;
    lines: string[];
    /** What would put it right; none when the host gave no way to sign in. */
    action?: { label: string; onPress: () => void };
}

/**
 * @param apis - how the read stands
 * @param onSignIn - starts a user-initiated Adobe sign-in, when the host offers one
 * @returns what to say, or undefined while reading or once the list is here
 */
export function apiAccessProblemOf(apis: OrgApis, onSignIn?: () => Promise<unknown>): ApiAccessProblem | undefined {
    if (apis.loading) return undefined;
    if (apis.needsSignIn) {
        return {
            title: 'Sign In to Adobe',
            status: 'warning',
            lines: [
                'Your Adobe session has ended. Sign in to choose the APIs this app needs.',
                // The sign-in leaves VS Code: say so before it happens, or the jump reads as a glitch.
                'Adobe sign-in will open in your browser.',
            ],
            action: onSignIn
                ? { label: 'Sign In with Adobe', onPress: () => void onSignIn().then(apis.retry) }
                : undefined,
        };
    }
    if (apis.error) {
        return {
            title: "Couldn't Load Adobe APIs",
            status: 'error',
            lines: [apis.error],
            action: { label: 'Retry', onPress: apis.retry },
        };
    }
    return undefined;
}
