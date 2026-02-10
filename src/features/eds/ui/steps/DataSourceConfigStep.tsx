/**
 * DataSourceConfigStep (DA.live Content Configuration)
 *
 * Wizard step that auto-derives the DA.live site name from the GitHub repository name.
 * The DA.live site must match the repo name for Helix content resolution to work
 * without the Configuration Service (which requires admin access we don't have).
 *
 * Uses the SingleColumnLayout + StatusDisplay pattern (same as DaLiveSetupStep's
 * connected state) since this is a confirmation step with no selection needed.
 *
 * Features:
 * - Auto-derives site name from repoName (read-only)
 * - Checks if site already exists in the DA.live org
 * - Shows "Reset content" option for existing sites
 * - Auto-proceeds once site existence check completes
 */

import React, { useEffect, useCallback } from 'react';
import {
    Checkbox,
    Flex,
    Text,
    View,
} from '@adobe/react-spectrum';
import Alert from '@spectrum-icons/workflow/Alert';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { useSelectionStep } from '@/core/ui/hooks';
import type { DaLiveSiteItem } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';
import '../styles/eds-steps.css';

/**
 * DataSourceConfigStep Component
 *
 * Auto-derives the DA.live site name from the GitHub repo name.
 * Helix resolves content correctly when site name = repo name without
 * needing the Configuration Service.
 */
export function DataSourceConfigStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps): React.ReactElement {
    const edsConfig = state.edsConfig;
    const repoName = edsConfig?.repoName || '';
    const resetSiteContent = edsConfig?.resetSiteContent || false;
    const daLiveOrg = edsConfig?.daLiveOrg || '';

    // Use selection step hook to load site list and check if site exists
    const {
        items: sites,
        showLoading,
        isLoading,
        hasLoadedOnce,
        error,
        refresh,
    } = useSelectionStep<DaLiveSiteItem>({
        cacheKey: 'daLiveSitesCache',
        messageType: 'get-dalive-sites',
        messagePayload: { orgName: daLiveOrg },
        errorMessageType: 'get-dalive-sites-error',
        state,
        updateState,
        selectedItem: undefined,
        searchFilterKey: 'daLiveSiteSearchFilter',
        autoSelectSingle: false,
        autoLoad: !!daLiveOrg,
        searchFields: ['name'],
        onSelect: () => {},
    });

    // Determine if the auto-derived site already exists
    const siteExists = hasLoadedOnce ? sites.some(s => s.name === repoName) : null;

    /**
     * Update EDS config state
     */
    const updateEdsConfig = useCallback((updates: Partial<typeof edsConfig>) => {
        updateState({
            edsConfig: {
                ...edsConfig,
                accsHost: edsConfig?.accsHost || '',
                storeViewCode: edsConfig?.storeViewCode || '',
                customerGroup: edsConfig?.customerGroup || '',
                repoName: edsConfig?.repoName || '',
                daLiveOrg: edsConfig?.daLiveOrg || '',
                daLiveSite: edsConfig?.daLiveSite || '',
                ...updates,
            },
        });
    }, [edsConfig, updateState]);

    // Auto-set daLiveSite = repoName on mount and when repoName changes
    useEffect(() => {
        if (repoName) {
            updateEdsConfig({
                daLiveSite: repoName,
                selectedSite: siteExists
                    ? { id: repoName, name: repoName }
                    : undefined,
            });
        }
    }, [repoName, siteExists]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Handle reset site content checkbox change
     */
    const handleResetSiteContentChange = useCallback((isSelected: boolean) => {
        updateEdsConfig({ resetSiteContent: isSelected });
    }, [updateEdsConfig]);

    // Auto-set canProceed once site existence check completes
    useEffect(() => {
        const ready = !!repoName && hasLoadedOnce && !isLoading;
        setCanProceed(ready);
    }, [repoName, hasLoadedOnce, isLoading, setCanProceed]);

    // Loading state
    if (showLoading || (isLoading && !hasLoadedOnce)) {
        return (
            <SingleColumnLayout>
                <CenteredFeedbackContainer>
                    <LoadingDisplay
                        size="L"
                        message="Checking DA.live sites..."
                        subMessage={`Looking for "${repoName}" in ${daLiveOrg}`}
                    />
                </CenteredFeedbackContainer>
            </SingleColumnLayout>
        );
    }

    // Error state
    if (error && !isLoading) {
        return (
            <SingleColumnLayout>
                <CenteredFeedbackContainer>
                    <StatusDisplay
                        variant="error"
                        title="Error Checking Sites"
                        message={error}
                        actions={[{ label: 'Try Again', onPress: refresh, variant: 'accent' }]}
                    />
                </CenteredFeedbackContainer>
            </SingleColumnLayout>
        );
    }

    // Existing site — show success with reset option
    if (siteExists) {
        return (
            <SingleColumnLayout>
                <CenteredFeedbackContainer>
                    <StatusDisplay
                        variant="success"
                        title={`${daLiveOrg}/${repoName}`}
                        message="Existing site found. Content will be preserved unless you choose to reset below."
                    />
                </CenteredFeedbackContainer>

                {/* Reset content option */}
                <Flex direction="column" gap="size-100" marginTop="size-200">
                    <Checkbox
                        isSelected={resetSiteContent}
                        onChange={handleResetSiteContentChange}
                    >
                        Reset content (replaces all content)
                    </Checkbox>

                    {/* Warning notice */}
                    <View
                        marginStart="size-300"
                        minHeight="size-250"
                        UNSAFE_className="reset-warning-container"
                    >
                        <Flex
                            alignItems="center"
                            gap="size-100"
                            UNSAFE_className={resetSiteContent ? 'reset-warning-visible' : 'reset-warning-hidden'}
                        >
                            <Alert size="S" UNSAFE_className="text-orange-500 flex-shrink-0" />
                            <Text UNSAFE_className="text-xs text-orange-600">
                                This will delete all existing content and repopulate with demo content.
                            </Text>
                        </Flex>
                    </View>
                </Flex>
            </SingleColumnLayout>
        );
    }

    // New site — show info status
    return (
        <SingleColumnLayout>
            <CenteredFeedbackContainer>
                <StatusDisplay
                    variant="info"
                    title={`${daLiveOrg}/${repoName}`}
                    message="New site — will be created during setup."
                />
            </CenteredFeedbackContainer>
        </SingleColumnLayout>
    );
}
