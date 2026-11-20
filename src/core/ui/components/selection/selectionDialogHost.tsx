/**
 * SelectionStepContent's dialog side: the dialog a selection step reports to, and what it says when
 * a read is refused for want of a sign-in. Split out when the component reached its size limit.
 *
 * @module core/ui/components/selection/selectionDialogHost
 */

import React from 'react';
import { DialogOutcomeBody, type ReportOutcome } from '@/core/ui/components/ui/DialogOutcome';
import { ErrorCode } from '@/types/errorCodes';

/** The dialog a selection step sits in, when it does not fill a whole screen. */
export interface SelectionDialogFrame {
    /** Where the error and empty states go: the dialog's title and footer. */
    onOutcome: ReportOutcome;
    /** Tells the dialog a silent wait is on, so it leaves only the way out. */
    onWaiting: (waiting: boolean) => void;
    /** Starts a user-initiated Adobe sign-in, when the dialog's host offers one. */
    onSignIn?: () => Promise<unknown>;
}

/** The frame, and how to make the thing an empty list lacks, which the field around the list knows. */
export interface SelectionDialogHost extends SelectionDialogFrame {
    onCreate: () => void;
}

/** The refusal of a read that needs a sign-in. Reading again cannot help (`requireAdobeAuth`). */
export function isSignedOut(code: ErrorCode | null | undefined): boolean {
    return code === ErrorCode.AUTH_REQUIRED || code === ErrorCode.AUTH_EXPIRED;
}

/** A read refused for want of a sign-in, in a dialog: the title says so and sign-in is the action. */
export function SignedOutOutcome({ host, onLoad }: { host: SelectionDialogHost; onLoad: () => void }): React.ReactElement {
    const { onSignIn } = host;
    return (
        <DialogOutcomeBody
            onOutcome={host.onOutcome}
            outcome={{
                title: 'Sign In to Adobe',
                status: 'warning',
                lines: ['Adobe sign-in will open in your browser.'],
                actions: onSignIn
                    ? [{ label: 'Sign In with Adobe', onPress: () => void onSignIn().then(onLoad) }]
                    : [],
            }}
        />
    );
}
