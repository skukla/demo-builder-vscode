/**
 * GitHubAuthPanel
 *
 * Panel component for GitHub authentication status and actions.
 * Used within ConnectServicesStep for side-by-side auth display.
 */

import React from 'react';
import { Flex, Heading, Text, Button, ProgressCircle } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Alert from '@spectrum-icons/workflow/Alert';
import Code from '@spectrum-icons/workflow/Code';

interface GitHubAuthPanelProps {
    isAuthenticated: boolean;
    isAuthenticating: boolean;
    isChecking: boolean;
    user?: { login: string; avatarUrl?: string; email?: string };
    error?: string;
    onSignIn: () => void;
    onChangeAccount?: () => void;
}

export function GitHubAuthPanel({
    isAuthenticated,
    isAuthenticating,
    isChecking,
    user,
    error,
    onSignIn,
    onChangeAccount,
}: GitHubAuthPanelProps): React.ReactElement {
    return (
        <Flex direction="column" gap="size-200">
            {/* Panel header */}
            <div className="panel-header">
                <Code size="S" />
                <Heading level={3} margin={0}>
                    GitHub
                </Heading>
            </div>

            <Text UNSAFE_className="text-sm text-gray-600">
                Required for creating and managing your project repository.
            </Text>

            {/* Status display */}
            <div className="auth-status-area">
                {isChecking || isAuthenticating ? (
                    <Flex alignItems="center" gap="size-150" marginTop="size-200">
                        <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                        <Text>{isAuthenticating ? 'Connecting to GitHub...' : 'Checking connection...'}</Text>
                    </Flex>
                ) : isAuthenticated && user ? (
                    <Flex alignItems="center" justifyContent="space-between" marginTop="size-200">
                        <Flex alignItems="center" gap="size-150">
                            <CheckmarkCircle size="S" UNSAFE_className="text-green-500" />
                            <Text>
                                Connected as <strong>{user.login}</strong>
                            </Text>
                        </Flex>
                        {onChangeAccount && (
                            <Button variant="secondary" isQuiet onPress={onChangeAccount} UNSAFE_className="text-sm">
                                Change
                            </Button>
                        )}
                    </Flex>
                ) : error ? (
                    <Flex direction="column" gap="size-150" marginTop="size-200">
                        <Flex alignItems="center" gap="size-100">
                            <Alert size="S" UNSAFE_className="text-red-500" />
                            <Text UNSAFE_className="text-red-600">{error}</Text>
                        </Flex>
                        <Button variant="accent" onPress={onSignIn}>
                            Try Again
                        </Button>
                    </Flex>
                ) : (
                    <Button variant="accent" marginTop="size-200" onPress={onSignIn}>
                        Sign in with GitHub
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
                .text-sm { font-size: 0.875rem; }
                .text-gray-600 { color: var(--spectrum-global-color-gray-600); }
                .text-green-500 { color: var(--spectrum-semantic-positive-color-icon); }
                .text-red-500 { color: var(--spectrum-semantic-negative-color-icon); }
                .text-red-600 { color: var(--spectrum-semantic-negative-color-text-small); }
            `}</style>
        </Flex>
    );
}
