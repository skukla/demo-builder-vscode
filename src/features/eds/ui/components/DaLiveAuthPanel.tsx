/**
 * DaLiveAuthPanel
 *
 * Panel component for DA.live authentication status and actions.
 * Uses a bookmarklet-based token extraction flow.
 * Used within ConnectServicesStep for side-by-side auth display.
 */

import React, { useState } from 'react';
import { Flex, Heading, Text, Button, TextField, ProgressCircle } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Alert from '@spectrum-icons/workflow/Alert';

interface DaLiveAuthPanelProps {
    isAuthenticated: boolean;
    isAuthenticating: boolean;
    isChecking: boolean;
    error?: string;
    onSignIn: () => void;
    onPasteToken: (token: string, orgName: string) => void;
    onReset?: () => void;
    setupComplete: boolean;
    /** Pre-configured org name (for display when already verified) */
    verifiedOrg?: string;
}

export function DaLiveAuthPanel({
    isAuthenticated,
    isAuthenticating,
    isChecking,
    error,
    onSignIn,
    onPasteToken,
    onReset,
    setupComplete,
    verifiedOrg,
}: DaLiveAuthPanelProps): React.ReactElement {
    const [showTokenInput, setShowTokenInput] = useState(false);
    const [tokenValue, setTokenValue] = useState('');
    const [orgValue, setOrgValue] = useState('');

    const handleSignInClick = () => {
        onSignIn();
        setShowTokenInput(true);
    };

    const handleSubmitToken = () => {
        if (tokenValue.trim() && orgValue.trim()) {
            onPasteToken(tokenValue.trim(), orgValue.trim());
            setTokenValue('');
            setOrgValue('');
            setShowTokenInput(false);
        }
    };

    const canSubmit = tokenValue.trim() !== '' && orgValue.trim() !== '';

    return (
        <Flex direction="column" gap="size-200">
            {/* Panel header */}
            <div className="panel-header">
                <div className="da-icon">DA</div>
                <Heading level={3} margin={0}>
                    DA.live
                </Heading>
            </div>

            <Text UNSAFE_className="text-sm text-gray-600">
                Required for managing content in Document Authoring.
            </Text>

            {/* Status display */}
            <div className="auth-status-area">
                {isChecking || (isAuthenticating && !showTokenInput) ? (
                    <Flex alignItems="center" gap="size-150" marginTop="size-200">
                        <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                        <Text>{isAuthenticating ? 'Verifying...' : 'Checking connection...'}</Text>
                    </Flex>
                ) : isAuthenticated ? (
                    <Flex direction="column" gap="size-100" marginTop="size-200">
                        <Flex alignItems="center" justifyContent="space-between">
                            <Flex alignItems="center" gap="size-150">
                                <CheckmarkCircle size="S" UNSAFE_className="text-green-500" />
                                <Text>Connected to DA.live</Text>
                            </Flex>
                            {onReset && (
                                <Button variant="secondary" isQuiet onPress={onReset} UNSAFE_className="text-sm">
                                    Change
                                </Button>
                            )}
                        </Flex>
                        {verifiedOrg && (
                            <Text UNSAFE_className="text-sm text-gray-600" marginStart="size-350">
                                Organization: <strong>{verifiedOrg}</strong>
                            </Text>
                        )}
                    </Flex>
                ) : showTokenInput ? (
                    <Flex direction="column" gap="size-200" marginTop="size-200">
                        <Text UNSAFE_className="text-sm">
                            {setupComplete
                                ? 'Run your bookmarklet on da.live, then enter your organization and token:'
                                : 'Follow the setup instructions, then enter your organization and token:'}
                        </Text>
                        <TextField
                            label="Organization"
                            value={orgValue}
                            onChange={setOrgValue}
                            width="100%"
                            placeholder="your-org"
                            description="Your DA.live organization name"
                            isRequired
                        />
                        <TextField
                            label="Token"
                            value={tokenValue}
                            onChange={setTokenValue}
                            type="password"
                            width="100%"
                            placeholder="Paste token here..."
                            isRequired
                        />
                        {error && (
                            <Text UNSAFE_className="text-red-600 text-sm">{error}</Text>
                        )}
                        <Flex gap="size-100">
                            <Button variant="accent" onPress={handleSubmitToken} isDisabled={!canSubmit}>
                                Verify
                            </Button>
                            <Button variant="secondary" onPress={() => setShowTokenInput(false)}>
                                Cancel
                            </Button>
                        </Flex>
                    </Flex>
                ) : error ? (
                    <Flex direction="column" gap="size-150" marginTop="size-200">
                        <Flex alignItems="center" gap="size-100">
                            <Alert size="S" UNSAFE_className="text-red-500" />
                            <Text UNSAFE_className="text-red-600">{error}</Text>
                        </Flex>
                        <Button variant="accent" onPress={handleSignInClick}>
                            Try Again
                        </Button>
                    </Flex>
                ) : (
                    <Button variant="accent" marginTop="size-200" onPress={handleSignInClick}>
                        {setupComplete ? 'Sign in to DA.live' : 'Set up DA.live'}
                    </Button>
                )}
            </div>

            <style>{`
                .panel-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .panel-header h3 {
                    line-height: 1;
                }
                .da-icon {
                    width: 20px;
                    height: 20px;
                    background: var(--spectrum-global-color-gray-700);
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    font-weight: 700;
                    color: var(--spectrum-global-color-gray-50);
                }
                .text-sm { font-size: 0.875rem; }
                .text-gray-600 { color: var(--spectrum-global-color-gray-600); }
                .text-green-500 { color: var(--spectrum-semantic-positive-color-icon); }
                .text-red-500 { color: var(--spectrum-semantic-negative-color-icon); }
                .text-red-600 { color: var(--spectrum-semantic-negative-color-text-small); }
            `}</style>
        </Flex>
    );
}
