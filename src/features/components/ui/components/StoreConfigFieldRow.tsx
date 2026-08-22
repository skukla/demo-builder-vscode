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
 * Used by ConnectStoreStepContent.
 */
import { Button, Flex, Text } from '@adobe/react-spectrum';
import React from 'react';
import { ACCS_OAUTH_CLIENT_ID, ACCS_OAUTH_CLIENT_SECRET } from '../../config/envVarKeys';
import {
    CONNECTION_FIELDS,
    isStoreCodeField,
    isWebsiteCodeField,
} from '../../config/storeFieldHelpers';
import type { ServiceGroup, UniqueField } from '../hooks/useComponentConfig';
import type { CredentialServiceState } from '../hooks/useCredentialService';
import type { StoreListItem } from '../hooks/useStoreDiscovery';
import { BrokeredCredentialFields } from './BrokeredCredentialFields';
import { ConfigFieldRenderer } from './ConfigFieldRenderer';
import { StoreSelectionRow } from './StoreSelectionRow';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';

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
    /**
     * Whether the shared service will serve a Commerce credential.
     *
     * Absent for callers that never probe (PaaS, and any surface that has not
     * adopted it) — the OAuth fields then render exactly as they always did.
     */
    credentialService?: CredentialServiceState;
    /**
     * Component-declared secrets the project holds, booleans only.
     *
     * A migrated value is in the OS keychain and never reaches this webview, so a
     * required password field would otherwise render empty — indistinguishable
     * from "not configured", and a save would write the blank over it.
     */
    secretFlags?: Record<string, Record<string, boolean>>;
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
    credentialService,
    secretFlags,
}: StoreConfigFieldRowProps): React.ReactNode {
    // A stored secret with no typed value: show that one EXISTS rather than an
    // empty box, and drop the error — the field is satisfied, just not visible.
    const isStoredSecret =
        !getFieldValue(field) &&
        Object.values(secretFlags ?? {}).some((perVar) => perVar[field.key] === true);

    const fieldProps = {
        field: isStoredSecret
            ? { ...field, placeholder: 'Saved — type to replace', required: false }
            : field,
        value: getFieldValue(field),
        error: isStoredSecret ? undefined : validationErrors[field.key],
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
         * any Re-detect: a compact spinner+label row anchored directly under the
         * connection fields (NOT vertically centered in a tall band — centering
         * put the spinner at the fold and its label below it at short viewports).
         * On success the populated dropdowns ARE the result (no separate
         * "detected" confirmation). The fetchError branch keeps its fallback inputs.
         */
        if (fetchError) {
            return (
                <div>
                    <Text UNSAFE_className="text-red-700" marginBottom="size-200">
                        {fetchError}
                    </Text>
                    <ConfigFieldRenderer {...fieldProps} />
                </div>
            );
        }

        if (isFetching || !hasStoreData) {
            return (
                <Flex marginTop="size-300" marginBottom="size-300" justifyContent="center">
                    <LoadingDisplay size="M" message="Detecting store structure..." />
                </Flex>
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

    if (credentialService && field.key === ACCS_OAUTH_CLIENT_ID) {
        /*
         * The OAuth pair renders as ONE unit from the id row, because the
         * "use my own instead" disclosure covers both halves and a sibling row
         * cannot own half a toggle. Same shape as the store cascade above.
         */
        return (
            <BrokeredCredentialFields
                idField={field}
                secretField={group.fields.find((f) => f.key === ACCS_OAUTH_CLIENT_SECRET)}
                status={credentialService.status}
                loading={credentialService.loading}
                getFieldValue={getFieldValue}
                updateField={updateField}
                validationErrors={validationErrors}
                touchedFields={touchedFields}
            />
        );
    }

    if (credentialService && field.key === ACCS_OAUTH_CLIENT_SECRET) {
        /* Rendered above, with its pair — skip. */
        return null;
    }

    /* Other dependent fields — show after prerequisites met */
    return <ConfigFieldRenderer {...fieldProps} />;
}
