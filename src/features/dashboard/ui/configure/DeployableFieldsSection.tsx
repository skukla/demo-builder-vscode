import { TextField, Text, View } from '@adobe/react-spectrum';
import React from 'react';
import { ConfigSection } from '@/core/ui/components/forms';
import { SecretFieldRow } from './SecretFieldRow';
import {
    buildDeployableFieldGroups,
    type ConnectedFieldModel,
    type DeployableFieldGroup,
} from './deployableFieldModel';
import type { DeployableCatalogEntry, DeployableEnvVar } from '@/types/deployables';
import type { ComponentConfigs } from '@/types/webview';

/**
 * DeployableFieldsSection (D2 Track B — Step 04)
 *
 * Renders ANY selected deployable's user-provided inputs (bucket 3) from its
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
 * not grow — it renders <DeployableFieldsSection /> as one block.
 */
export interface DeployableFieldsSectionProps {
    /** Catalog entries for the project's selected deployables. */
    catalog: DeployableCatalogEntry[];
    /** Current componentConfigs (text values live here, keyed by deployable id). */
    configs: ComponentConfigs;
    /** Resolved provided env values (bucket-2 "connected" sources). */
    provided: Record<string, string>;
    /** Per-deployable "is set" flags for secret vars (booleans only, no values). */
    secretFlags: Record<string, Record<string, boolean>>;
    /** Text edit → componentConfigs path. */
    onTextChange: (deployableId: string, varName: string, value: string) => void;
    /** Secret edit → SecretStorage path (never componentConfigs). */
    onSecretChange: (deployableId: string, varName: string, value: string) => void;
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
    deployableId,
    field,
    value,
    onTextChange,
}: {
    deployableId: string;
    field: DeployableEnvVar;
    value: string;
    onTextChange: (deployableId: string, varName: string, value: string) => void;
}): React.ReactElement {
    return (
        <View id={`field-${field.name}`} marginBottom="size-200">
            <TextField
                label={field.label}
                value={value}
                width="100%"
                onChange={(next) => onTextChange(deployableId, field.name, next)}
            />
        </View>
    );
}

function DeployableGroup({
    group,
    showDivider,
    configs,
    secretFlags,
    onTextChange,
    onSecretChange,
}: {
    group: DeployableFieldGroup;
    showDivider: boolean;
    configs: ComponentConfigs;
    secretFlags: Record<string, Record<string, boolean>>;
    onTextChange: DeployableFieldsSectionProps['onTextChange'];
    onSecretChange: DeployableFieldsSectionProps['onSecretChange'];
}): React.ReactElement {
    const groupConfig = configs[group.id] ?? {};
    const groupFlags = secretFlags[group.id] ?? {};

    return (
        <ConfigSection id={`deployable-${group.id}`} label={group.label} showDivider={showDivider}>
            {group.connectedFields.map(field => (
                <ConnectedRow key={field.name} field={field} />
            ))}
            {group.textFields.map(field => (
                <TextRow
                    key={field.name}
                    deployableId={group.id}
                    field={field}
                    value={String(groupConfig[field.name] ?? '')}
                    onTextChange={onTextChange}
                />
            ))}
            {group.secretFields.map(field => (
                <SecretFieldRow
                    key={field.name}
                    deployableId={group.id}
                    name={field.name}
                    label={field.label}
                    isSet={groupFlags[field.name] === true}
                    onSecretChange={onSecretChange}
                />
            ))}
        </ConfigSection>
    );
}

export function DeployableFieldsSection({
    catalog,
    configs,
    provided,
    secretFlags,
    onTextChange,
    onSecretChange,
}: DeployableFieldsSectionProps): React.ReactElement | null {
    const groups = buildDeployableFieldGroups(catalog, provided);
    if (groups.length === 0) {
        return null;
    }

    return (
        <>
            {groups.map((group, index) => (
                <DeployableGroup
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
