/**
 * DaLiveOrgConfigSection
 *
 * Optional configuration section for DA.live organization settings.
 * These settings are stored per-org and apply to all EDS projects.
 *
 * - AEM Author URL: For DA.live content authoring with AEM Assets
 * - IMS Org ID: For Universal Editor path generation
 *
 * Settings are optional and can be configured later via the Configure UI.
 */

import React from 'react';
import {
    TextField,
    Flex,
    Text,
    ActionButton,
} from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronUp from '@spectrum-icons/workflow/ChevronUp';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';

export interface DaLiveOrgConfigData {
    /** AEM Author environment URL for DA.live content authoring (e.g., author-p12345-e67890.adobeaemcloud.com) */
    aemAuthorUrl?: string;
    /** IMS Organization ID for Universal Editor (e.g., demosystem) */
    imsOrgId?: string;
}

interface DaLiveOrgConfigSectionProps {
    /** Current configuration values */
    config: DaLiveOrgConfigData;
    /** Callback when configuration changes */
    onChange: (config: DaLiveOrgConfigData) => void;
    /** Whether the section is expanded */
    isExpanded: boolean;
    /** Callback to toggle expanded state */
    onToggleExpanded: () => void;
    /** Whether the form is disabled (e.g., during loading) */
    isDisabled?: boolean;
}

/**
 * Validates AEM Author URL format
 */
function validateAemAuthorUrl(value: string): string | undefined {
    if (!value) return undefined; // Optional field
    const pattern = /^(author|delivery)-p\d+-e\d+\.adobeaemcloud\.com$/;
    if (!pattern.test(value)) {
        return 'Format: author-pXXXXX-eYYYYY.adobeaemcloud.com';
    }
    return undefined;
}

/**
 * Validates IMS Org ID format (simple alphanumeric)
 */
function validateImsOrgId(value: string): string | undefined {
    if (!value) return undefined; // Optional field
    // IMS org IDs are typically alphanumeric with possible hyphens
    const pattern = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;
    if (!pattern.test(value)) {
        return 'Letters, numbers, and hyphens only';
    }
    return undefined;
}

/**
 * DaLiveOrgConfigSection Component
 *
 * Collapsible section for optional org-level configuration.
 */
export function DaLiveOrgConfigSection({
    config,
    onChange,
    isExpanded,
    onToggleExpanded,
    isDisabled = false,
}: DaLiveOrgConfigSectionProps): React.ReactElement {
    const aemError = validateAemAuthorUrl(config.aemAuthorUrl || '');
    const imsError = validateImsOrgId(config.imsOrgId || '');

    const hasValues = config.aemAuthorUrl || config.imsOrgId;

    return (
        <Flex direction="column" gap="size-200" width="100%">
            {/* Header with toggle */}
            <Flex alignItems="center" gap="size-100">
                <ActionButton
                    isQuiet
                    onPress={onToggleExpanded}
                    aria-label={isExpanded ? 'Collapse settings' : 'Expand settings'}
                    aria-expanded={isExpanded}
                >
                    {isExpanded ? <ChevronUp size="S" /> : <ChevronDown size="S" />}
                    <Text>Advanced Settings</Text>
                </ActionButton>
                {hasValues && !isExpanded && (
                    <Text UNSAFE_className="text-gray-500 text-sm">
                        (configured)
                    </Text>
                )}
            </Flex>

            {/* Collapsible content */}
            {isExpanded && (
                <Flex direction="column" gap="size-300" marginStart="size-300">
                    {/* Info text */}
                    <Flex alignItems="start" gap="size-100">
                        <InfoOutline size="S" UNSAFE_style={{ marginTop: '2px', flexShrink: 0 }} />
                        <Text UNSAFE_className="text-sm text-gray-600">
                            Optional settings for AEM Assets and Universal Editor integration.
                            These apply to all projects in this organization.
                        </Text>
                    </Flex>

                    {/* AEM Author URL */}
                    <TextField
                        label="AEM Author URL"
                        value={config.aemAuthorUrl || ''}
                        onChange={(value) => onChange({ ...config, aemAuthorUrl: value })}
                        placeholder="author-p12345-e67890.adobeaemcloud.com"
                        width="100%"
                        isDisabled={isDisabled}
                        validationState={aemError ? 'invalid' : undefined}
                        description="AEM Author environment URL for DA.live content authoring"
                    />
                    {aemError && (
                        <Text UNSAFE_className="text-red-600 text-sm -mt-2">
                            {aemError}
                        </Text>
                    )}

                    {/* IMS Org ID */}
                    <TextField
                        label="IMS Organization ID"
                        value={config.imsOrgId || ''}
                        onChange={(value) => onChange({ ...config, imsOrgId: value })}
                        placeholder="demosystem"
                        width="100%"
                        isDisabled={isDisabled}
                        validationState={imsError ? 'invalid' : undefined}
                        description="Adobe IMS org for Universal Editor access"
                    />
                    {imsError && (
                        <Text UNSAFE_className="text-red-600 text-sm -mt-2">
                            {imsError}
                        </Text>
                    )}
                </Flex>
            )}
        </Flex>
    );
}
