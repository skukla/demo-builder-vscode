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
import { Flex, Text, ProgressCircle } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Alert from '@spectrum-icons/workflow/Alert';

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
    /** Layout variant */
    variant: 'card' | 'checklist';
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
    variant,
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

    // Render card variant
    if (variant === 'card') {
        return (
            <div
                className="service-card"
                data-connected={isAuthenticated ? 'true' : 'false'}
            >
                <div className="service-card-header">
                    <div className="service-icon dalive-icon">DA</div>
                    <div className="service-card-title">DA.live</div>
                </div>
                <div className="service-card-description">
                    Content authoring and management
                </div>
                <div className="service-card-status">
                    {isLoading ? (
                        <Flex alignItems="center" gap="size-100">
                            <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                            <Text UNSAFE_className="status-text">
                                {isAuthenticating ? 'Verifying...' : 'Checking...'}
                            </Text>
                        </Flex>
                    ) : isAuthenticated ? (
                        <Flex alignItems="center" justifyContent="space-between">
                            <Flex alignItems="center" gap="size-100">
                                <CheckmarkCircle size="S" UNSAFE_className="status-icon-success" />
                                <Text UNSAFE_className="status-text">
                                    {verifiedOrg || 'Connected'}
                                </Text>
                            </Flex>
                            <button className="service-action-link" onClick={onReset}>
                                Change
                            </button>
                        </Flex>
                    ) : showInput ? (
                        <div className="dalive-input-form">
                            <input
                                type="text"
                                placeholder="Organization"
                                value={orgValue}
                                onChange={(e) => setOrgValue(e.target.value)}
                                className="service-input"
                            />
                            <input
                                type="password"
                                placeholder="Token"
                                value={tokenValue}
                                onChange={(e) => setTokenValue(e.target.value)}
                                className="service-input"
                            />
                            {error && (
                                <Text UNSAFE_className="status-text-error">{error}</Text>
                            )}
                            <Flex gap="size-100">
                                <button
                                    className="service-action-button"
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                >
                                    Verify
                                </button>
                                <button
                                    className="service-action-link"
                                    onClick={handleCancel}
                                >
                                    Cancel
                                </button>
                            </Flex>
                        </div>
                    ) : error ? (
                        <Flex direction="column" gap="size-100">
                            <Flex alignItems="center" gap="size-100">
                                <Alert size="S" UNSAFE_className="status-icon-error" />
                                <Text UNSAFE_className="status-text-error">{error}</Text>
                            </Flex>
                            <button className="service-action-button" onClick={onSetup}>
                                Try Again
                            </button>
                        </Flex>
                    ) : (
                        <button className="service-action-button" onClick={onSetup}>
                            {setupComplete ? 'Connect DA.live' : 'Set up DA.live'}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Render checklist variant
    return (
        <div
            className="checklist-item"
            data-connected={isAuthenticated ? 'true' : 'false'}
        >
            <div className="checklist-indicator">
                {isLoading ? (
                    <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                ) : isAuthenticated ? (
                    <CheckmarkCircle size="S" UNSAFE_className="status-icon-success" />
                ) : (
                    <div className="checklist-circle" />
                )}
            </div>
            <div className="checklist-content">
                <div className="checklist-header">
                    <div className="checklist-title">
                        <div className="service-icon-small dalive-icon">DA</div>
                        DA.live
                    </div>
                    <div className="checklist-action">
                        {isLoading ? (
                            <span className="status-text-muted">
                                {isAuthenticating ? 'Verifying...' : 'Checking...'}
                            </span>
                        ) : isAuthenticated ? (
                            <button className="service-action-link" onClick={onReset}>
                                Change
                            </button>
                        ) : showInput ? null : (
                            <button className="service-action-button-small" onClick={onSetup}>
                                {setupComplete ? 'Connect' : 'Set up'}
                            </button>
                        )}
                    </div>
                </div>
                <div className="checklist-description">
                    {isAuthenticated ? (
                        <span>Connected to <strong>{verifiedOrg || 'DA.live'}</strong></span>
                    ) : showInput ? (
                        <div className="checklist-input-form">
                            <input
                                type="text"
                                placeholder="Organization"
                                value={orgValue}
                                onChange={(e) => setOrgValue(e.target.value)}
                                className="service-input-small"
                            />
                            <input
                                type="password"
                                placeholder="Token"
                                value={tokenValue}
                                onChange={(e) => setTokenValue(e.target.value)}
                                className="service-input-small"
                            />
                            {error && (
                                <Text UNSAFE_className="status-text-error text-sm">{error}</Text>
                            )}
                            <Flex gap="size-100" marginTop="size-100">
                                <button
                                    className="service-action-button-small"
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                >
                                    Verify
                                </button>
                                <button
                                    className="service-action-link"
                                    onClick={handleCancel}
                                >
                                    Cancel
                                </button>
                            </Flex>
                        </div>
                    ) : error ? (
                        <span className="status-text-error">{error}</span>
                    ) : (
                        'Content authoring and management'
                    )}
                </div>
            </div>
        </div>
    );
}
