import React, { useMemo } from 'react';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { SelectionStepContent } from '@/core/ui/components/selection';
import { ConfigurationSummary } from '@/core/ui/components/wizard';
import { useCanProceed, useSelectionStep } from '@/core/ui/hooks';
import { TrackableStepProps } from '@/types/wizard';

/**
 * Org row shape sent by the get-organizations handler: display fields plus a
 * selectability verdict (the reapplied CLI filterToSelectableOrgs rule).
 */
interface OrgItem {
    id: string;
    code: string;
    name: string;
    selectable: boolean;
    reason?: string;
}

/**
 * Adobe Organization Selection Step
 *
 * A first-class in-app org-picker so org selection is a normal pick-from-list
 * step (no forced re-login dead-end). Mirrors AdobeProjectStep via the shared
 * `useSelectionStep` hook:
 * - loads orgs from get-organizations, caches in `organizationsCache`
 * - auto-selects when exactly one org is available (no double-prompt)
 * - cascade-clears project + workspace + mesh + their caches on change
 * - renders non-selectable orgs disabled, with the account-switch hint
 */
export function AdobeOrgStep({ state, updateState, setCanProceed, completedSteps = [] }: TrackableStepProps) {
    const {
        items: orgs,
        filteredItems: filteredOrgs,
        showLoading,
        isLoading,
        isRefreshing,
        hasLoadedOnce,
        error,
        searchQuery,
        setSearchQuery,
        load: loadOrgs,
        refresh,
        selectItem,
    } = useSelectionStep<OrgItem>({
        cacheKey: 'organizationsCache',
        messageType: 'get-organizations',
        errorMessageType: 'organization-error',
        state,
        updateState,
        selectedItem: state.adobeOrg as OrgItem | undefined,
        searchFilterKey: 'orgSearchFilter',
        autoSelectSingle: true,
        searchFields: ['name', 'code'],
        onSelect: (org) => {
            // BACKEND CALL ON CONTINUE PATTERN - UI PHASE:
            // immediate visual feedback only; the select-org backend call happens
            // when the user clicks Continue (WizardContainer.goNext()).
            updateState({
                adobeOrg: { id: org.id, code: org.code, name: org.name },
                // Cascade-clear everything downstream of org so stale
                // project/workspace/mesh state can't leak across an org switch.
                adobeProject: undefined,
                adobeWorkspace: undefined,
                apiMesh: undefined,
                projectsCache: undefined,
                workspacesCache: undefined,
            });
        },
    });

    // Update can-proceed when selection changes
    useCanProceed(state.adobeOrg?.id, setCanProceed);

    // Non-selectable orgs render greyed with the account-switch hint.
    const { disabledIds, disabledReasons } = useMemo(() => {
        const ids: string[] = [];
        const reasons: Record<string, string> = {};
        for (const org of orgs) {
            if (!org.selectable) {
                ids.push(org.id);
                if (org.reason) reasons[org.id] = org.reason;
            }
        }
        return { disabledIds: ids, disabledReasons: reasons };
    }, [orgs]);

    return (
        <TwoColumnLayout
            leftContent={
                <SelectionStepContent
                    items={orgs}
                    filteredItems={filteredOrgs}
                    showLoading={showLoading}
                    isLoading={isLoading}
                    isRefreshing={isRefreshing}
                    hasLoadedOnce={hasLoadedOnce}
                    error={error}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onLoad={loadOrgs}
                    onRefresh={refresh}
                    selectedId={state.adobeOrg?.id}
                    onSelect={selectItem}
                    disabledIds={disabledIds}
                    disabledReasons={disabledReasons}
                    labels={{
                        heading: '',
                        loadingMessage: 'Loading your Adobe organizations...',
                        loadingSubMessage: 'Fetching organizations...',
                        errorTitle: 'Error Loading Organizations',
                        emptyTitle: 'No Organizations Found',
                        emptyMessage: 'No organizations found for your Adobe account. '
                            + 'Sign in with a different account to continue.',
                        searchPlaceholder: 'Type to filter organizations...',
                        itemNoun: 'organization',
                        ariaLabel: 'Adobe Organizations',
                    }}
                />
            }
            rightContent={
                <ConfigurationSummary state={state} completedSteps={completedSteps} currentStep={state.currentStep} />
            }
        />
    );
}
