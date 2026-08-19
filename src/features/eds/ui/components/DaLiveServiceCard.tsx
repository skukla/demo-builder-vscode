/**
 * DaLiveServiceCard
 *
 * Presentational component for DA.live authentication, rendered by StorefrontStep.
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

import { Flex, Text, Picker, Item } from '@adobe/react-spectrum';
import Alert from '@spectrum-icons/workflow/Alert';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@/core/ui/components/ui';

/** Stable empty-array reference for the availableOrgs default (re-render guard). */
const EMPTY_ORGS: readonly string[] = [];

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
    /** True when the extension found a DA.live token on the clipboard. */
    clipboardHasToken?: boolean;
    /** Store the clipboard's token against the picked namespace. */
    onUseClipboardToken?: (org: string) => void;
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
}

/** Authenticated view: a compact "Connected" pill, or the verified org with a Change action. */
function renderAuthenticatedView(
    compact: boolean,
    verifiedOrg: string | undefined,
    onReset: () => void,
): React.ReactElement {
    if (compact) {
        return (
            <Flex alignItems="center" gap="size-100">
                <CheckmarkCircle size="S" UNSAFE_className="status-icon-success" />
                <Text UNSAFE_className="status-text">Connected</Text>
            </Flex>
        );
    }
    return (
        <Flex alignItems="center" justifyContent="space-between">
            <Flex alignItems="center" gap="size-100">
                <CheckmarkCircle size="S" UNSAFE_className="status-icon-success" />
                <Text UNSAFE_className="status-text">{verifiedOrg || 'Connected'}</Text>
            </Flex>
            <button className="service-action-link" onClick={onReset}>
                Change
            </button>
        </Flex>
    );
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
    availableOrgs = EMPTY_ORGS,
    clipboardHasToken = false,
    onUseClipboardToken,
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

    // Default selection is always the personal GitHub account (the namespace
    // should always be linked to the GitHub user). Falls back to the first
    // option defensively for the edge case where githubUser is undefined.
    const [selectedNamespace, setSelectedNamespace] = useState<string>(
        githubUser || namespaceOptions[0]?.key || '',
    );

    // githubUser arrives async — OAuth typically completes while this card is
    // already mounted (you connect GitHub on the same Accounts step). Once it
    // lands and the current selection isn't a valid option (i.e. it was empty
    // at mount), default to the personal account. An explicit user pick is
    // always a valid option, so this never clobbers it.
    useEffect(() => {
        if (githubUser && !namespaceOptions.some((o) => o.key === selectedNamespace)) {
            setSelectedNamespace(githubUser);
        }
    }, [githubUser, namespaceOptions, selectedNamespace]);
    const [tokenValue, setTokenValue] = useState('');
    // Set once the user chooses the field over the clipboard. Sticky for the
    // life of the form: flipping back the moment the clipboard changed under
    // them would yank the field away mid-type.
    const [pasteManually, setPasteManually] = useState(false);
    const showClipboardOffer = clipboardHasToken && !pasteManually && Boolean(onUseClipboardToken);

    const isLoading = isChecking || (isAuthenticating && !showInput);
    const canSubmit = selectedNamespace.trim() !== '' && tokenValue.trim() !== '';

    const handleSubmit = () => {
        if (canSubmit) {
            onSubmit(selectedNamespace.trim(), tokenValue.trim());
            setTokenValue('');
        }
    };

    const handleUseClipboard = () => {
        const org = selectedNamespace.trim();
        if (org) {
            onUseClipboardToken?.(org);
        }
    };

    const handleCancel = () => {
        setTokenValue('');
        setPasteManually(false);
        onCancelInput();
    };

    return (
        <div className="service-card" data-connected={isAuthenticated ? 'true' : 'false'}>
            <div className="service-card-header">
                <div className="service-icon dalive-icon">DA</div>
                <div className="service-card-title">DA.live</div>
            </div>
            <div className="service-card-description">Content authoring and management</div>
            <div className="service-card-status">
                {isLoading ? (
                    <Flex alignItems="center" gap="size-100">
                        <Spinner size="S" aria-label="Checking" />
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
                            UNSAFE_className="dalive-namespace-picker"
                        >
                            {(item) => <Item key={item.key}>{item.label}</Item>}
                        </Picker>
                        {/* The bookmarklet has already copied the token, so when
                            the extension can see one we offer the click instead
                            of the paste. The field stays one link away — the
                            clipboard can hold the wrong token, and this is the
                            only place the user can override it. */}
                        {showClipboardOffer ? (
                            <Text UNSAFE_className="status-text">
                                A DA.live token is ready on your clipboard.
                            </Text>
                        ) : (
                            <input
                                type="password"
                                placeholder="Token"
                                value={tokenValue}
                                onChange={(e) => setTokenValue(e.target.value)}
                                className="service-input"
                            />
                        )}
                        {error && <Text UNSAFE_className="status-text-error">{error}</Text>}
                        <Flex justifyContent="space-between" alignItems="center">
                            <Flex gap="size-100">
                                {showClipboardOffer ? (
                                    <button
                                        className="service-action-button"
                                        onClick={handleUseClipboard}
                                        disabled={selectedNamespace.trim() === ''}
                                    >
                                        Use token from clipboard
                                    </button>
                                ) : (
                                    <button
                                        className="service-action-button"
                                        onClick={handleSubmit}
                                        disabled={!canSubmit}
                                    >
                                        Verify
                                    </button>
                                )}
                                <button className="service-action-link" onClick={handleCancel}>
                                    Cancel
                                </button>
                                {showClipboardOffer && (
                                    <button
                                        className="service-action-link"
                                        onClick={() => setPasteManually(true)}
                                        type="button"
                                    >
                                        Paste manually
                                    </button>
                                )}
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
                    renderAuthenticatedView(compact, verifiedOrg, onReset)
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
