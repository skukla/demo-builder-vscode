/**
 * StoreSelectionRow
 *
 * Renders website, store, and store view Pickers in a single horizontal row
 * after Auto-Detect populates store data. Cascading selection: website filters
 * stores, store filters views.
 *
 * @module features/components/ui/components/StoreSelectionRow
 */

import { Flex } from '@adobe/react-spectrum';
import React from 'react';
import { StoreStructureSelector } from './StoreStructureSelector';
import { lookupComponentConfigValue } from '../../services/envVarHelpers';
import {
    PAAS_WEBSITE_CODE, PAAS_STORE_CODE, PAAS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE, ACCS_STORE_CODE, ACCS_STORE_VIEW_CODE,
} from '../../config/envVarKeys';
import type { UniqueField, ServiceGroup } from '../hooks/useComponentConfig';
import type { StoreListItem } from '../hooks/useStoreDiscovery';

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
    componentConfigs: Record<string, Record<string, string | boolean | number | undefined>>;
}

// ==========================================================
// Field key resolution
// ==========================================================

function getFieldKeys(groupId: string) {
    const isPaas = groupId === 'adobe-commerce';
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
    componentConfigs,
}: StoreSelectionRowProps) {
    const keys = getFieldKeys(group.id);

    const findField = (key: string): UniqueField | undefined =>
        group.fields.find(f => f.key === key);

    const websiteField = findField(keys.website);
    const storeField = findField(keys.store);
    const storeViewField = findField(keys.storeView);

    const selectedWebsite = lookupComponentConfigValue(componentConfigs, keys.website) || '';
    const selectedStore = lookupComponentConfigValue(componentConfigs, keys.store) || '';

    return (
        <Flex gap="size-200" wrap>
            {websiteField && (
                <StoreStructureSelector
                    label="Website"
                    items={getWebsiteItems()}
                    selectedCode={String(getFieldValue(websiteField) || '')}
                    onSelect={(code) => updateField(websiteField, code)}
                    isRequired={websiteField.required}
                />
            )}
            {storeField && (
                <StoreStructureSelector
                    label="Store"
                    items={getStoreGroupItems(selectedWebsite)}
                    selectedCode={String(getFieldValue(storeField) || '')}
                    onSelect={(code) => updateField(storeField, code)}
                    isRequired={storeField.required}
                />
            )}
            {storeViewField && (
                <StoreStructureSelector
                    label="Store View"
                    items={getStoreViewItems(selectedStore)}
                    selectedCode={String(getFieldValue(storeViewField) || '')}
                    onSelect={(code) => updateField(storeViewField, code)}
                    isRequired={storeViewField.required}
                />
            )}
        </Flex>
    );
}
