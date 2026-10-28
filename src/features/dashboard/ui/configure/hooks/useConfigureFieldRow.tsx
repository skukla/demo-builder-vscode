/**
 * useConfigureFieldRow Hook
 *
 * Owns how ONE Configure field row is rendered, and everything that row needs from
 * outside the form: Commerce store discovery (connection fields trigger it; store-code
 * fields become cascading Pickers once results arrive) and the shared-credential probe
 * for the ACCS OAuth override fields. Returns the row renderer `ConfigureSectionBody`
 * calls per field, plus the discovery signal the Business Structure heading discloses on.
 *
 * The wizard's `ConnectStoreStepContent` wires the same four collaborators, as a variant:
 * it seeds discovery from wizard state and reads its own live configs, and has no saved
 * secrets to honour. Two sites, so not shared yet (Rule of Three).
 *
 * Moved out of ConfigureScreen (EDS-8) unchanged.
 *
 * @module features/dashboard/ui/configure/hooks/useConfigureFieldRow
 */

import React, { useCallback } from 'react';
import type { ServiceGroup, UniqueField } from '../configureTypes';
import { StoreConfigFieldRow } from '@/features/components/ui/components/StoreConfigFieldRow';
import { useAutoStoreDetect } from '@/features/components/ui/hooks/useAutoStoreDetect';
import { useStoreDiscovery } from '@/features/components/ui/hooks/useStoreDiscovery';
import type { Project } from '@/types/base';
import type { ComponentConfigs } from '@/types/webview';

export interface UseConfigureFieldRowProps {
    /** The project being configured (supplies the Adobe org). */
    project: Project;
    /** Every section's values — the connection fields discovery keys off. */
    componentConfigs: ComponentConfigs;
    /** Which declared secrets the project already holds (booleans only). */
    componentSecretFlags: Record<string, Record<string, boolean>>;
    /** The value the form should DISPLAY for a field (defaults included). */
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
    /** Write a field's value to every component that declares it. */
    updateField: (field: UniqueField, value: string | boolean) => void;
    /** Validation errors across every section, keyed by field. */
    validationErrors: Record<string, string>;
    /** Field keys the user has edited. */
    touchedFields: Set<string>;
    /** Trim a URL field's trailing slash on blur. */
    normalizeUrlField: (field: UniqueField) => void;
}

export interface UseConfigureFieldRowReturn {
    /** Render one field of one service group. */
    renderFieldRow: (field: UniqueField, group: ServiceGroup) => React.ReactNode;
    /** Set once discovery has keyed a result — the Business Structure disclosure signal. */
    autoDetectKey: string | undefined;
}

/**
 * Wire store discovery into the Configure field row.
 *
 * @param props - the values, field reads/writes and validation state a row renders from
 * @returns the row renderer and the discovery signal
 */
export function useConfigureFieldRow({
    project,
    componentConfigs,
    componentSecretFlags,
    getFieldValue,
    updateField,
    validationErrors,
    touchedFields,
    normalizeUrlField,
}: UseConfigureFieldRowProps): UseConfigureFieldRowReturn {
    // Commerce store discovery — matches wizard UX. Connection fields (ACCS endpoint,
    // PaaS URL + credentials) trigger automatic discovery; store-code fields render as
    // cascading Pickers once results arrive.
    const {
        isFetching,
        fetchError,
        hasStoreData,
        fetchStores,
        getWebsiteItems,
        getStoreGroupItems,
        getStoreViewItems,
        isStoreGroup,
    } = useStoreDiscovery();

    const { autoDetectKey, accsEndpoint, forceFetch } = useAutoStoreDetect({
        configs: componentConfigs,
        orgId: project.adobe?.organization,
        fetchStores,
        hasStoreData,
        isFetching,
        // Configure is the surface that renders a SAVED project, so it is the one
        // whose password may already have migrated out of the config map.
        secretFlags: componentSecretFlags,
    });

    const renderFieldRow = useCallback(
        (field: UniqueField, group: ServiceGroup) => (
            <StoreConfigFieldRow
                field={field}
                group={group}
                secretFlags={componentSecretFlags}
                autoDetectKey={autoDetectKey}
                isFetching={isFetching}
                hasStoreData={hasStoreData}
                fetchError={fetchError}
                isStoreGroup={isStoreGroup}
                getFieldValue={getFieldValue}
                updateField={updateField}
                validationErrors={validationErrors}
                touchedFields={touchedFields}
                normalizeUrlField={normalizeUrlField}
                getWebsiteItems={getWebsiteItems}
                getStoreGroupItems={getStoreGroupItems}
                getStoreViewItems={getStoreViewItems}
                onRefresh={forceFetch}
                accsEndpoint={accsEndpoint}
            />
        ),
        [
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
            forceFetch,
            componentSecretFlags,
            accsEndpoint,
        ],
    );

    return { renderFieldRow, autoDetectKey };
}
