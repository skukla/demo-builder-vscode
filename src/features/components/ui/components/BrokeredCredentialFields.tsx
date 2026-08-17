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
 * ## Shaped like the form, not like a notice
 *
 * This first shipped as a `StatusCard` — a coloured dot, a bold statement, an
 * action link and a second descriptive line. On a form where every other row is
 * label / control / one muted help line, that read as an alert about a problem
 * rather than as the absence of work.
 *
 * So: no card, no dot, no banner. The served state renders no field at all,
 * because there is nothing to type — just the same muted help line the rest of the
 * form uses, with the override as an inline link exactly like the endpoint field's
 * help carries its link. The unserved state puts the reason in the client-id
 * field's own `description`, which is where every other field keeps its help.
 *
 * @module features/components/ui/components/BrokeredCredentialFields
 */

import { Link, Text, View } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import type { UniqueField } from '../hooks/useComponentConfig';
import type { CredentialServiceStatus } from '../hooks/useCredentialService';
import { ConfigFieldRenderer } from './ConfigFieldRenderer';

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

    const toggleOverride = () => {
        // Turning the override OFF must CLEAR the pair, not just hide it.
        // `resolveAccs` prefers any present pair over the broker, so a hidden stale
        // credential would keep being sent — 401ing under a line saying credentials
        // are provided automatically. Clearing also deletes the stored secret, via
        // the migration's empty-value path.
        if (overriding) {
            updateField(idField, '');
            if (secretField) updateField(secretField, '');
        }
        setOverriding((open) => !open);
    };

    /** One line of help, in the same muted style every field on the form uses. */
    const helpLine = (text: string, linkLabel: string) => (
        <Text UNSAFE_className="text-gray-600 text-sm">
            {text}{' '}
            <Link onPress={toggleOverride} data-testid="toggle-credential-override">
                {linkLabel}
            </Link>
        </Text>
    );

    // While the probe is in flight, and when it could not answer at all, the fields
    // stand exactly as they did. "We could not check" must never read as a verdict.
    if (loading || !status) {
        return <View>{bothFields}</View>;
    }

    // Cannot be served: the fields ARE the answer, and the reason rides in the
    // client-id field's own description — the same place every other field on this
    // form carries its help, rather than a banner above them.
    if (!status.served) {
        return (
            <View>
                {renderField({ ...idField, description: status.verdict })}
                {secretField && renderField(secretField)}
            </View>
        );
    }

    // Served and overriding: show the pair, with the way back in its help line.
    if (overriding) {
        return (
            <View>
                {bothFields}
                {helpLine('Or let Demo Builder supply one.', 'Use the shared credential')}
            </View>
        );
    }

    // Served: there is nothing to type, so this renders no FIELD at all — just the
    // one muted line the rest of the form uses for help. A label with no input, or
    // a status banner, both claim more space and attention than "you need do
    // nothing" is worth.
    return (
        <View>
            {helpLine(
                'Commerce credentials are provided automatically when sample data is imported.',
                'Use my own instead',
            )}
        </View>
    );
}
