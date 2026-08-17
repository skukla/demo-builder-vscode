/**
 * The ACCS OAuth pair, rendered against what the shared service will actually do.
 *
 * These two fields are an OVERRIDE. When the discovery service serves a credential
 * the import fetches one at use time, and the boxes should stay empty — the pair is
 * deliberately never persisted, because one org-wide write credential copied into N
 * project manifests goes stale the moment it rotates
 * (`commerceCredentialBroker.ts`). Two empty required-looking inputs could not say
 * that, so they read as a missing setting and sent people to the Developer Console
 * for a credential they already had.
 *
 * Renders BOTH fields from the client-id row, the way `StoreSelectionRow` renders
 * the whole store cascade from the website-code row: the disclosure state is shared,
 * and a sibling row cannot own half of it.
 *
 * Three rendered states, because different people fix them
 * (`credentialServiceProbe.ts`): served (nothing to do), not served (the verdict
 * names the remedy — an administrator for a 403, the user for an unset setting),
 * and unknown/in-flight (say nothing, show the fields as they always were).
 *
 * Uses the shared `StatusCard` — the house treatment for an ambient status plus a
 * remediation link — rather than a bespoke dot-and-text row.
 *
 * @module features/components/ui/components/BrokeredCredentialFields
 */

import { Text, View } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import type { UniqueField } from '../hooks/useComponentConfig';
import type { CredentialServiceStatus } from '../hooks/useCredentialService';
import { ConfigFieldRenderer } from './ConfigFieldRenderer';
import { StatusCard } from '@/core/ui/components/feedback/StatusCard';

export interface BrokeredCredentialFieldsProps {
    /** The client-id field — this component is rendered from its row. */
    idField: UniqueField;
    /** The paired secret field, found in the same group. Absent = render id alone. */
    secretField?: UniqueField;
    status?: CredentialServiceStatus;
    /** True while the probe is in flight. */
    loading: boolean;
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
    updateField: (field: UniqueField, value: string | boolean) => void;
    validationErrors: Record<string, string | undefined>;
    touchedFields: Set<string>;
}

export function BrokeredCredentialFields({
    idField,
    secretField,
    status,
    loading,
    getFieldValue,
    updateField,
    validationErrors,
    touchedFields,
}: BrokeredCredentialFieldsProps): React.ReactElement {
    // A value already typed means the user chose the override before — open on it,
    // or their own credential would silently look like it had been discarded.
    const hasExistingValue = Boolean(
        getFieldValue(idField) || (secretField && getFieldValue(secretField)),
    );
    const [overriding, setOverriding] = useState(hasExistingValue);

    const renderField = (field: UniqueField) => (
        <ConfigFieldRenderer
            key={field.key}
            field={field}
            value={getFieldValue(field)}
            error={validationErrors[field.key]}
            isTouched={touchedFields.has(field.key)}
            onUpdate={updateField}
            onNormalizeUrl={() => {}}
        />
    );

    const bothFields = (
        <>
            {renderField(idField)}
            {secretField && renderField(secretField)}
        </>
    );

    // While the probe is in flight, and when it could not answer at all, the fields
    // stand exactly as they did. "We could not check" must never read as a verdict.
    if (loading || !status) {
        return <View>{bothFields}</View>;
    }

    if (!status.served) {
        return (
            <View>
                <View marginBottom="size-200">
                    <StatusCard status={status.verdict} color="yellow" />
                </View>
                {bothFields}
            </View>
        );
    }

    return (
        <View>
            <View marginBottom="size-200">
                <StatusCard
                    status="Credentials are provided automatically — nothing to enter."
                    color="green"
                    action={{
                        label: overriding ? 'Use the shared credential' : 'Use my own instead',
                        onPress: () => {
                            // Turning the override OFF must CLEAR the pair, not just
                            // hide it. `resolveAccs` prefers any present pair over the
                            // broker, so a hidden stale credential would keep being
                            // sent — 401ing under a message saying credentials are
                            // provided automatically. Clearing also deletes the stored
                            // secret, via the migration's empty-value path.
                            if (overriding) {
                                updateField(idField, '');
                                if (secretField) updateField(secretField, '');
                            }
                            setOverriding((open) => !open);
                        },
                        testId: 'toggle-credential-override',
                    }}
                />
                <Text UNSAFE_className="text-gray-600 text-sm">
                    Demo Builder fetches a shared credential when it imports sample data.
                </Text>
            </View>
            {overriding && bothFields}
        </View>
    );
}
