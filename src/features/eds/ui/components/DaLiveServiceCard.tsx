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

import { Flex, Text, ProgressCircle, Picker, Item } from '@adobe/react-spectrum';
import Alert from '@spectrum-icons/workflow/Alert';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useMemo, useState } from 'react';

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
    /** Called when "Connect DA.Live" button clicked to open DA.live in browser */
    onOpenDaLive?: () => void;
    /** Called when "Bookmarklet Setup" link clicked to show setup instructions */
    onOpenBookmarkletSetup?: () => void;
    /** Show compact view (minimal details when another card is active) */
    compact?: boolean;
    /** GitHub username (from OAuth) — shown as the "Personal account" option */
    githubUser?: string;
    /** GitHub orgs the user is a member of — shown as additional picker options */
    availableOrgs?: readonly string[];
    /** Namespace pre-selected in the picker, resolved from demoBuilder.eds.githubOrg setting */
    defaultNamespace?: string;
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
    onOpenDaLive,
    onOpenBookmarkletSetup,
    compact = false,
    githubUser,
    availableOrgs = [],
    defaultNamespace,
}: DaLiveServiceCardProps): React.ReactElement {
    // Picker options: personal account always first, then orgs alphabetically.
    // The picker's `key` is the namespace slug — that's what gets passed to
    // onSubmit, used for repo creation and DA.live writes.
    const namespaceOptions = useMemo(() => {
        const options: { key: string; label: string }[] = [];
        if (githubUser) {
            options.push({ key: githubUser, label: `${githubUser} (Personal account)` });
        }
        const sortedOrgs = [...availableOrgs].sort((a, b) => a.localeCompare(b));
        for (const org of sortedOrgs) {
            options.push({ key: org, label: org });
        }
        return options;
    }, [githubUser, availableOrgs]);

    // Default selection: from the resolver (server-resolved against setting +
    // membership), falling back to the personal user, falling back to first
    // option (defensive — handles the edge case where githubUser is undefined).
    const [selectedNamespace, setSelectedNamespace] = useState<string>(
        defaultNamespace || githubUser || namespaceOptions[0]?.key || '',
    );
    const [tokenValue, setTokenValue] = useState('');

    const isLoading = isChecking || (isAuthenticating && !showInput);
    const canSubmit = selectedNamespace.trim() !== '' && tokenValue.trim() !== '';

    const handleSubmit = () => {
        if (canSubmit) {
            onSubmit(selectedNamespace.trim(), tokenValue.trim());
            setTokenValue('');
        }
    };

    const handleCancel = () => {
        setTokenValue('');
        onCancelInput();
    };

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
                ) : showInput ? (
                    <div className="dalive-input-form">
                        <Picker
                            label="GitHub namespace for this demo"
                            selectedKey={selectedNamespace}
                            onSelectionChange={(key) => setSelectedNamespace(String(key))}
                            items={namespaceOptions}
                            width="100%"
                            isDisabled={namespaceOptions.length === 0}
                        >
                            {(item) => <Item key={item.key}>{item.label}</Item>}
                        </Picker>
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
                        <Flex justifyContent="space-between" alignItems="center">
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
                            <Flex gap="size-200" alignItems="center">
                                {onOpenBookmarkletSetup && (
                                    <button
                                        className="service-action-link"
                                        onClick={onOpenBookmarkletSetup}
                                        type="button"
                                    >
                                        Bookmarklet Setup
                                    </button>
                                )}
                                {onOpenDaLive && (
                                    <button
                                        className="service-action-link"
                                        onClick={onOpenDaLive}
                                        type="button"
                                    >
                                        Open DA.live
                                    </button>
                                )}
                            </Flex>
                        </Flex>
                    </div>
                ) : isAuthenticated ? (
                    compact ? (
                        <Flex alignItems="center" gap="size-100">
                            <CheckmarkCircle size="S" UNSAFE_className="status-icon-success" />
                            <Text UNSAFE_className="status-text">Connected</Text>
                        </Flex>
                    ) : (
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
                    )
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
