/**
 * DaLiveServiceCard
 *
 * Presentational component for DA.live authentication in ConnectServicesStep.
 * Supports both card and checklist layout variants.
 *
 * @example
 * <DaLiveServiceCard
 *   isChecking={false}
 *   isAuthenticating={false}
 *   isAuthenticated={true}
 *   verifiedOrg="my-org"
 *   showInput={false}
 *   onSetup={handleSetup}
 *   onSubmit={handleSubmit}
 *   onReset={handleReset}
 *   onCancelInput={handleCancel}
 *   variant="card"
 * />
 */

import React, { useState } from 'react';
import { Flex, Text, ProgressCircle } from '@/core/ui/components/aria';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Alert from '@spectrum-icons/workflow/Alert';
import {
    serviceCard,
    serviceCardHeader,
    serviceIcon,
    daliveIcon,
    serviceCardTitle,
    serviceCardDescription,
    serviceCardStatus,
    statusText,
    statusIconSuccess,
    serviceActionLink,
    daliveInputForm,
    serviceInput,
    statusTextError,
    serviceActionButton,
    statusIconError,
} from '../styles/connect-services.module.css';

/** Props for DaLiveServiceCard component */
export interface DaLiveServiceCardProps {
    /** Whether auth status is being checked */
    isChecking: boolean;
    /** Whether authentication is in progress */
    isAuthenticating: boolean;
    /** Whether user is authenticated */
    isAuthenticated: boolean;
    /** Verified organization name */
    verifiedOrg?: string;
    /** Error message to display */
    error?: string;
    /** Whether to show the input form */
    showInput: boolean;
    /** Whether DA.live setup is already complete */
    setupComplete?: boolean;
    /** Called when setup/connect button clicked */
    onSetup: () => void;
    /** Called when token form submitted */
    onSubmit: (org: string, token: string) => void;
    /** Called when reset/change account clicked */
    onReset: () => void;
    /** Called when input form cancelled */
    onCancelInput: () => void;
    /** Show compact view (minimal details when another card is active) */
    compact?: boolean;
}

/**
 * DaLiveServiceCard Component
 *
 * Displays DA.live authentication status with appropriate actions.
 * Pure presentational component - no business logic.
 */
export function DaLiveServiceCard({
    isChecking,
    isAuthenticating,
    isAuthenticated,
    verifiedOrg,
    error,
    showInput,
    setupComplete,
    onSetup,
    onSubmit,
    onReset,
    onCancelInput,
    compact = false,
}: DaLiveServiceCardProps): React.ReactElement {
    const [orgValue, setOrgValue] = useState('');
    const [tokenValue, setTokenValue] = useState('');

    const isLoading = isChecking || (isAuthenticating && !showInput);
    const canSubmit = orgValue.trim() !== '' && tokenValue.trim() !== '';

    const handleSubmit = () => {
        if (canSubmit) {
            onSubmit(orgValue.trim(), tokenValue.trim());
            setOrgValue('');
            setTokenValue('');
        }
    };

    const handleCancel = () => {
        setOrgValue('');
        setTokenValue('');
        onCancelInput();
    };

    return (
        <div
            className={serviceCard}
            data-connected={isAuthenticated ? 'true' : 'false'}
        >
            <div className={serviceCardHeader}>
                <div className={`${serviceIcon} ${daliveIcon}`}>DA</div>
                <div className={serviceCardTitle}>DA.live</div>
            </div>
            <div className={serviceCardDescription}>
                Content authoring and management
            </div>
            <div className={serviceCardStatus}>
                {isLoading ? (
                    <Flex alignItems="center" gap="size-100">
                        <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                        <Text className={statusText}>
                            {isAuthenticating ? 'Verifying...' : 'Checking...'}
                        </Text>
                    </Flex>
                ) : isAuthenticated ? (
                    compact ? (
                        <Flex alignItems="center" gap="size-100">
                            <CheckmarkCircle size="S" />
                            <Text className={statusText}>Connected</Text>
                        </Flex>
                    ) : (
                        <Flex alignItems="center" justifyContent="space-between">
                            <Flex alignItems="center" gap="size-100">
                                <CheckmarkCircle size="S" />
                                <Text className={statusText}>
                                    {verifiedOrg || 'Connected'}
                                </Text>
                            </Flex>
                            <button className={serviceActionLink} onClick={onReset}>
                                Change
                            </button>
                        </Flex>
                    )
                ) : showInput ? (
                    <div className={daliveInputForm}>
                        <input
                            type="text"
                            placeholder="Organization"
                            value={orgValue}
                            onChange={(e) => setOrgValue(e.target.value)}
                            className={serviceInput}
                        />
                        <input
                            type="password"
                            placeholder="Token"
                            value={tokenValue}
                            onChange={(e) => setTokenValue(e.target.value)}
                            className={serviceInput}
                        />
                        {error && (
                            <Text className={statusTextError}>{error}</Text>
                        )}
                        <Flex gap="size-100">
                            <button
                                className={serviceActionButton}
                                onClick={handleSubmit}
                                disabled={!canSubmit}
                            >
                                Verify
                            </button>
                            <button
                                className={serviceActionLink}
                                onClick={handleCancel}
                            >
                                Cancel
                            </button>
                        </Flex>
                    </div>
                ) : error ? (
                    <Flex direction="column" gap="size-100">
                        <Flex alignItems="center" gap="size-100">
                            <Alert size="S" />
                            <Text className={statusTextError}>{error}</Text>
                        </Flex>
                        <button className={serviceActionButton} onClick={onSetup}>
                            Try Again
                        </button>
                    </Flex>
                ) : (
                    <button className={serviceActionButton} onClick={onSetup}>
                        {setupComplete ? 'Connect DA.live' : 'Set up DA.live'}
                    </button>
                )}
            </div>
        </div>
    );
}
