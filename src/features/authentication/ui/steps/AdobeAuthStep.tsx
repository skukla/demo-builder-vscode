import Key from '@spectrum-icons/workflow/Key';
import Login from '@spectrum-icons/workflow/Login';
import Refresh from '@spectrum-icons/workflow/Refresh';
import React from 'react';
import { useAuthStatus } from '../hooks/useAuthStatus';
import { getOrgSelectionMessage } from './authHelpers';
import {
    isTokenExpiringSoon,
    isAuthenticatedWithOrg,
    needsOrgSelection,
    isNotAuthenticated,
    hasAuthError,
    hasAuthTimeout,
} from './authPredicates';
import { AuthLoadingState } from './components/AuthLoadingState';
import { StatusDisplay, type StatusDisplayProps } from '@/core/ui/components/feedback/StatusDisplay';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { DialogOutcomeBody, type DialogOutcome, type ReportOutcome } from '@/core/ui/components/ui/DialogOutcome';
import type { ModalStatus } from '@/core/ui/components/ui/Modal';
import { ErrorCode } from '@/types/errorCodes';
import type { AdobeAuthSessionState } from '@/types/webview';
import { NavigableStepProps } from '@/types/wizard';

// Session-state props: this step is ALSO hosted outside the wizard (the Add
// Integration modal's sign-in stage), where the host synthesizes a partial
// store. Everything it reads is optional either way.
type AdobeAuthStepProps = Omit<NavigableStepProps, 'state'> & {
    state: AdobeAuthSessionState;
    /**
     * Hosted in a dialog: where its outcome goes, the dialog's title and footer (the dialog
     * design rules). A whole wizard screen has no title bar, so it draws the large centred
     * `StatusDisplay` instead, and passes nothing here.
     */
    onOutcome?: ReportOutcome;
};

/** What the views read, from `useAuthStatus` and the step's state. */
interface AuthViewInputs {
    state: AdobeAuthSessionState;
    authStatus?: string;
    authSubMessage?: string;
    authTimeout: boolean;
    checkAuthentication: () => void;
    handleLogin: (force?: boolean) => void;
}

/** A signed-in session's views: about to expire, connected, or with no org yet. */
function sessionViews({ state, handleLogin }: AuthViewInputs): StatusDisplayProps[] {
    const { adobeAuth, adobeOrg } = state;
    // Switching orgs requires re-authentication: IMS tokens are org-bound, so the
    // only way to reach a different org is a forced sign-in, where the browser
    // presents the account/org chooser. The wizard then reflects whichever org you
    // land on. See .rptc/plans/adobe-org-context-self-heal/overview.md.
    const switchAccount = () => handleLogin(true);
    const views: StatusDisplayProps[] = [];
    if (isTokenExpiringSoon(adobeAuth)) {
        views.push({
            variant: 'warning',
            title: 'Session Expiring Soon',
            message: `Your Adobe session expires in ${adobeAuth.tokenExpiresIn || 0} ${adobeAuth.tokenExpiresIn === 1 ? 'minute' : 'minutes'}. Please re-authenticate to avoid interruption during project setup.`,
            centerMessage: true,
            maxWidth: '520px',
            actions: [{ label: 'Re-Authenticate Now', icon: <Login size="S" />, variant: 'accent', onPress: () => handleLogin(true) }],
        });
    }
    if (isAuthenticatedWithOrg(adobeAuth, adobeOrg) && adobeOrg) {
        views.push({
            variant: 'success',
            title: 'Connected',
            message: adobeOrg.name ?? adobeOrg.id,
            actions: [{ label: 'Switch IMS Org', icon: <Login size="S" />, variant: 'secondary', onPress: switchAccount }],
        });
    }
    if (needsOrgSelection(adobeAuth, adobeOrg)) {
        views.push({
            variant: 'warning',
            title: 'Select Your Organization',
            message: getOrgSelectionMessage(adobeAuth),
            centerMessage: true,
            maxWidth: '520px',
            actions: [{ label: 'Switch IMS Org', icon: <Login size="S" />, variant: 'accent', onPress: switchAccount }],
        });
    }
    return views;
}

/** What a sign-in that did not land says: the account has no App Builder, or the connection failed. */
function authErrorView({ state, authSubMessage, checkAuthentication, handleLogin }: AuthViewInputs): StatusDisplayProps {
    const noAppBuilder = state.adobeAuth.code === ErrorCode.AUTH_NO_APP_BUILDER;
    return {
        variant: noAppBuilder ? 'warning' : 'error',
        title: noAppBuilder ? 'Insufficient Privileges' : 'Connection Issue',
        message: authSubMessage || (noAppBuilder
            ? 'You need Developer or System Admin role in an Adobe organization with App Builder access.'
            : "Couldn't connect to Adobe services. Check your internet connection."),
        centerMessage: true,
        maxWidth: '520px',
        actions: noAppBuilder
            ? [{ label: 'Sign In with a Different Account', icon: <Login size="S" />, variant: 'accent', onPress: () => handleLogin(true) }]
            : [
                { label: 'Retry', icon: <Refresh size="S" />, variant: 'secondary', onPress: () => checkAuthentication() },
                { label: 'Sign In Again', icon: <Login size="S" />, variant: 'accent', onPress: () => handleLogin(false) },
            ],
    };
}

/** The views with no session: signed out, a sign-in that failed, or one that timed out. */
function signedOutViews(inputs: AuthViewInputs): StatusDisplayProps[] {
    const { state, authStatus, authSubMessage, authTimeout, handleLogin } = inputs;
    const { adobeAuth } = state;
    const views: StatusDisplayProps[] = [];
    if (isNotAuthenticated(adobeAuth, authTimeout)) {
        views.push({
            variant: 'info',
            icon: <Key UNSAFE_className="text-gray-500" size="L" />,
            title: authStatus || 'Sign In to Adobe',
            message: authSubMessage || 'Connect your Adobe account to create and deploy App Builder applications.',
            centerMessage: true,
            maxWidth: '520px',
            actions: [{ label: 'Sign In with Adobe', icon: <Login size="S" />, variant: 'accent', onPress: () => handleLogin(false) }],
        });
    }
    if (hasAuthError(adobeAuth, authTimeout)) views.push(authErrorView(inputs));
    if (hasAuthTimeout(adobeAuth, authTimeout)) {
        views.push({
            variant: 'error',
            title: 'Authentication Timed Out',
            message: 'The browser authentication window may have been closed or the session expired.',
            centerMessage: true,
            maxWidth: '520px',
            actions: [{ label: 'Retry Login', icon: <Login size="S" />, variant: 'accent', onPress: () => handleLogin(false) }],
        });
    }
    return views;
}

/** Green done, amber needs the SC, red failed. Signing in is the SC's to do, so it is amber. */
function statusOf(variant: StatusDisplayProps['variant']): ModalStatus {
    if (variant === 'error') return 'error';
    return variant === 'success' ? 'success' : 'warning';
}

/** A view as a dialog says it: outcome in the title, action in the footer, no icon or width. */
function outcomeOf(view: StatusDisplayProps): DialogOutcome {
    return {
        title: view.title ?? '',
        status: statusOf(view.variant),
        lines: view.message ? [view.message] : [],
        // The main action is drawn last in a dialog's footer, wherever the view lists it.
        actions: [...(view.actions ?? [])]
            .sort((a, b) => Number(a.variant === 'accent') - Number(b.variant === 'accent'))
            .map(({ label, onPress }) => ({ label, onPress })),
    };
}

export function AdobeAuthStep({ state, updateState, setCanProceed, onOutcome }: AdobeAuthStepProps) {
    const {
        authStatus,
        authSubMessage,
        authTimeout,
        showLoadingSpinner,
        checkAuthentication,
        handleLogin,
    } = useAuthStatus({ state, updateState, setCanProceed });

    const inputs: AuthViewInputs = { state, authStatus, authSubMessage, authTimeout, checkAuthentication, handleLogin };
    const views = [...sessionViews(inputs), ...signedOutViews(inputs)];
    const loading = (showLoadingSpinner || state.adobeAuth.isAuthenticated === undefined) && !authTimeout;
    const loadingView = loading && (
        <AuthLoadingState
            message={authStatus || 'Connecting to Adobe services'}
            subMessage={authSubMessage}
            helperText="This could take up to 1 minute"
        />
    );

    // Hosted in a dialog: one outcome at a time, with no page layout of its own.
    if (onOutcome) {
        if (loadingView) return loadingView;
        return views[0] ? <DialogOutcomeBody outcome={outcomeOf(views[0])} onOutcome={onOutcome} /> : null;
    }

    return (
        <SingleColumnLayout>
            {loadingView}
            {views.map((view) => (
                <StatusDisplay key={view.title} {...view} />
            ))}
        </SingleColumnLayout>
    );
}
