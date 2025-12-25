/**
 * GitHubServiceCard
 *
 * Presentational component for GitHub authentication in ConnectServicesStep.
 * Supports both card and checklist layout variants.
 *
 * @example
 * <GitHubServiceCard
 *   isChecking={false}
 *   isAuthenticating={false}
 *   isAuthenticated={true}
 *   user={{ login: 'octocat' }}
 *   onConnect={handleConnect}
 *   onChangeAccount={handleChange}
 *   variant="card"
 * />
 */

import React from 'react';
import { Flex, Text, ProgressCircle } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Alert from '@spectrum-icons/workflow/Alert';

/** GitHub user information */
export interface GitHubUser {
    login: string;
    avatarUrl?: string;
    email?: string;
}

/** Props for GitHubServiceCard component */
export interface GitHubServiceCardProps {
    /** Whether auth status is being checked */
    isChecking: boolean;
    /** Whether authentication is in progress */
    isAuthenticating: boolean;
    /** Whether user is authenticated */
    isAuthenticated: boolean;
    /** Authenticated user info */
    user?: GitHubUser;
    /** Error message to display */
    error?: string;
    /** Called when connect/try again button clicked */
    onConnect: () => void;
    /** Called when change account clicked */
    onChangeAccount?: () => void;
    /** Layout variant */
    variant: 'card' | 'checklist';
}

/** GitHub SVG icon */
const GitHubIcon = () => (
    <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
);

/**
 * GitHubServiceCard Component
 *
 * Displays GitHub authentication status with appropriate actions.
 * Pure presentational component - no business logic.
 */
export function GitHubServiceCard({
    isChecking,
    isAuthenticating,
    isAuthenticated,
    user,
    error,
    onConnect,
    onChangeAccount,
    variant,
}: GitHubServiceCardProps): React.ReactElement {
    const isLoading = isChecking || isAuthenticating;

    // Render card variant
    if (variant === 'card') {
        return (
            <div
                className="service-card"
                data-connected={isAuthenticated ? 'true' : 'false'}
            >
                <div className="service-card-header">
                    <div className="service-icon github-icon">
                        <GitHubIcon />
                    </div>
                    <div className="service-card-title">GitHub</div>
                </div>
                <div className="service-card-description">
                    Repository for your project code
                </div>
                <div className="service-card-status">
                    {isLoading ? (
                        <Flex alignItems="center" gap="size-100">
                            <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                            <Text UNSAFE_className="status-text">
                                {isAuthenticating ? 'Connecting...' : 'Checking...'}
                            </Text>
                        </Flex>
                    ) : isAuthenticated && user ? (
                        <Flex alignItems="center" justifyContent="space-between">
                            <Flex alignItems="center" gap="size-100">
                                <CheckmarkCircle size="S" UNSAFE_className="status-icon-success" />
                                <Text UNSAFE_className="status-text">
                                    {user.login}
                                </Text>
                            </Flex>
                            {onChangeAccount && (
                                <button className="service-action-link" onClick={onChangeAccount}>
                                    Change
                                </button>
                            )}
                        </Flex>
                    ) : error ? (
                        <Flex direction="column" gap="size-100">
                            <Flex alignItems="center" gap="size-100">
                                <Alert size="S" UNSAFE_className="status-icon-error" />
                                <Text UNSAFE_className="status-text-error">{error}</Text>
                            </Flex>
                            <button className="service-action-button" onClick={onConnect}>
                                Try Again
                            </button>
                        </Flex>
                    ) : (
                        <button className="service-action-button" onClick={onConnect}>
                            Connect GitHub
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
                        <div className="service-icon-small github-icon">
                            <GitHubIcon />
                        </div>
                        GitHub
                    </div>
                    <div className="checklist-action">
                        {isLoading ? (
                            <span className="status-text-muted">
                                {isAuthenticating ? 'Connecting...' : 'Checking...'}
                            </span>
                        ) : isAuthenticated ? (
                            onChangeAccount && (
                                <button className="service-action-link" onClick={onChangeAccount}>
                                    Change
                                </button>
                            )
                        ) : (
                            <button className="service-action-button-small" onClick={onConnect}>
                                Connect
                            </button>
                        )}
                    </div>
                </div>
                <div className="checklist-description">
                    {isAuthenticated && user ? (
                        <span>Connected as <strong>{user.login}</strong></span>
                    ) : error ? (
                        <span className="status-text-error">{error}</span>
                    ) : (
                        'Repository for your project code'
                    )}
                </div>
            </div>
        </div>
    );
}
