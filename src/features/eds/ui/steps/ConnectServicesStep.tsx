/**
 * ConnectServicesStep
 *
 * Combined authentication step for GitHub and DA.live.
 * Presents both services side-by-side, allowing users to connect in any order.
 * Continue is enabled when both services are connected.
 */

import React, { useState } from 'react';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { useCanProceedAll } from '@/core/ui/hooks';
import { vscode } from '@/core/ui/utils/vscode-api';
import { useGitHubAuth } from '../hooks/useGitHubAuth';
import { useDaLiveAuth } from '../hooks/useDaLiveAuth';
import { getBookmarkletSetupPageUrl } from '../helpers/bookmarkletSetupPage';
import { GitHubServiceCard, DaLiveServiceCard } from '../components';
import type { BaseStepProps } from '@/types/wizard';
import '../styles/connect-services.css';

/**
 * ConnectServicesStep Component
 *
 * Side-by-side cards for connecting GitHub and DA.live services.
 */
export function ConnectServicesStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps): React.ReactElement {
    const [showDaLiveInput, setShowDaLiveInput] = useState(false);

    // GitHub auth state
    const gitHubAuth = useGitHubAuth({ state, updateState });

    // DA.live auth state
    const daLiveAuth = useDaLiveAuth({ state, updateState });

    // Enable Continue when both services are connected AND verification is complete
    // Must wait for isChecking to complete to handle expired tokens in edit mode
    useCanProceedAll([
        gitHubAuth.isAuthenticated && !gitHubAuth.isChecking,
        daLiveAuth.isAuthenticated && !daLiveAuth.isChecking,
    ], setCanProceed);

    const handleDaLiveSetup = () => {
        if (!daLiveAuth.setupComplete && daLiveAuth.bookmarkletUrl) {
            // First time: open the bookmarklet setup page in browser
            vscode.postMessage('openExternal', {
                url: getBookmarkletSetupPageUrl(daLiveAuth.bookmarkletUrl),
            });
        } else {
            // Returning user: open da.live directly
            daLiveAuth.openDaLive();
        }
        setShowDaLiveInput(true);
    };

    const handleDaLiveSubmit = (org: string, token: string) => {
        daLiveAuth.storeTokenWithOrg(token, org);
        setShowDaLiveInput(false);
    };

    const handleDaLiveReset = () => {
        setShowDaLiveInput(true);
    };

    const handleCancelInput = () => {
        setShowDaLiveInput(false);
        daLiveAuth.cancelAuth();
    };

    return (
        <SingleColumnLayout maxWidth="900px">
            <div className="services-cards-grid">
                <GitHubServiceCard
                    isChecking={gitHubAuth.isChecking}
                    isAuthenticating={gitHubAuth.isAuthenticating}
                    isAuthenticated={gitHubAuth.isAuthenticated}
                    user={gitHubAuth.user}
                    error={gitHubAuth.error}
                    onConnect={gitHubAuth.startOAuth}
                    onChangeAccount={gitHubAuth.changeAccount}
                />
                <DaLiveServiceCard
                    isChecking={daLiveAuth.isChecking}
                    isAuthenticating={daLiveAuth.isAuthenticating && !showDaLiveInput}
                    isAuthenticated={daLiveAuth.isAuthenticated}
                    verifiedOrg={daLiveAuth.verifiedOrg}
                    error={daLiveAuth.error}
                    showInput={showDaLiveInput}
                    setupComplete={daLiveAuth.setupComplete}
                    defaultOrg={state.edsConfig?.daLiveOrg}
                    onSetup={handleDaLiveSetup}
                    onSubmit={handleDaLiveSubmit}
                    onReset={handleDaLiveReset}
                    onCancelInput={handleCancelInput}
                    onOpenDaLive={daLiveAuth.openDaLive}
                />
            </div>
        </SingleColumnLayout>
    );
}
