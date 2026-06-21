import { Text, View } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';

/**
 * SecretFieldRow (D2 Track B — Step 04)
 *
 * A MASKED input for a deployable's `type:'secret'` env var. Its value is routed
 * to VS Code SecretStorage (never componentConfigs / .env), so the stored value
 * is NEVER round-tripped back to the webview — only an `isSet` boolean. When a
 * secret is already set, the field renders empty with a "set" affordance; typing
 * a new value replaces it.
 *
 * Uses a native masked input (`type="password"`) because the value must be
 * visually obscured and never echoed; this is the one place a native input is
 * preferable to Spectrum's TextField for honest masking.
 */
export interface SecretFieldRowProps {
    deployableId: string;
    name: string;
    label: string;
    isSet: boolean;
    onSecretChange: (deployableId: string, varName: string, value: string) => void;
}

export function SecretFieldRow({
    deployableId,
    name,
    label,
    isSet,
    onSecretChange,
}: SecretFieldRowProps): React.ReactElement {
    const handleChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            onSecretChange(deployableId, name, event.target.value);
        },
        [deployableId, name, onSecretChange],
    );

    const placeholder = isSet ? 'Secret is set — type to replace' : '';

    return (
        <View id={`field-${name}`} marginBottom="size-200">
            <label htmlFor={`secret-input-${name}`}>
                <Text>{label}</Text>
            </label>
            <input
                id={`secret-input-${name}`}
                type="password"
                autoComplete="off"
                placeholder={placeholder}
                onChange={handleChange}
                style={{ width: '100%', boxSizing: 'border-box' }}
            />
            {isSet && (
                <Text UNSAFE_className="text-gray-600 text-sm">Secret is set</Text>
            )}
        </View>
    );
}
