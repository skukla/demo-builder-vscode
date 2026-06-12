/**
 * StoreSelectionRow
 *
 * Renders website, store, and store view Pickers in a single row
 * after Auto-Detect populates store data. Cascading selection: website
 * filters stores, store filters views.
 *
 * Each picker uses flex={1} to share available width equally.
 *
 * @module features/components/ui/components/StoreSelectionRow
 */

import { Flex } from '@adobe/react-spectrum';
import React from 'react';
import {
    PAAS_WEBSITE_CODE, PAAS_STORE_CODE, PAAS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE, ACCS_STORE_CODE, ACCS_STORE_VIEW_CODE,
} from '../../config/envVarKeys';
import { STORE_GROUP_IDS } from '../../config/storeFieldHelpers';
import type { UniqueField, ServiceGroup } from '../hooks/useComponentConfig';
import type { StoreListItem } from '../hooks/useStoreDiscovery';
import { StoreStructureSelector } from './StoreStructureSelector';

// ==========================================================
// Types
// ==========================================================

interface StoreSelectionRowProps {
    group: ServiceGroup;
    getFieldValue: (field: UniqueField) => string | boolean | number | undefined;
    updateField: (field: UniqueField, value: string) => void;
    getWebsiteItems: () => StoreListItem[];
    getStoreGroupItems: (websiteCode: string) => StoreListItem[];
    getStoreViewItems: (storeGroupCode: string) => StoreListItem[];
    /**
     * Whether store discovery is still running. When true the three pickers
     * render disabled (occupying their footprint) and populate in place once
     * data lands — so there is no layout shift. Defaults to false.
     */
    isLoading?: boolean;
}

// ==========================================================
// Field key resolution
// ==========================================================

function getFieldKeys(groupId: string) {
    const isPaas = groupId === STORE_GROUP_IDS.PAAS;
    return {
        website: isPaas ? PAAS_WEBSITE_CODE : ACCS_WEBSITE_CODE,
        store: isPaas ? PAAS_STORE_CODE : ACCS_STORE_CODE,
        storeView: isPaas ? PAAS_STORE_VIEW_CODE : ACCS_STORE_VIEW_CODE,
    };
}

// ==========================================================
// Component
// ==========================================================

export function StoreSelectionRow({
    group,
    getFieldValue,
    updateField,
    getWebsiteItems,
    getStoreGroupItems,
    getStoreViewItems,
    isLoading = false,
}: StoreSelectionRowProps) {
    const keys = getFieldKeys(group.id);

    const findField = (key: string): UniqueField | undefined =>
        group.fields.find(f => f.key === key);

    const websiteField = findField(keys.website);
    const storeField = findField(keys.store);
    const storeViewField = findField(keys.storeView);

    // Cascade filters must read the SAME accessor the Website/Store pickers use
    // (getFieldValue, scoped to the field). Reading via an all-component lookup
    // diverged from the picker: selecting a new website left the store filter on a
    // stale value, so the Store/Store View dropdowns kept the old website's children.
    const selectedWebsite = websiteField ? String(getFieldValue(websiteField) || '') : '';
    const selectedStore = storeField ? String(getFieldValue(storeField) || '') : '';

    const handleWebsiteSelect = (code: string) => {
        if (!websiteField) return;
        updateField(websiteField, code);
        const storeItems = getStoreGroupItems(code);
        if (storeItems.length === 1 && storeField) {
            updateField(storeField, storeItems[0].code);
            const viewItems = getStoreViewItems(storeItems[0].code);
            if (viewItems.length === 1 && storeViewField) {
                updateField(storeViewField, viewItems[0].code);
            }
        }
    };

    const handleStoreSelect = (code: string) => {
        if (!storeField) return;
        updateField(storeField, code);
        const viewItems = getStoreViewItems(code);
        if (viewItems.length === 1 && storeViewField) {
            updateField(storeViewField, viewItems[0].code);
        }
    };

    return (
        <Flex gap="size-200" alignItems="end" marginBottom="size-200">
            {websiteField && (
                <StoreStructureSelector
                    label="Website"
                    items={getWebsiteItems()}
                    selectedCode={String(getFieldValue(websiteField) || '')}
                    onSelect={handleWebsiteSelect}
                    isRequired={websiteField.required}
                    isDisabled={isLoading}
                />
            )}
            {storeField && (
                <StoreStructureSelector
                    label="Store"
                    items={getStoreGroupItems(selectedWebsite)}
                    selectedCode={String(getFieldValue(storeField) || '')}
                    onSelect={handleStoreSelect}
                    isRequired={storeField.required}
                    isDisabled={isLoading}
                />
            )}
            {storeViewField && (
                <StoreStructureSelector
                    label="Store View"
                    items={getStoreViewItems(selectedStore)}
                    selectedCode={String(getFieldValue(storeViewField) || '')}
                    onSelect={(code) => updateField(storeViewField, code)}
                    isRequired={storeViewField.required}
                    isDisabled={isLoading}
                />
            )}
        </Flex>
    );
}
