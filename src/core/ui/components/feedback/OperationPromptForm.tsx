/**
 * What the SC types to let a paused operation carry on (PL-59, owner 2026-09-20).
 *
 * The progress modal asks its own questions; when one needs a value — the DA.live
 * namespace, a pasted token — it asks here rather than handing off to a VS Code
 * input box. Handing off is the defect this whole change removes, one step along:
 * one question, two surfaces.
 *
 * Fields come from the extension as data, so a guard describes what it needs
 * without knowing anything about this component.
 *
 * **`forms/FormField` was the obvious reuse and does not fit.** It composes
 * `FieldHelpButton` and `descriptionRenderer`, whose classes live in a stylesheet
 * only the configure and wizard bundles import — so using it here put 29 unstyled
 * class uses into the dashboard, integrations and projectsList bundles, which
 * `webview-architecture-rules` caught (ADR-017 §6). These fields need a label, a
 * value and a mask; Spectrum styles all three itself.
 *
 * @module core/ui/components/feedback/OperationPromptForm
 */

import { Flex, TextField } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import type { OperationPromptField } from '@/types/webviewPayloads';

export interface OperationPromptFormProps {
    fields: OperationPromptField[];
    /** Every keystroke, so the modal's buttons hand back what is typed. */
    onChange: (values: Record<string, string>) => void;
}

/** What the fields say they already hold — a re-ask keeps what was typed. */
function initialValues(fields: OperationPromptField[]): Record<string, string> {
    return Object.fromEntries(fields.map((field) => [field.id, field.value ?? '']));
}

/** The fields of one question, in the order the guard asked for them. */
export function OperationPromptForm({
    fields,
    onChange,
}: OperationPromptFormProps): React.ReactElement {
    const [values, setValues] = useState<Record<string, string>>(() => initialValues(fields));

    // A re-ask — an invalid token, say — arrives as new fields carrying what was
    // typed plus what is wrong with it. Keyed on the ids and the values they arrive
    // with: a push that changes neither must not wipe what is being typed.
    const identity = fields.map((field) => `${field.id}=${field.value ?? ''}`).join('\u0000');
    useEffect(() => {
        const next = initialValues(fields);
        setValues(next);
        onChange(next);
        // `fields` is a new array on every push; `identity` is what actually changed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [identity]);

    const change = (id: string, value: string): void => {
        const next = { ...values, [id]: value };
        setValues(next);
        onChange(next);
    };

    return (
        <Flex direction="column" gap="size-200" width="100%">
            {fields.map((field) => (
                <TextField
                    key={field.id}
                    label={field.label}
                    type={field.secret ? 'password' : 'text'}
                    value={values[field.id] ?? ''}
                    onChange={(value) => change(field.id, value)}
                    placeholder={field.placeholder}
                    description={field.description}
                    width="100%"
                />
            ))}
        </Flex>
    );
}
