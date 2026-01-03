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

import Alert from '@spectrum-icons/workflow/Alert';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useState } from 'react';
import styles from '../styles/connect-services.module.css';
import { Flex, Text, ProgressCircle } from '@/core/ui/components/aria';

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
            className={styles.serviceCard}
            data-connected={isAuthenticated ? 'true' : 'false'}
        >
            <div className={styles.serviceCardHeader}>
                <div className={`${styles.serviceIcon} ${styles.daliveIcon}`}>DA</div>
                <div className={styles.serviceCardTitle}>DA.live</div>
            </div>
            <div className={styles.serviceCardDescription}>
                Content authoring and management
            </div>
            <div className={styles.serviceCardStatus}>
                {isLoading ? (
                    <Flex alignItems="center" gap="size-100">
                        <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                        <Text className={styles.statusText}>
                            {isAuthenticating ? 'Verifying...' : 'Checking...'}
                        </Text>
                    </Flex>
                ) : isAuthenticated ? (
                    compact ? (
                        <Flex alignItems="center" gap="size-100">
                            <CheckmarkCircle size="S" />
                            <Text className={styles.statusText}>Connected</Text>
                        </Flex>
                    ) : (
                        <Flex alignItems="center" justifyContent="space-between">
                            <Flex alignItems="center" gap="size-100">
                                <CheckmarkCircle size="S" />
                                <Text className={styles.statusText}>
                                    {verifiedOrg || 'Connected'}
                                </Text>
                            </Flex>
                            <button className={styles.serviceActionLink} onClick={onReset}>
                                Change
                            </button>
                        </Flex>
                    )
                ) : showInput ? (
                    <div className={styles.daliveInputForm}>
                        <input
                            type="text"
                            placeholder="Organization"
                            value={orgValue}
                            onChange={(e) => setOrgValue(e.target.value)}
                            className={styles.serviceInput}
                        />
                        <input
                            type="password"
                            placeholder="Token"
                            value={tokenValue}
                            onChange={(e) => setTokenValue(e.target.value)}
                            className={styles.serviceInput}
                        />
                        {error && (
                            <Text className={styles.statusTextError}>{error}</Text>
                        )}
                        <Flex gap="size-100">
                            <button
                                className={styles.serviceActionButton}
                                onClick={handleSubmit}
                                disabled={!canSubmit}
                            >
                                Verify
                            </button>
                            <button
                                className={styles.serviceActionLink}
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
                            <Text className={styles.statusTextError}>{error}</Text>
                        </Flex>
                        <button className={styles.serviceActionButton} onClick={onSetup}>
                            Try Again
                        </button>
                    </Flex>
                ) : (
                    <button className={styles.serviceActionButton} onClick={onSetup}>
                        {setupComplete ? 'Connect DA.live' : 'Set up DA.live'}
                    </button>
                )}
            </div>
        </div>
    );
}
