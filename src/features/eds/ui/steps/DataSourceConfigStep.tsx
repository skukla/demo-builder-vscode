/**
 * DataSourceConfigStep (DA.live Project Configuration)
 *
 * Wizard step for selecting or creating a DA.live site for Edge Delivery Services (EDS) projects.
 * The DA.live organization is already configured in the Connect Services step.
 *
 * Features:
 * - Site list from verified org
 * - Option to create new site
 * - Auto-loads sites on mount (org already verified)
 *
 * Note: Commerce backend settings (ACCS or PaaS) are handled by the Settings Collection step,
 * which dynamically renders fields based on the selected stack's backend component.
 */

// Note: Heading is still used for the "Create New Site" subsection (level={3})
import Add from '@spectrum-icons/workflow/Add';
import Close from '@spectrum-icons/workflow/Close';
import Info from '@spectrum-icons/workflow/Info';
import React, { useEffect, useState, useCallback } from 'react';
import {
    ActionButton,
    Button,
    Flex,
    Heading,
    Text,
    TextField,
    View,
    List,
    ListItem,
} from '@/core/ui/components/aria';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { useSelectionStep } from '@/core/ui/hooks';
import type { DaLiveSiteItem } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';

/** Validate site name format */
function isValidSiteName(name: string): boolean {
    // DA.live site names: lowercase alphanumeric and hyphens, must start with letter
    return /^[a-z][a-z0-9-]*$/.test(name);
}

/**
 * DataSourceConfigStep Component
 *
 * Select or create a DA.live site for your EDS project.
 * The organization was already verified in Connect Services step.
 */
export function DataSourceConfigStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps): React.ReactElement {
    const edsConfig = state.edsConfig;
    const selectedSite = edsConfig?.selectedSite;
    const daLiveOrg = edsConfig?.daLiveOrg || '';
    const daLiveSite = edsConfig?.daLiveSite || '';

    // Local state
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [siteNameError, setSiteNameError] = useState<string | undefined>();

    // Use selection step hook for site list (auto-loads since org is pre-verified)
    const {
        items: sites,
        filteredItems: filteredSites,
        showLoading,
        isLoading,
        isRefreshing,
        hasLoadedOnce,
        error,
        searchQuery,
        setSearchQuery,
        refresh,
        selectItem,
    } = useSelectionStep<DaLiveSiteItem>({
        cacheKey: 'daLiveSitesCache',
        messageType: 'get-dalive-sites',
        messagePayload: { orgName: daLiveOrg },
        errorMessageType: 'get-dalive-sites-error',
        state,
        updateState,
        selectedItem: selectedSite,
        searchFilterKey: 'daLiveSiteSearchFilter',
        autoSelectSingle: false,
        autoLoad: !!daLiveOrg,  // Auto-load when org is available
        searchFields: ['name'],
        onSelect: (site) => {
            setIsCreatingNew(false);
            updateEdsConfig({
                selectedSite: site,
                daLiveSite: site.name,
            });
        },
    });

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

    /**
     * Handle creating a new site
     */
    const handleCreateNew = useCallback(() => {
        setIsCreatingNew(true);
        updateEdsConfig({
            selectedSite: undefined,
            daLiveSite: '',
        });
    }, [updateEdsConfig]);

    /**
     * Cancel creating new site (go back to list)
     */
    const handleCancelNew = useCallback(() => {
        setIsCreatingNew(false);
        setSiteNameError(undefined);
    }, []);

    /**
     * Handle site name change (for new site)
     */
    const handleSiteNameChange = useCallback((value: string) => {
        // Convert to lowercase automatically
        const normalizedValue = value.toLowerCase();
        setSiteNameError(undefined);
        updateEdsConfig({ daLiveSite: normalizedValue });
    }, [updateEdsConfig]);

    /**
     * Validate site name on blur
     */
    const handleSiteNameBlur = useCallback(() => {
        if (daLiveSite && !isValidSiteName(daLiveSite)) {
            setSiteNameError('Must start with a letter and contain only lowercase letters, numbers, and hyphens');
        }
    }, [daLiveSite]);

    // Update canProceed based on site selection
    useEffect(() => {
        const isNewValid = isCreatingNew && daLiveSite.trim() !== '' && isValidSiteName(daLiveSite);
        const isExistingValid = !isCreatingNew && !!selectedSite;
        setCanProceed(isNewValid || isExistingValid);
    }, [isCreatingNew, daLiveSite, selectedSite, setCanProceed]);

    // Loading state
    if (showLoading || (isLoading && !hasLoadedOnce)) {
        return (
            <SingleColumnLayout>
                <CenteredFeedbackContainer>
                    <LoadingDisplay
                        size="L"
                        message="Loading sites..."
                        subMessage={`Fetching sites from ${daLiveOrg}`}
                    />
                </CenteredFeedbackContainer>
            </SingleColumnLayout>
        );
    }

    // Error state
    if (error && !isLoading) {
        return (
            <SingleColumnLayout>
                <StatusDisplay
                    variant="error"
                    title="Error Loading Sites"
                    message={error}
                    actions={[{ label: 'Try Again', onPress: refresh, variant: 'accent' }]}
                />
            </SingleColumnLayout>
        );
    }

    // Empty state
    if (sites.length === 0 && !isLoading && !isCreatingNew) {
        return (
            <SingleColumnLayout>
                <EmptyState
                    title="No Sites Found"
                    description={`No existing sites found in ${daLiveOrg}.`}
                >
                    <Button variant="accent" onPress={handleCreateNew}>
                        <Add size="S" />
                        <Text>Create New Site</Text>
                    </Button>
                </EmptyState>
            </SingleColumnLayout>
        );
    }

    return (
        <SingleColumnLayout>
            {/* Site Selection */}
            {!isCreatingNew && (
                <>
                    {/* Search + New button row */}
                    <Flex alignItems="start" gap="size-200" className="mb-100">
                        <View className="flex-1">
                            <SearchHeader
                                searchQuery={searchQuery}
                                onSearchQueryChange={setSearchQuery}
                                searchPlaceholder="Filter sites..."
                                searchThreshold={0}
                                totalCount={sites.length}
                                filteredCount={filteredSites.length}
                                itemNoun="site"
                                onRefresh={refresh}
                                isRefreshing={isRefreshing}
                                refreshAriaLabel="Refresh sites"
                                hasLoadedOnce={hasLoadedOnce}
                                alwaysShowCount={true}
                            />
                        </View>
                        <Button variant="accent" onPress={handleCreateNew}>
                            <Add size="S" />
                            <Text>New</Text>
                        </Button>
                    </Flex>

                    {/* Site list */}
                    <List
                        items={filteredSites}
                        selectionMode="single"
                        selectedKeys={selectedSite ? new Set([selectedSite.id]) : undefined}
                        onSelectionChange={(keys) => {
                            if (keys instanceof Set && keys.size > 0) {
                                const itemId = Array.from(keys)[0] as string;
                                const item = filteredSites.find(s => s.id === itemId);
                                if (item) {
                                    selectItem(item);
                                }
                            }
                        }}
                        aria-label="DA.live Sites"
                        className="site-list"
                    >
                        {(item: typeof filteredSites[0]) => (
                            <ListItem key={item.id} id={item.id} textValue={item.name}>
                                <Flex direction="column" gap="size-50">
                                    <Text>{item.name}</Text>
                                    {item.lastModified && (
                                        <Text className="text-xs text-gray-500">
                                            Last modified: {new Date(item.lastModified).toLocaleDateString()}
                                        </Text>
                                    )}
                                </Flex>
                            </ListItem>
                        )}
                    </List>

                    {/* No results */}
                    {searchQuery && filteredSites.length === 0 && (
                        <Flex justifyContent="center" className="centered-padding-md">
                            <Text className="description-text">
                                No sites match "{searchQuery}"
                            </Text>
                        </Flex>
                    )}
                </>
            )}

            {/* Create New Site form */}
            {isCreatingNew && (
                <div
                    className="p-300"
                    style={{ backgroundColor: 'var(--spectrum-global-color-gray-50)', borderRadius: 'var(--spectrum-alias-border-radius-regular)' }}
                >
                    <Flex justifyContent="space-between" alignItems="center" className="mb-200">
                        <Heading level={3} className="m-0">Create New Site</Heading>
                        <ActionButton onPress={handleCancelNew}>
                            <Close size="S" />
                            <Text>Cancel</Text>
                        </ActionButton>
                    </Flex>

                    <TextField
                        label="Site Name"
                        value={daLiveSite}
                        onChange={handleSiteNameChange}
                        onBlur={handleSiteNameBlur}
                        validationState={siteNameError ? 'invalid' : undefined}
                        errorMessage={siteNameError}
                        placeholder="my-site"
                        description={`Will be created at da.live/${daLiveOrg}/${daLiveSite || 'my-site'}`}
                        className="w-full"
                        isRequired
                        autoFocus
                    />

                    <Flex alignItems="center" gap="size-150" className="mt-200">
                        <span className="text-blue-500"><Info size="S" /></span>
                        <Text className="text-sm text-gray-600">
                            A new site will be created with the selected template content.
                        </Text>
                    </Flex>
                </div>
            )}

            <style>{`
                .text-sm { font-size: 0.875rem; }
                .text-xs { font-size: 0.75rem; }
                .text-gray-500 { color: var(--spectrum-global-color-gray-500); }
                .text-gray-600 { color: var(--spectrum-global-color-gray-600); }
                .text-blue-500 { color: var(--spectrum-global-color-blue-500); }
                .py-4 { padding-top: 1rem; padding-bottom: 1rem; }
                .site-list {
                    max-height: 320px;
                    border: 1px solid var(--spectrum-global-color-gray-300);
                    border-radius: 4px;
                }
            `}</style>
        </SingleColumnLayout>
    );
}
