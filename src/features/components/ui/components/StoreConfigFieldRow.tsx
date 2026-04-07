/**
 * StoreConfigFieldRow
 *
 * Renders a single config field with commerce-store-aware routing:
 * - Connection fields: always shown
 * - Store group fields: hidden until connection fields are complete
 * - Website code: shows discovery progress and store selection pickers
 * - Store/view code fields: skipped (rendered by StoreSelectionRow)
 * - Other fields: standard renderer
 *
 * Shared by ComponentConfigStep and ConnectStoreStepContent.
 */
import { Flex, ProgressCircle, Text } from '@adobe/react-spectrum';
import React from 'react';
import { ConfigFieldRenderer } from './ConfigFieldRenderer';
import { StoreSelectionRow } from './StoreSelectionRow';
import {
    CONNECTION_FIELDS,
    isStoreCodeField,
    isWebsiteCodeField,
} from '../../config/storeFieldHelpers';
import type { ServiceGroup, UniqueField } from '../hooks/useComponentConfig';
import type { StoreListItem } from '../hooks/useStoreDiscovery';
import type { ComponentConfigs } from '@/types/webview';

export interface StoreConfigFieldRowProps {
    field: UniqueField;
    group: ServiceGroup;
    autoDetectKey: string | undefined;
    isFetching: boolean;
    hasStoreData: boolean;
    fetchError: string | null;
    isStoreGroup: (groupId: string) => boolean;
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
    updateField: (field: UniqueField, value: string | boolean) => void;
    validationErrors: Record<string, string | undefined>;
    touchedFields: Set<string>;
    normalizeUrlField: (field: UniqueField) => void;
    getWebsiteItems: () => StoreListItem[];
    getStoreGroupItems: (websiteCode: string) => StoreListItem[];
    getStoreViewItems: (storeGroupCode: string) => StoreListItem[];
    componentConfigs: ComponentConfigs;
}

export function StoreConfigFieldRow({
    field,
    group,
    autoDetectKey,
    isFetching,
    hasStoreData,
    fetchError,
    isStoreGroup,
    getFieldValue,
    updateField,
    validationErrors,
    touchedFields,
    normalizeUrlField,
    getWebsiteItems,
    getStoreGroupItems,
    getStoreViewItems,
    componentConfigs,
}: StoreConfigFieldRowProps): React.ReactNode {
    const fieldProps = {
        field,
        value: getFieldValue(field),
        error: validationErrors[field.key],
        isTouched: touchedFields.has(field.key),
        onUpdate: updateField,
        onNormalizeUrl: normalizeUrlField,
    };

    if (CONNECTION_FIELDS.has(field.key)) {
        /* Connection fields (endpoint, URL, credentials) — always shown */
        return <ConfigFieldRenderer {...fieldProps} />;
    }

    if (!isStoreGroup(group.id)) {
        /* Non-store group — always show */
        return <ConfigFieldRenderer {...fieldProps} />;
    }

    if (!autoDetectKey) {
        /* Store group awaiting connection fields — hide until ready */
        return null;
    }

    if (isWebsiteCodeField(field.key)) {
        /* Store selection: spinner, Pickers, or fallback text inputs */
        return (
            <div>
                {isFetching && (
                    <Flex alignItems="center" gap="size-100" marginBottom="size-200">
                        <ProgressCircle size="S" isIndeterminate aria-label="Detecting" />
                        <Text UNSAFE_className="status-text">Detecting store structure...</Text>
                    </Flex>
                )}
                {hasStoreData && (
                    <StoreSelectionRow
                        group={group}
                        getFieldValue={getFieldValue}
                        updateField={updateField}
                        getWebsiteItems={getWebsiteItems}
                        getStoreGroupItems={getStoreGroupItems}
                        getStoreViewItems={getStoreViewItems}
                        componentConfigs={componentConfigs}
                    />
                )}
                {fetchError && (
                    <>
                        <Text UNSAFE_className="text-red-700" marginBottom="size-200">{fetchError}</Text>
                        <ConfigFieldRenderer {...fieldProps} />
                    </>
                )}
            </div>
        );
    }

    if (isStoreCodeField(field.key) && !fetchError) {
        /* Store/view fields rendered by StoreSelectionRow — skip */
        return null;
    }

    /* Other dependent fields (e.g., Customer Group) — show after prerequisites met */
    return <ConfigFieldRenderer {...fieldProps} />;
}
