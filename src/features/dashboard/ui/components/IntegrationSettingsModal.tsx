/**
 * IntegrationSettingsModal — an integration's Settings, opened from its card's
 * menu or the flyout's Settings row (AB-21).
 *
 * One field per setting: text fields show the current value; a secret field is
 * masked and shows only whether one is stored (the value never comes back to the
 * webview). Settings another app provides are read-only lines. "Save and
 * redeploy" posts only what changed; the extension stores it and redeploys what
 * uses it, because a setting reaches an app only through its deploy. Pressing it
 * IS the confirmation, so the button says both verbs, and nothing above the fields
 * says it again. A save that did not go through is the title's outcome, in red,
 * with its reason above the fields and what was typed still in them: the Form
 * layout's failure mode ({@link FormDialog}), held at one height throughout.
 * The grid owns one instance.
 *
 * @module features/dashboard/ui/components/IntegrationSettingsModal
 */

import { Text, TextField } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { SecretFieldRow } from './integrations/SecretFieldRow';
import { FormDialog } from '@/core/ui/components/ui/FormDialog';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { ComponentSettings, ComponentSettingField } from '@/types/appBuilderComponents';
import type { SaveIntegrationSettingsResult } from '@/types/webviewRequests';

export interface IntegrationSettingsModalProps {
    /** The component whose settings are open, or null when closed. */
    target: { id: string; name: string; settings: ComponentSettings } | null;
    onClose: () => void;
    /** The settings as the extension holds them after a save. */
    onSaved: (id: string, settings: ComponentSettings) => void;
}

/** Why the last save did not finish, and whether the values were stored before it stopped. */
interface SaveFailure {
    saved: boolean;
    reason: string;
}

/** The title: the settings, or what did not go through. */
function titleOf(name: string, failure: SaveFailure | null): string {
    if (!failure) return `${name} Settings`;
    return failure.saved ? `Couldn't Redeploy ${name}` : `Couldn't Save ${name} Settings`;
}

function initialValues(settings: ComponentSettings): Record<string, string> {
    return Object.fromEntries(
        settings.fields.filter((f) => f.type === 'text').map((f) => [f.name, f.value ?? '']),
    );
}

/** Only what changed: edited text values, and secrets someone typed. */
function changeOf(
    settings: ComponentSettings,
    values: Record<string, string>,
    secrets: Record<string, string>,
): { values: Record<string, string>; secrets: Record<string, string> } {
    const before = initialValues(settings);
    return {
        values: Object.fromEntries(
            Object.entries(values).filter(([name, value]) => value !== before[name]),
        ),
        secrets: Object.fromEntries(Object.entries(secrets).filter(([, value]) => value !== '')),
    };
}

function blankRequired(field: ComponentSettingField, values: Record<string, string>): boolean {
    return field.type === 'text' && field.required && !values[field.name]?.trim();
}

function toMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** One field per setting, then the read-only rows another app provides. */
function SettingsFields({ id, settings, values, onText, onSecret }: {
    id: string;
    settings: ComponentSettings;
    values: Record<string, string>;
    onText: (name: string, value: string) => void;
    onSecret: (name: string, value: string) => void;
}): React.ReactElement {
    return (
        <>
            {settings.fields.map((field) => {
                if (field.type === 'secret') {
                    return (
                        <SecretFieldRow
                            key={field.name}
                            appBuilderComponentId={id}
                            name={field.name}
                            label={field.label}
                            isSet={field.isSet === true}
                            onSecretChange={(_id, name, value) => onSecret(name, value)}
                        />
                    );
                }
                const blank = blankRequired(field, values);
                return (
                    <div key={field.name}>
                        <TextField
                            label={field.label}
                            value={values[field.name] ?? ''}
                            width="100%"
                            isRequired={field.required}
                            validationState={blank ? 'invalid' : undefined}
                            errorMessage={blank ? `${field.label} cannot be empty.` : undefined}
                            onChange={(next) => onText(field.name, next)}
                        />
                    </div>
                );
            })}
            {settings.connected.map((row) => (
                <div key={row.name}>
                    <Text>
                        {row.label}: {row.value ?? `set when ${row.from} is deployed`} (from {row.from})
                    </Text>
                </div>
            ))}
        </>
    );
}

export function IntegrationSettingsModal({
    target,
    onClose,
    onSaved,
}: IntegrationSettingsModalProps): React.ReactElement {
    const [values, setValues] = useState<Record<string, string>>({});
    const [secrets, setSecrets] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [failure, setFailure] = useState<SaveFailure | null>(null);

    // Each open starts from the settings as they are: nothing typed carries over.
    useEffect(() => {
        if (!target) return;
        setValues(initialValues(target.settings));
        setSecrets({});
        setFailure(null);
        setIsSaving(false);
    }, [target]);

    const change = target ? changeOf(target.settings, values, secrets) : { values: {}, secrets: {} };
    const isDirty = Object.keys(change.values).length + Object.keys(change.secrets).length > 0;
    const hasBlank = target?.settings.fields.some((field) => blankRequired(field, values)) ?? false;

    const handleSave = async (): Promise<void> => {
        if (!target) return;
        setIsSaving(true);
        setFailure(null);
        try {
            const result = await webviewClient.request<SaveIntegrationSettingsResult>(
                'saveIntegrationSettings',
                { id: target.id, ...change },
            );
            if (result?.settings) onSaved(target.id, result.settings);
            if (result?.success) {
                onClose();
                return;
            }
            setFailure({ saved: result?.saved === true, reason: result?.error ?? 'Could not save the settings.' });
        } catch (err) {
            setFailure({ saved: false, reason: toMessage(err) });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <FormDialog
            isOpen={!!target}
            title={target ? titleOf(target.name, failure) : ''}
            submitLabel="Save and Redeploy"
            onSubmit={() => {
                void handleSave();
            }}
            submitDisabled={!isDirty || hasBlank}
            submitPending={isSaving}
            // The redeploy carries on after the window closes, with its progress on the card.
            background
            failure={failure ? failure.reason : null}
            onClose={onClose}
        >
            {target && (
                <SettingsFields
                    id={target.id}
                    settings={target.settings}
                    values={values}
                    onText={(name, value) => setValues((prev) => ({ ...prev, [name]: value }))}
                    onSecret={(name, value) => setSecrets((prev) => ({ ...prev, [name]: value }))}
                />
            )}
        </FormDialog>
    );
}
