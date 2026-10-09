/**
 * What the SC types to let a paused operation carry on (PL-59, owner 2026-09-20).
 *
 * The progress modal asks its own questions; when one needs a value — the DA.live
 * namespace, a pasted token, a box to tick, one of a few choices — it asks here rather than handing off to a VS Code
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

import { Checkbox, Flex, Item, Picker, Text, TextField } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import type { OperationPromptField } from '@/types/webviewPayloads';

export interface OperationPromptFormProps {
    fields: OperationPromptField[];
    /** Every keystroke, so the modal's buttons hand back what is typed. */
    onChange: (values: Record<string, string>) => void;
}

/** What the fields say they already hold — a re-ask keeps what was typed. A choice
 * with nothing chosen starts on its first option, so it is never answered empty. */
function initialValues(fields: OperationPromptField[]): Record<string, string> {
    return Object.fromEntries(
        fields.map((field) => [
            field.id,
            field.value ?? (field.kind === 'choice' ? (field.options?.[0]?.id ?? '') : ''),
        ]),
    );
}

/** One field, as its kind asks. */
function PromptField({ field, value, onChange }: {
    field: OperationPromptField;
    value: string;
    onChange: (value: string) => void;
}): React.ReactElement {
    if (field.kind === 'checkbox') {
        return (
            <Flex direction="column">
                <Checkbox isSelected={value === 'true'} onChange={(on) => onChange(on ? 'true' : '')}>
                    {field.label}
                </Checkbox>
                {field.description && <Text>{field.description}</Text>}
            </Flex>
        );
    }
    if (field.kind === 'choice') {
        return (
            <Picker
                label={field.label}
                selectedKey={value}
                onSelectionChange={(key) => onChange(String(key))}
                description={field.description}
                width="100%"
            >
                {(field.options ?? []).map((option) => (
                    <Item key={option.id} textValue={option.label}>{option.label}</Item>
                ))}
            </Picker>
        );
    }
    return (
        <TextField
            label={field.label}
            type={field.secret ? 'password' : 'text'}
            value={value}
            onChange={onChange}
            placeholder={field.placeholder}
            description={field.description}
            width="100%"
        />
    );
}

/**
 * "Select all" over a question's boxes, when it has two or more: ticked when every box
 * is, partly ticked when some are, and a click ticks them all (or, when all are, clears
 * them). Owner, 2026-10-09: deleting a project offers one box per online resource, and
 * the QuickPick it replaced had a select-all the modal lacked. It is never an answer of
 * its own: it only sets the boxes it stands for.
 */
function SelectAllBox({ ids, values, onChange }: {
    ids: string[];
    values: Record<string, string>;
    onChange: (next: Record<string, string>) => void;
}): React.ReactElement {
    const ticked = ids.filter((id) => values[id] === 'true').length;
    const all = ticked === ids.length;
    const setAll = (): void => {
        const value = all ? '' : 'true';
        onChange({ ...values, ...Object.fromEntries(ids.map((id) => [id, value])) });
    };
    return (
        <Checkbox isSelected={all} isIndeterminate={ticked > 0 && !all} onChange={setAll}>
            Select all
        </Checkbox>
    );
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

    const replace = (next: Record<string, string>): void => {
        setValues(next);
        onChange(next);
    };
    const change = (id: string, value: string): void => replace({ ...values, [id]: value });
    const boxes = fields.filter((field) => field.kind === 'checkbox').map((field) => field.id);

    return (
        <Flex direction="column" gap="size-200" width="100%">
            {boxes.length > 1 && <SelectAllBox ids={boxes} values={values} onChange={replace} />}
            {fields.map((field) => (
                <PromptField
                    key={field.id}
                    field={field}
                    value={values[field.id] ?? ''}
                    onChange={(value) => change(field.id, value)}
                />
            ))}
        </Flex>
    );
}
