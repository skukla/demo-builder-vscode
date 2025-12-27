/**
 * ConnectServicesStep
 *
 * Combined authentication step for GitHub and DA.live.
 * Presents both services side-by-side, allowing users to connect in any order.
 * Continue is enabled when both services are connected.
 *
 * Supports three layout variants:
 * - "cards": Side-by-side service cards (matches selector pattern)
 * - "vertical": Stacked cards
 * - "checklist": Vertical checklist with progress indicators
 */

import React, { useEffect, useState } from 'react';
import { Flex, ActionButton, Tooltip, TooltipTrigger } from '@adobe/react-spectrum';
import ViewGrid from '@spectrum-icons/workflow/ViewGrid';
import ViewList from '@spectrum-icons/workflow/ViewList';
import ViewColumn from '@spectrum-icons/workflow/ViewColumn';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { useGitHubAuth } from '../hooks/useGitHubAuth';
import { useDaLiveAuth } from '../hooks/useDaLiveAuth';
import { GitHubServiceCard, DaLiveServiceCard } from '../components';
import type { BaseStepProps } from '@/types/wizard';
import '../styles/connect-services.css';

type LayoutVariant = 'cards' | 'vertical' | 'checklist';

/**
 * ConnectServicesStep Component
 *
 * Layout options for connecting GitHub and DA.live services.
 */
export function ConnectServicesStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps): React.ReactElement {
    const [layout, setLayout] = useState<LayoutVariant>('cards');
    const [showDaLiveInput, setShowDaLiveInput] = useState(false);

    // GitHub auth state
    const gitHubAuth = useGitHubAuth({ state, updateState });

    // DA.live auth state
    const daLiveAuth = useDaLiveAuth({ state, updateState });

    // Enable Continue when both services are connected
    useEffect(() => {
        const bothConnected = gitHubAuth.isAuthenticated && daLiveAuth.isAuthenticated;
        setCanProceed(bothConnected);
    }, [gitHubAuth.isAuthenticated, daLiveAuth.isAuthenticated, setCanProceed]);

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
        setShowDaLiveInput(false);
    };

    const handleCancelInput = () => {
        setShowDaLiveInput(false);
    };

    // Determine variant for service cards based on layout
    const cardVariant = layout === 'checklist' ? 'checklist' : 'card';
    const containerClass = layout === 'cards'
        ? 'services-cards-grid'
        : layout === 'vertical'
            ? 'services-cards-vertical'
            : 'services-checklist';

    return (
        <SingleColumnLayout maxWidth="900px">
            <Flex justifyContent="end" marginBottom="size-200">
                <Flex gap="size-50">
                    <TooltipTrigger>
                        <ActionButton
                            isQuiet
                            aria-label="Side-by-side cards"
                            onPress={() => setLayout('cards')}
                            UNSAFE_className={layout === 'cards' ? 'layout-toggle-active' : ''}
                        >
                            <ViewGrid />
                        </ActionButton>
                        <Tooltip>Side-by-side</Tooltip>
                    </TooltipTrigger>
                    <TooltipTrigger>
                        <ActionButton
                            isQuiet
                            aria-label="Vertical cards"
                            onPress={() => setLayout('vertical')}
                            UNSAFE_className={layout === 'vertical' ? 'layout-toggle-active' : ''}
                        >
                            <ViewColumn />
                        </ActionButton>
                        <Tooltip>Stacked Cards</Tooltip>
                    </TooltipTrigger>
                    <TooltipTrigger>
                        <ActionButton
                            isQuiet
                            aria-label="Checklist view"
                            onPress={() => setLayout('checklist')}
                            UNSAFE_className={layout === 'checklist' ? 'layout-toggle-active' : ''}
                        >
                            <ViewList />
                        </ActionButton>
                        <Tooltip>Checklist</Tooltip>
                    </TooltipTrigger>
                </Flex>
            </Flex>

            <div className={containerClass}>
                <GitHubServiceCard
                    isChecking={gitHubAuth.isChecking}
                    isAuthenticating={gitHubAuth.isAuthenticating}
                    isAuthenticated={gitHubAuth.isAuthenticated}
                    user={gitHubAuth.user}
                    error={gitHubAuth.error}
                    onConnect={gitHubAuth.startOAuth}
                    onChangeAccount={gitHubAuth.changeAccount}
                    variant={cardVariant}
                    compact={showDaLiveInput}
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
                    variant={cardVariant}
                />
            </div>
        </SingleColumnLayout>
    );
}
