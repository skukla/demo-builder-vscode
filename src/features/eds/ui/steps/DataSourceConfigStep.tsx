/**
 * DataSourceConfigStep
 *
 * Wizard step for configuring content and data sources for Edge Delivery Services (EDS) projects.
 *
 * Features:
 * - DA.live organization verification and site configuration
 * - ACCS host URL input with validation
 * - Store view code configuration
 * - Customer group configuration
 * - Data source selection (CitiSignal presets or custom)
 * - ACCS credential validation
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    Divider,
    Heading,
    Text,
    TextField,
    Picker,
    Item,
    Button,
    ProgressCircle,
    Flex,
} from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Alert from '@spectrum-icons/workflow/Alert';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import type { BaseStepProps } from '@/types/wizard';

const log = webviewLogger('DataSourceConfigStep');

/** Data source options */
const DATA_SOURCE_OPTIONS = [
    { id: 'citisignal-electronics', name: 'CitiSignal Electronics' },
    { id: 'citisignal-fashion', name: 'CitiSignal Fashion' },
    { id: 'custom', name: 'Custom ACCS Instance' },
];

/** URL validation pattern */
const HTTPS_URL_PATTERN = /^https:\/\/.+/;

/** DA.live org verification result */
interface DaLiveOrgVerifiedData {
    verified: boolean;
    orgName: string;
    error?: string;
}

/** ACCS validation result message */
interface AccsValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * DataSourceConfigStep Component
 */
export function DataSourceConfigStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps): React.ReactElement {
    const edsConfig = state.edsConfig;
    const [isValidating, setIsValidating] = useState(false);
    const [isVerifyingOrg, setIsVerifyingOrg] = useState(false);
    const [hostError, setHostError] = useState<string | undefined>();

    // Get DA.live field values
    const daLiveOrg = edsConfig?.daLiveOrg || '';
    const daLiveSite = edsConfig?.daLiveSite || '';
    const daLiveOrgVerified = edsConfig?.daLiveOrgVerified;
    const daLiveOrgError = edsConfig?.daLiveOrgError;

    // Get ACCS field values
    const accsHost = edsConfig?.accsHost || '';
    const storeViewCode = edsConfig?.storeViewCode || '';
    const customerGroup = edsConfig?.customerGroup || '';
    const dataSource = edsConfig?.dataSource || 'custom';
    const accsValidated = edsConfig?.accsValidated || false;
    const accsValidationError = edsConfig?.accsValidationError;

    /**
     * Update EDS config state
     */
    const updateEdsConfig = useCallback((updates: Partial<typeof edsConfig>) => {
        updateState({
            edsConfig: {
                ...edsConfig,
                accsHost: edsConfig?.accsHost || '',
                storeViewCode: edsConfig?.storeViewCode || '',
                customerGroup: edsConfig?.customerGroup || '',
                repoName: edsConfig?.repoName || '',
                daLiveOrg: edsConfig?.daLiveOrg || '',
                daLiveSite: edsConfig?.daLiveSite || '',
                ...updates,
            },
        });
    }, [edsConfig, updateState]);

    /**
     * Validate ACCS host URL format
     */
    const validateHostUrl = useCallback((url: string): boolean => {
        if (!url) return false;
        return HTTPS_URL_PATTERN.test(url);
    }, []);

    /**
     * Handle ACCS host change
     */
    const handleHostChange = useCallback((value: string) => {
        // Clear validation when host changes
        updateEdsConfig({
            accsHost: value,
            accsValidated: false,
            accsValidationError: undefined,
        });

        // Validate format
        if (value && !validateHostUrl(value)) {
            setHostError('URL must start with https://');
        } else {
            setHostError(undefined);
        }
    }, [updateEdsConfig, validateHostUrl]);

    /**
     * Handle store view code change
     */
    const handleStoreViewChange = useCallback((value: string) => {
        updateEdsConfig({
            storeViewCode: value,
            accsValidated: false,
            accsValidationError: undefined,
        });
    }, [updateEdsConfig]);

    /**
     * Handle customer group change
     */
    const handleCustomerGroupChange = useCallback((value: string) => {
        updateEdsConfig({
            customerGroup: value,
            accsValidated: false,
            accsValidationError: undefined,
        });
    }, [updateEdsConfig]);

    /**
     * Handle data source selection
     */
    const handleDataSourceChange = useCallback((key: React.Key | null) => {
        if (key === null) return;
        const selectedSource = key as 'citisignal-electronics' | 'citisignal-fashion' | 'custom';
        updateEdsConfig({
            dataSource: selectedSource,
            accsValidated: false,
            accsValidationError: undefined,
        });
    }, [updateEdsConfig]);

    /**
     * Handle DA.live org change
     */
    const handleDaLiveOrgChange = useCallback((value: string) => {
        updateEdsConfig({
            daLiveOrg: value,
            daLiveOrgVerified: undefined,
            daLiveOrgError: undefined,
        });
    }, [updateEdsConfig]);

    /**
     * Handle DA.live site change
     */
    const handleDaLiveSiteChange = useCallback((value: string) => {
        updateEdsConfig({ daLiveSite: value });
    }, [updateEdsConfig]);

    /**
     * Verify DA.live organization access
     */
    const verifyDaLiveOrg = useCallback((orgName: string) => {
        if (!orgName) return;

        log.debug('Verifying DA.live org access:', orgName);
        setIsVerifyingOrg(true);

        webviewClient.postMessage('verify-dalive-org', {
            orgName,
        });
    }, []);

    /**
     * Handle DA.live org blur - trigger verification
     */
    const handleDaLiveOrgBlur = useCallback(() => {
        if (daLiveOrg && daLiveOrgVerified === undefined) {
            verifyDaLiveOrg(daLiveOrg);
        }
    }, [daLiveOrg, daLiveOrgVerified, verifyDaLiveOrg]);

    /**
     * Validate ACCS credentials
     */
    const handleValidate = useCallback(async () => {
        if (!accsHost || !storeViewCode || !customerGroup) {
            return;
        }

        if (!validateHostUrl(accsHost)) {
            setHostError('URL must start with https://');
            return;
        }

        log.debug('Validating ACCS credentials');
        setIsValidating(true);

        webviewClient.postMessage('validate-accs-credentials', {
            accsHost,
            storeViewCode,
            customerGroup,
        });
    }, [accsHost, storeViewCode, customerGroup, validateHostUrl]);

    // Listen for DA.live org verification result
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('dalive-org-verified', (data) => {
            const result = data as DaLiveOrgVerifiedData;
            log.debug('DA.live org verification result:', result);
            setIsVerifyingOrg(false);

            updateEdsConfig({
                daLiveOrgVerified: result.verified,
                daLiveOrgError: result.error,
            });
        });

        return unsubscribe;
    }, [updateEdsConfig]);

    // Listen for ACCS validation result
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('accs-validation-result', (data) => {
            const result = data as AccsValidationResult;
            log.debug('ACCS validation result:', result);
            setIsValidating(false);

            updateEdsConfig({
                accsValidated: result.valid,
                accsValidationError: result.error,
            });
        });

        return unsubscribe;
    }, [updateEdsConfig]);

    // Update canProceed based on validation state
    useEffect(() => {
        // DA.live requirements
        const daLiveValid = daLiveOrg && daLiveOrgVerified === true && daLiveSite;

        // ACCS requirements
        const accsValid = accsValidated &&
            accsHost &&
            storeViewCode &&
            customerGroup &&
            validateHostUrl(accsHost);

        const isValid = daLiveValid && accsValid;
        setCanProceed(!!isValid);
    }, [daLiveOrg, daLiveOrgVerified, daLiveSite, accsValidated, accsHost, storeViewCode, customerGroup, validateHostUrl, setCanProceed]);

    // Determine if validate button should be enabled
    const canValidate = accsHost && storeViewCode && customerGroup && validateHostUrl(accsHost) && !isValidating;

    return (
        <SingleColumnLayout>
            {/* DA.live Content Source Section */}
            <Heading level={2} marginBottom="size-200">
                DA.live Content Source
            </Heading>

            <Text marginBottom="size-300" UNSAFE_className="text-sm text-gray-600">
                DA.live provides content authoring for your Edge Delivery site.
            </Text>

            {/* DA.live Organization */}
            <Flex alignItems="end" gap="size-200" marginBottom="size-300">
                <TextField
                    label="Organization"
                    value={daLiveOrg}
                    onChange={handleDaLiveOrgChange}
                    onBlur={handleDaLiveOrgBlur}
                    placeholder="your-org"
                    description="Your DA.live organization name"
                    width="100%"
                    isRequired
                    validationState={daLiveOrgError ? 'invalid' : (daLiveOrgVerified ? 'valid' : undefined)}
                />

                {isVerifyingOrg && (
                    <ProgressCircle
                        aria-label="Verifying organization"
                        isIndeterminate
                        size="S"
                    />
                )}

                {daLiveOrgVerified && !isVerifyingOrg && (
                    <Flex alignItems="center" gap="size-100">
                        <CheckmarkCircle
                            size="S"
                            UNSAFE_className="text-green-500"
                        />
                        <Text UNSAFE_style={{ color: 'var(--spectrum-semantic-positive-color-text-small)' }}>
                            Verified
                        </Text>
                    </Flex>
                )}
            </Flex>

            {daLiveOrgError && (
                <Flex alignItems="center" gap="size-100" marginBottom="size-300">
                    <Alert
                        size="S"
                        UNSAFE_className="text-red-500"
                    />
                    <Text UNSAFE_style={{ color: 'var(--spectrum-semantic-negative-color-text-small)' }}>
                        {daLiveOrgError}
                    </Text>
                </Flex>
            )}

            {/* DA.live Site */}
            <TextField
                label="Site Name"
                value={daLiveSite}
                onChange={handleDaLiveSiteChange}
                placeholder="my-site"
                description="Name for your DA.live site"
                width="100%"
                isRequired
                marginBottom="size-400"
            />

            <Divider size="M" marginY="size-400" />

            {/* ACCS Configuration Section */}
            <Heading level={2} marginBottom="size-200">
                ACCS Configuration
            </Heading>

            <Text marginBottom="size-400">
                Configure your Adobe Commerce Catalog Service (ACCS) connection for Edge Delivery Services.
            </Text>

            {/* Data Source Selection */}
            <Picker
                label="Data Source"
                selectedKey={dataSource}
                onSelectionChange={handleDataSourceChange}
                width="100%"
                marginBottom="size-300"
            >
                {DATA_SOURCE_OPTIONS.map(option => (
                    <Item key={option.id}>{option.name}</Item>
                ))}
            </Picker>

            {/* ACCS Host URL */}
            <TextField
                label="ACCS Host"
                value={accsHost}
                onChange={handleHostChange}
                onBlur={() => {
                    if (accsHost && !validateHostUrl(accsHost)) {
                        setHostError('URL must start with https://');
                    }
                }}
                validationState={hostError ? 'invalid' : undefined}
                errorMessage={hostError}
                placeholder="https://your-accs-instance.adobecommerce.com"
                width="100%"
                marginBottom="size-300"
                isRequired
            />

            {/* Store View Code */}
            <TextField
                label="Store View Code"
                value={storeViewCode}
                onChange={handleStoreViewChange}
                placeholder="default"
                width="100%"
                marginBottom="size-300"
                isRequired
            />

            {/* Customer Group */}
            <TextField
                label="Customer Group"
                value={customerGroup}
                onChange={handleCustomerGroupChange}
                placeholder="general"
                width="100%"
                marginBottom="size-400"
                isRequired
            />

            {/* Validation Section */}
            <Flex alignItems="center" gap="size-200" marginBottom="size-200">
                <Button
                    variant="secondary"
                    onPress={handleValidate}
                    isDisabled={!canValidate}
                >
                    {isValidating ? 'Validating...' : 'Validate Connection'}
                </Button>

                {isValidating && (
                    <ProgressCircle
                        aria-label="Validating"
                        isIndeterminate
                        size="S"
                    />
                )}

                {accsValidated && !isValidating && (
                    <Flex alignItems="center" gap="size-100">
                        <CheckmarkCircle
                            size="S"
                            UNSAFE_className="text-green-500"
                        />
                        <Text UNSAFE_style={{ color: 'var(--spectrum-semantic-positive-color-text-small)' }}>
                            Connection validated
                        </Text>
                    </Flex>
                )}

                {accsValidationError && !isValidating && (
                    <Flex alignItems="center" gap="size-100">
                        <Alert
                            size="S"
                            UNSAFE_className="text-red-500"
                        />
                        <Text UNSAFE_style={{ color: 'var(--spectrum-semantic-negative-color-text-small)' }}>
                            {accsValidationError}
                        </Text>
                    </Flex>
                )}
            </Flex>
        </SingleColumnLayout>
    );
}
