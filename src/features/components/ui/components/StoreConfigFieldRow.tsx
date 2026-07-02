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
import { Button, Flex, Text } from '@adobe/react-spectrum';
import React from 'react';
import {
    CONNECTION_FIELDS,
    isStoreCodeField,
    isWebsiteCodeField,
} from '../../config/storeFieldHelpers';
import type { ServiceGroup, UniqueField } from '../hooks/useComponentConfig';
import type { StoreListItem } from '../hooks/useStoreDiscovery';
import { ConfigFieldRenderer } from './ConfigFieldRenderer';
import { StoreSelectionRow } from './StoreSelectionRow';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';

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
    /** Called when user clicks the Re-detect button to re-run store discovery */
    onRefresh?: () => void;
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
    onRefresh,
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
        /*
         * Store selection — one loading treatment, used for the INITIAL detect AND
         * any Re-detect: the large centered spinner (LoadingDisplay) stands in for
         * the whole row while discovery runs, centered in the content area via
         * CenteredFeedbackContainer (the same loader the component uses for "Loading
         * component configurations…"). On success the populated dropdowns ARE the
         * result (no separate "detected" confirmation). The fetchError branch keeps
         * its fallback inputs.
         */
        if (fetchError) {
            return (
                <div>
                    <Text UNSAFE_className="text-red-700" marginBottom="size-200">{fetchError}</Text>
                    <ConfigFieldRenderer {...fieldProps} />
                </div>
            );
        }

        if (isFetching || !hasStoreData) {
            return (
                <CenteredFeedbackContainer>
                    <LoadingDisplay size="L" message="Detecting store structure…" />
                </CenteredFeedbackContainer>
            );
        }

        return (
            <div>
                <StoreSelectionRow
                    group={group}
                    getFieldValue={getFieldValue}
                    updateField={updateField}
                    getWebsiteItems={getWebsiteItems}
                    getStoreGroupItems={getStoreGroupItems}
                    getStoreViewItems={getStoreViewItems}
                />
                {onRefresh && (
                    <Flex marginTop="size-100" marginStart="size-50">
                        <Button
                            variant="secondary"
                            onPress={onRefresh}
                            UNSAFE_className="btn-standard text-base"
                        >
                            Re-detect
                        </Button>
                    </Flex>
                )}
            </div>
        );
    }

    if (isStoreCodeField(field.key) && !fetchError) {
        /* Store/view fields rendered by StoreSelectionRow — skip */
        return null;
    }

    /* Other dependent fields — show after prerequisites met */
    return <ConfigFieldRenderer {...fieldProps} />;
}
