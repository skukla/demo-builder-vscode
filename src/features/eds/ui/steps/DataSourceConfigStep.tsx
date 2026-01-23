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

import React, { useEffect, useState, useCallback } from 'react';
import {
    Button,
    Checkbox,
    Divider,
    Flex,
    Heading,
    Item,
    ListView,
    Text,
    TextField,
    View,
} from '@adobe/react-spectrum';
// Note: Heading is still used for the "Create New Site" subsection (level={3})
import Add from '@spectrum-icons/workflow/Add';
import Alert from '@spectrum-icons/workflow/Alert';
import Info from '@spectrum-icons/workflow/Info';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { StatusSection } from '@/core/ui/components/wizard';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { useSelectionStep } from '@/core/ui/hooks';
import { normalizeIdentifierName } from '@/core/validation/normalizers';
import type { DaLiveSiteItem } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';
import '../styles/eds-steps.css';

/** Validate site name format */
function isValidSiteName(name: string): boolean {
    // DA.live site names: lowercase alphanumeric and hyphens, must start with letter
    return /^[a-z][a-z0-9-]*$/.test(name);
}

/**
 * ContentConfigurationSummary - Right column summary for content selection
 */
interface ContentConfigurationSummaryProps {
    daLiveOrg?: string;
    selectedSite?: DaLiveSiteItem;
    isCreatingNew: boolean;
    newSiteName: string;
}

function ContentConfigurationSummary({
    daLiveOrg,
    selectedSite,
    isCreatingNew,
    newSiteName,
}: ContentConfigurationSummaryProps) {
    // Build display value for site
    const getSiteDisplayValue = () => {
        if (isCreatingNew) {
            if (newSiteName && daLiveOrg) {
                return `${daLiveOrg}/${newSiteName}`;
            }
            return newSiteName || undefined;
        }
        return selectedSite?.name;
    };

    const siteDisplayValue = getSiteDisplayValue();
    const isSiteComplete = isCreatingNew ? !!newSiteName : !!selectedSite;

    return (
        <View height="100%">
            <Heading level={3} marginBottom="size-300">
                Configuration Summary
            </Heading>

            {/* DA.live Organization */}
            <StatusSection
                label="DA.live Organization"
                value={daLiveOrg}
                status={daLiveOrg ? 'completed' : 'empty'}
                emptyText="Not connected"
            />

            <Divider size="S" />

            {/* Site Selection */}
            <StatusSection
                label="DA.live Site"
                value={siteDisplayValue}
                status={isSiteComplete ? 'completed' : 'empty'}
                emptyText={isCreatingNew ? 'Enter site name' : 'Not selected'}
            />
        </View>
    );
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
    const resetSiteContent = edsConfig?.resetSiteContent || false;
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
                resetSiteContent: false, // Reset checkbox when selecting a site
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
     * Uses shared normalizer for consistent identifier formatting
     */
    const handleSiteNameChange = useCallback((value: string) => {
        const normalizedValue = normalizeIdentifierName(value);
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

    /**
     * Handle reset site content checkbox change
     */
    const handleResetSiteContentChange = useCallback((isSelected: boolean) => {
        updateEdsConfig({ resetSiteContent: isSelected });
    }, [updateEdsConfig]);

    /**
     * Handle list selection change
     */
    const handleSelectionChange = useCallback((keys: 'all' | Set<React.Key>) => {
        if (keys === 'all') return;
        const itemId = Array.from(keys)[0] as string;
        const item = sites.find(s => s.id === itemId);
        if (item) {
            selectItem(item);
        }
    }, [sites, selectItem]);

    // Update canProceed based on site selection
    useEffect(() => {
        const isNewValid = isCreatingNew && daLiveSite.trim() !== '' && isValidSiteName(daLiveSite);
        const isExistingValid = !isCreatingNew && !!selectedSite;
        setCanProceed(isNewValid || isExistingValid);
    }, [isCreatingNew, daLiveSite, selectedSite, setCanProceed]);

    // Loading state
    if (showLoading || (isLoading && !hasLoadedOnce)) {
        return (
            <TwoColumnLayout
                leftContent={
                    <CenteredFeedbackContainer>
                        <LoadingDisplay
                            size="L"
                            message="Loading sites..."
                            subMessage={`Fetching sites from ${daLiveOrg}`}
                        />
                    </CenteredFeedbackContainer>
                }
                rightContent={
                    <ContentConfigurationSummary
                        daLiveOrg={daLiveOrg}
                        selectedSite={selectedSite}
                        isCreatingNew={isCreatingNew}
                        newSiteName={daLiveSite}
                    />
                }
            />
        );
    }

    // Error state
    if (error && !isLoading) {
        return (
            <TwoColumnLayout
                leftContent={
                    <StatusDisplay
                        variant="error"
                        title="Error Loading Sites"
                        message={error}
                        actions={[{ label: 'Try Again', onPress: refresh, variant: 'accent' }]}
                    />
                }
                rightContent={
                    <ContentConfigurationSummary
                        daLiveOrg={daLiveOrg}
                        selectedSite={selectedSite}
                        isCreatingNew={isCreatingNew}
                        newSiteName={daLiveSite}
                    />
                }
            />
        );
    }

    // Empty state
    if (sites.length === 0 && !isLoading && !isCreatingNew) {
        return (
            <TwoColumnLayout
                leftContent={
                    <EmptyState
                        title="No Sites Found"
                        description={`No existing sites found in ${daLiveOrg}.`}
                    >
                        <Button variant="accent" onPress={handleCreateNew}>
                            <Add size="S" />
                            <Text>Create New Site</Text>
                        </Button>
                    </EmptyState>
                }
                rightContent={
                    <ContentConfigurationSummary
                        daLiveOrg={daLiveOrg}
                        selectedSite={selectedSite}
                        isCreatingNew={isCreatingNew}
                        newSiteName={daLiveSite}
                    />
                }
            />
        );
    }

    return (
        <TwoColumnLayout
            leftContent={<>
            {/* Site Selection */}
            {!isCreatingNew && (
                <>
                    {/* Search + New button row */}
                    <Flex alignItems="start" gap="size-200" marginBottom="size-100">
                        <View flex>
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
                    <ListView
                        items={filteredSites}
                        selectionMode="single"
                        selectedKeys={selectedSite ? [selectedSite.id] : []}
                        onSelectionChange={handleSelectionChange}
                        aria-label="DA.live Sites"
                        density="spacious"
                        UNSAFE_className="site-list"
                    >
                        {(item) => (
                            <Item key={item.id} textValue={item.name}>
                                <Text>{item.name}</Text>
                                {item.lastModified && (
                                    <Text slot="description" UNSAFE_className="text-xs text-gray-500">
                                        Last modified: {new Date(item.lastModified).toLocaleDateString()}
                                    </Text>
                                )}
                            </Item>
                        )}
                    </ListView>

                    {/* Reset site content option - only show when site is selected and not loading */}
                    {selectedSite && !showLoading && (
                        <Flex direction="column" gap="size-100" marginTop="size-300">
                            <Checkbox
                                isSelected={resetSiteContent}
                                onChange={handleResetSiteContentChange}
                            >
                                Reset content (replaces all content)
                            </Checkbox>

                            {/* Warning notice - fixed height container prevents layout jump */}
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
                    )}

                    {/* No results */}
                    {searchQuery && filteredSites.length === 0 && (
                        <Flex justifyContent="center" UNSAFE_className="centered-padding-md">
                            <Text UNSAFE_className="description-text">
                                No sites match "{searchQuery}"
                            </Text>
                        </Flex>
                    )}
                </>
            )}

            {/* Create New Site form */}
            {isCreatingNew && (
                <View
                    backgroundColor="gray-50"
                    borderRadius="medium"
                    padding="size-300"
                >
                    <Flex justifyContent="space-between" alignItems="center" marginBottom="size-200">
                        <Heading level={3} margin={0}>Create New Site</Heading>
                        <Button variant="secondary" onPress={handleCancelNew}>
                            Browse
                        </Button>
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
                        width="100%"
                        isRequired
                        autoFocus
                    />

                    <Flex alignItems="center" gap="size-150" marginTop="size-200">
                        <Info size="S" UNSAFE_className="text-blue-500" />
                        <Text UNSAFE_className="text-sm text-gray-600">
                            A new site will be created with the selected template content.
                        </Text>
                    </Flex>
                </View>
            )}
            </>}
            rightContent={
                <ContentConfigurationSummary
                    daLiveOrg={daLiveOrg}
                    selectedSite={selectedSite}
                    isCreatingNew={isCreatingNew}
                    newSiteName={daLiveSite}
                />
            }
        />
    );
}
