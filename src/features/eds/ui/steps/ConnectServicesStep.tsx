/**
 * ConnectServicesStep
 *
 * Combined authentication step for GitHub and DA.live.
 * Presents both services side-by-side, allowing users to connect in any order.
 * Continue is enabled when both services are connected.
 */

import React, { useState } from 'react';
import { GitHubServiceCard, DaLiveServiceCard } from '../components';
import { useDaLiveAuth } from '../hooks/useDaLiveAuth';
import { useGitHubAuth } from '../hooks/useGitHubAuth';
import styles from '../styles/connect-services.module.css';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { useCanProceedAll } from '@/core/ui/hooks';
import type { BaseStepProps } from '@/types/wizard';

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

    // Enable Continue when both services are connected
    useCanProceedAll([gitHubAuth.isAuthenticated, daLiveAuth.isAuthenticated], setCanProceed);

    const handleDaLiveSetup = () => {
        daLiveAuth.openDaLive();
        setShowDaLiveInput(true);
    };

    const handleDaLiveSubmit = (org: string, token: string) => {
        daLiveAuth.storeTokenWithOrg(token, org);
        setShowDaLiveInput(false);
    };

    const handleDaLiveReset = () => {
        daLiveAuth.resetAuth();
        setShowDaLiveInput(true);  // Show input form directly for credential change
    };

    const handleCancelInput = () => {
        daLiveAuth.cancelAuth();
        setShowDaLiveInput(false);
    };

    return (
        <SingleColumnLayout maxWidth="900px">
            <div className={styles.servicesCardsGrid}>
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
                    onSetup={handleDaLiveSetup}
                    onSubmit={handleDaLiveSubmit}
                    onReset={handleDaLiveReset}
                    onCancelInput={handleCancelInput}
                />
            </div>
        </SingleColumnLayout>
    );
}
