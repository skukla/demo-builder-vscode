import { TextField, Text, View } from '@adobe/react-spectrum';
import React from 'react';
import {
    buildAppBuilderComponentFieldGroups,
    type ConnectedFieldModel,
    type AppBuilderComponentFieldGroup,
} from './appBuilderComponentFieldModel';
import { SecretFieldRow } from './SecretFieldRow';
import { ConfigSection } from '@/core/ui/components/forms';
import type { AppBuilderComponentCatalogEntry, AppBuilderComponentEnvVar } from '@/types/appBuilderComponents';
import type { ComponentConfigs } from '@/types/webview';

/**
 * AppBuilderComponentFieldsSection (D2 Track B — Step 04)
 *
 * Renders ANY selected appBuilderComponent's user-provided inputs (bucket 3) from its
 * catalog `envSchema`, applying the Step-01 3-bucket rule:
 *   - bucket 1 (derivedFrom)     → not rendered
 *   - bucket 2 (providedBy)      → read-only "Connected to {provider}" row
 *   - bucket 3 text              → Spectrum TextField → componentConfigs → .env
 *   - bucket 3 secret            → masked SecretFieldRow → SecretStorage
 *
 * Secrets travel a SEPARATE callback (`onSecretChange`) and never enter the
 * componentConfigs (text) path. A seed mesh (only a derived var) yields no
 * group, so it renders zero new inputs.
 *
 * Lives in its own component so the (already over-length) ConfigureScreen does
 * not grow — it renders <AppBuilderComponentFieldsSection /> as one block.
 */
export interface AppBuilderComponentFieldsSectionProps {
    /** Catalog entries for the project's selected appBuilderComponents. */
    catalog: AppBuilderComponentCatalogEntry[];
    /** Current componentConfigs (text values live here, keyed by appBuilderComponent id). */
    configs: ComponentConfigs;
    /** Resolved provided env values (bucket-2 "connected" sources). */
    provided: Record<string, string>;
    /** Per-appBuilderComponent "is set" flags for secret vars (booleans only, no values). */
    secretFlags: Record<string, Record<string, boolean>>;
    /** Text edit → componentConfigs path. */
    onTextChange: (appBuilderComponentId: string, varName: string, value: string) => void;
    /** Secret edit → SecretStorage path (never componentConfigs). */
    onSecretChange: (appBuilderComponentId: string, varName: string, value: string) => void;
}

function ConnectedRow({ field }: { field: ConnectedFieldModel }): React.ReactElement {
    return (
        <View id={`field-${field.name}`} marginBottom="size-200">
            <Text>{field.label}</Text>
            <Text UNSAFE_className="text-gray-600 text-sm">
                {` — Connected to ${field.providedBy}`}
                {field.value ? ` (${field.value})` : ''}
            </Text>
        </View>
    );
}

function TextRow({
    appBuilderComponentId,
    field,
    value,
    onTextChange,
}: {
    appBuilderComponentId: string;
    field: AppBuilderComponentEnvVar;
    value: string;
    onTextChange: (appBuilderComponentId: string, varName: string, value: string) => void;
}): React.ReactElement {
    return (
        <View id={`field-${field.name}`} marginBottom="size-200">
            <TextField
                label={field.label}
                value={value}
                width="100%"
                onChange={(next) => onTextChange(appBuilderComponentId, field.name, next)}
            />
        </View>
    );
}

function AppBuilderComponentGroup({
    group,
    showDivider,
    configs,
    secretFlags,
    onTextChange,
    onSecretChange,
}: {
    group: AppBuilderComponentFieldGroup;
    showDivider: boolean;
    configs: ComponentConfigs;
    secretFlags: Record<string, Record<string, boolean>>;
    onTextChange: AppBuilderComponentFieldsSectionProps['onTextChange'];
    onSecretChange: AppBuilderComponentFieldsSectionProps['onSecretChange'];
}): React.ReactElement {
    const groupConfig = configs[group.id] ?? {};
    const groupFlags = secretFlags[group.id] ?? {};

    return (
        <ConfigSection id={`appBuilderComponent-${group.id}`} label={group.label} showDivider={showDivider}>
            {group.connectedFields.map(field => (
                <ConnectedRow key={field.name} field={field} />
            ))}
            {group.textFields.map(field => (
                <TextRow
                    key={field.name}
                    appBuilderComponentId={group.id}
                    field={field}
                    value={String(groupConfig[field.name] ?? '')}
                    onTextChange={onTextChange}
                />
            ))}
            {group.secretFields.map(field => (
                <SecretFieldRow
                    key={field.name}
                    appBuilderComponentId={group.id}
                    name={field.name}
                    label={field.label}
                    isSet={groupFlags[field.name] === true}
                    onSecretChange={onSecretChange}
                />
            ))}
        </ConfigSection>
    );
}

export function AppBuilderComponentFieldsSection({
    catalog,
    configs,
    provided,
    secretFlags,
    onTextChange,
    onSecretChange,
}: AppBuilderComponentFieldsSectionProps): React.ReactElement | null {
    const groups = buildAppBuilderComponentFieldGroups(catalog, provided);
    if (groups.length === 0) {
        return null;
    }

    return (
        <>
            {groups.map((group, index) => (
                <AppBuilderComponentGroup
                    key={group.id}
                    group={group}
                    showDivider={index > 0}
                    configs={configs}
                    secretFlags={secretFlags}
                    onTextChange={onTextChange}
                    onSecretChange={onSecretChange}
                />
            ))}
        </>
    );
}
