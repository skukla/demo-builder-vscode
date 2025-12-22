/**
 * ConnectServicesStep
 *
 * Combined authentication step for GitHub and DA.live.
 * Presents both services side-by-side, allowing users to connect in any order.
 * Continue is enabled when both services are connected.
 *
 * Supports two layout variants:
 * - "cards": Side-by-side service cards (matches selector pattern)
 * - "checklist": Vertical checklist with progress indicators
 */

import React, { useEffect, useState } from 'react';
import { Heading, Text, Flex, ActionButton, Tooltip, TooltipTrigger, ProgressCircle } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Alert from '@spectrum-icons/workflow/Alert';
import ViewGrid from '@spectrum-icons/workflow/ViewGrid';
import ViewList from '@spectrum-icons/workflow/ViewList';
import ViewColumn from '@spectrum-icons/workflow/ViewColumn';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { useGitHubAuth } from '../hooks/useGitHubAuth';
import { useDaLiveAuth } from '../hooks/useDaLiveAuth';
import type { BaseStepProps } from '@/types/wizard';

type LayoutVariant = 'cards' | 'vertical' | 'checklist';

/**
 * ConnectServicesStep Component
 *
 * Two layout options for connecting GitHub and DA.live services.
 */
export function ConnectServicesStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps): React.ReactElement {
    const [layout, setLayout] = useState<LayoutVariant>('cards');

    // GitHub auth state
    const gitHubAuth = useGitHubAuth({ state, updateState });

    // DA.live auth state
    const daLiveAuth = useDaLiveAuth({ state, updateState });

    // Local state for DA.live token input (checklist mode)
    const [showDaLiveInput, setShowDaLiveInput] = useState(false);
    const [tokenValue, setTokenValue] = useState('');
    const [orgValue, setOrgValue] = useState('');

    // Enable Continue when both services are connected
    useEffect(() => {
        const bothConnected = gitHubAuth.isAuthenticated && daLiveAuth.isAuthenticated;
        setCanProceed(bothConnected);
    }, [gitHubAuth.isAuthenticated, daLiveAuth.isAuthenticated, setCanProceed]);

    const handleDaLiveSetup = () => {
        daLiveAuth.openDaLive();
        setShowDaLiveInput(true);
    };

    const handleDaLiveSubmit = () => {
        if (tokenValue.trim() && orgValue.trim()) {
            daLiveAuth.storeTokenWithOrg(tokenValue.trim(), orgValue.trim());
            setTokenValue('');
            setOrgValue('');
            setShowDaLiveInput(false);
        }
    };

    const handleDaLiveReset = () => {
        daLiveAuth.resetAuth();
        setShowDaLiveInput(false);
        setTokenValue('');
        setOrgValue('');
    };

    return (
        <SingleColumnLayout maxWidth="900px">
            <Flex justifyContent="space-between" alignItems="center" marginBottom="size-100">
                <Heading level={2} margin={0}>
                    Connect Your Services
                </Heading>
                <Flex gap="size-50">
                    <TooltipTrigger>
                        <ActionButton
                            isQuiet
                            aria-label="Side-by-side cards"
                            onPress={() => setLayout('cards')}
                            UNSAFE_className={layout === 'cards' ? 'layout-toggle-active' : ''}
                        >
                            <ViewGrid />
                        </ActionButton>
                        <Tooltip>Side-by-side</Tooltip>
                    </TooltipTrigger>
                    <TooltipTrigger>
                        <ActionButton
                            isQuiet
                            aria-label="Vertical cards"
                            onPress={() => setLayout('vertical')}
                            UNSAFE_className={layout === 'vertical' ? 'layout-toggle-active' : ''}
                        >
                            <ViewColumn />
                        </ActionButton>
                        <Tooltip>Stacked Cards</Tooltip>
                    </TooltipTrigger>
                    <TooltipTrigger>
                        <ActionButton
                            isQuiet
                            aria-label="Checklist view"
                            onPress={() => setLayout('checklist')}
                            UNSAFE_className={layout === 'checklist' ? 'layout-toggle-active' : ''}
                        >
                            <ViewList />
                        </ActionButton>
                        <Tooltip>Checklist</Tooltip>
                    </TooltipTrigger>
                </Flex>
            </Flex>
            <Text marginBottom="size-300">
                Set up GitHub and DA.live to manage your Edge Delivery project.
            </Text>

            {(layout === 'cards' || layout === 'vertical') ? (
                /* ========== Service Cards (horizontal or vertical) ========== */
                <div className={layout === 'cards' ? 'services-cards-grid' : 'services-cards-vertical'}>
                    {/* GitHub Card */}
                    <div
                        className="service-card"
                        data-connected={gitHubAuth.isAuthenticated ? 'true' : 'false'}
                    >
                        <div className="service-card-header">
                            <div className="service-icon github-icon">
                                <svg viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                                </svg>
                            </div>
                            <div className="service-card-title">GitHub</div>
                        </div>
                        <div className="service-card-description">
                            Repository for your project code
                        </div>
                        <div className="service-card-status">
                            {gitHubAuth.isChecking || gitHubAuth.isAuthenticating ? (
                                <Flex alignItems="center" gap="size-100">
                                    <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                                    <Text UNSAFE_className="status-text">
                                        {gitHubAuth.isAuthenticating ? 'Connecting...' : 'Checking...'}
                                    </Text>
                                </Flex>
                            ) : gitHubAuth.isAuthenticated && gitHubAuth.user ? (
                                <Flex alignItems="center" justifyContent="space-between">
                                    <Flex alignItems="center" gap="size-100">
                                        <CheckmarkCircle size="S" UNSAFE_className="status-icon-success" />
                                        <Text UNSAFE_className="status-text">
                                            {gitHubAuth.user.login}
                                        </Text>
                                    </Flex>
                                    <button className="service-action-link" onClick={gitHubAuth.changeAccount}>
                                        Change
                                    </button>
                                </Flex>
                            ) : gitHubAuth.error ? (
                                <Flex direction="column" gap="size-100">
                                    <Flex alignItems="center" gap="size-100">
                                        <Alert size="S" UNSAFE_className="status-icon-error" />
                                        <Text UNSAFE_className="status-text-error">{gitHubAuth.error}</Text>
                                    </Flex>
                                    <button className="service-action-button" onClick={gitHubAuth.startOAuth}>
                                        Try Again
                                    </button>
                                </Flex>
                            ) : (
                                <button className="service-action-button" onClick={gitHubAuth.startOAuth}>
                                    Connect GitHub
                                </button>
                            )}
                        </div>
                    </div>

                    {/* DA.live Card */}
                    <div
                        className="service-card"
                        data-connected={daLiveAuth.isAuthenticated ? 'true' : 'false'}
                    >
                        <div className="service-card-header">
                            <div className="service-icon dalive-icon">DA</div>
                            <div className="service-card-title">DA.live</div>
                        </div>
                        <div className="service-card-description">
                            Content authoring and management
                        </div>
                        <div className="service-card-status">
                            {daLiveAuth.isChecking || (daLiveAuth.isAuthenticating && !showDaLiveInput) ? (
                                <Flex alignItems="center" gap="size-100">
                                    <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                                    <Text UNSAFE_className="status-text">
                                        {daLiveAuth.isAuthenticating ? 'Verifying...' : 'Checking...'}
                                    </Text>
                                </Flex>
                            ) : daLiveAuth.isAuthenticated ? (
                                <Flex alignItems="center" justifyContent="space-between">
                                    <Flex alignItems="center" gap="size-100">
                                        <CheckmarkCircle size="S" UNSAFE_className="status-icon-success" />
                                        <Text UNSAFE_className="status-text">
                                            {daLiveAuth.verifiedOrg || 'Connected'}
                                        </Text>
                                    </Flex>
                                    <button className="service-action-link" onClick={handleDaLiveReset}>
                                        Change
                                    </button>
                                </Flex>
                            ) : showDaLiveInput ? (
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
                                    {daLiveAuth.error && (
                                        <Text UNSAFE_className="status-text-error">{daLiveAuth.error}</Text>
                                    )}
                                    <Flex gap="size-100">
                                        <button
                                            className="service-action-button"
                                            onClick={handleDaLiveSubmit}
                                            disabled={!tokenValue.trim() || !orgValue.trim()}
                                        >
                                            Verify
                                        </button>
                                        <button
                                            className="service-action-link"
                                            onClick={() => setShowDaLiveInput(false)}
                                        >
                                            Cancel
                                        </button>
                                    </Flex>
                                </div>
                            ) : daLiveAuth.error ? (
                                <Flex direction="column" gap="size-100">
                                    <Flex alignItems="center" gap="size-100">
                                        <Alert size="S" UNSAFE_className="status-icon-error" />
                                        <Text UNSAFE_className="status-text-error">{daLiveAuth.error}</Text>
                                    </Flex>
                                    <button className="service-action-button" onClick={handleDaLiveSetup}>
                                        Try Again
                                    </button>
                                </Flex>
                            ) : (
                                <button className="service-action-button" onClick={handleDaLiveSetup}>
                                    {daLiveAuth.setupComplete ? 'Connect DA.live' : 'Set up DA.live'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* ========== OPTION B: Vertical Checklist ========== */
                <div className="services-checklist">
                    {/* GitHub Row */}
                    <div
                        className="checklist-item"
                        data-connected={gitHubAuth.isAuthenticated ? 'true' : 'false'}
                    >
                        <div className="checklist-indicator">
                            {gitHubAuth.isChecking || gitHubAuth.isAuthenticating ? (
                                <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                            ) : gitHubAuth.isAuthenticated ? (
                                <CheckmarkCircle size="S" UNSAFE_className="status-icon-success" />
                            ) : (
                                <div className="checklist-circle" />
                            )}
                        </div>
                        <div className="checklist-content">
                            <div className="checklist-header">
                                <div className="checklist-title">
                                    <div className="service-icon-small github-icon">
                                        <svg viewBox="0 0 16 16" fill="currentColor">
                                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                                        </svg>
                                    </div>
                                    GitHub
                                </div>
                                <div className="checklist-action">
                                    {gitHubAuth.isChecking || gitHubAuth.isAuthenticating ? (
                                        <span className="status-text-muted">
                                            {gitHubAuth.isAuthenticating ? 'Connecting...' : 'Checking...'}
                                        </span>
                                    ) : gitHubAuth.isAuthenticated ? (
                                        <button className="service-action-link" onClick={gitHubAuth.changeAccount}>
                                            Change
                                        </button>
                                    ) : (
                                        <button className="service-action-button-small" onClick={gitHubAuth.startOAuth}>
                                            Connect
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="checklist-description">
                                {gitHubAuth.isAuthenticated && gitHubAuth.user ? (
                                    <span>Connected as <strong>{gitHubAuth.user.login}</strong></span>
                                ) : gitHubAuth.error ? (
                                    <span className="status-text-error">{gitHubAuth.error}</span>
                                ) : (
                                    'Repository for your project code'
                                )}
                            </div>
                        </div>
                    </div>

                    {/* DA.live Row */}
                    <div
                        className="checklist-item"
                        data-connected={daLiveAuth.isAuthenticated ? 'true' : 'false'}
                    >
                        <div className="checklist-indicator">
                            {daLiveAuth.isChecking || (daLiveAuth.isAuthenticating && !showDaLiveInput) ? (
                                <ProgressCircle size="S" isIndeterminate aria-label="Checking" />
                            ) : daLiveAuth.isAuthenticated ? (
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
                                    {daLiveAuth.isChecking || (daLiveAuth.isAuthenticating && !showDaLiveInput) ? (
                                        <span className="status-text-muted">
                                            {daLiveAuth.isAuthenticating ? 'Verifying...' : 'Checking...'}
                                        </span>
                                    ) : daLiveAuth.isAuthenticated ? (
                                        <button className="service-action-link" onClick={handleDaLiveReset}>
                                            Change
                                        </button>
                                    ) : showDaLiveInput ? null : (
                                        <button className="service-action-button-small" onClick={handleDaLiveSetup}>
                                            {daLiveAuth.setupComplete ? 'Connect' : 'Set up'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="checklist-description">
                                {daLiveAuth.isAuthenticated ? (
                                    <span>Connected to <strong>{daLiveAuth.verifiedOrg || 'DA.live'}</strong></span>
                                ) : showDaLiveInput ? (
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
                                        {daLiveAuth.error && (
                                            <Text UNSAFE_className="status-text-error text-sm">{daLiveAuth.error}</Text>
                                        )}
                                        <Flex gap="size-100" marginTop="size-100">
                                            <button
                                                className="service-action-button-small"
                                                onClick={handleDaLiveSubmit}
                                                disabled={!tokenValue.trim() || !orgValue.trim()}
                                            >
                                                Verify
                                            </button>
                                            <button
                                                className="service-action-link"
                                                onClick={() => setShowDaLiveInput(false)}
                                            >
                                                Cancel
                                            </button>
                                        </Flex>
                                    </div>
                                ) : daLiveAuth.error ? (
                                    <span className="status-text-error">{daLiveAuth.error}</span>
                                ) : (
                                    'Content authoring and management'
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                /* Layout toggle */
                .layout-toggle-active {
                    background: var(--spectrum-global-color-gray-200) !important;
                }

                /* ========== Service Cards ========== */
                .services-cards-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-top: 8px;
                }

                .services-cards-vertical {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-top: 8px;
                    max-width: 500px;
                }

                .services-cards-vertical .service-card {
                    padding: 14px 16px;
                }

                .services-cards-vertical .service-card-description {
                    margin-bottom: 10px;
                }

                @media (max-width: 600px) {
                    .services-cards-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .service-card {
                    background: var(--spectrum-global-color-gray-50);
                    border: 1px solid var(--spectrum-global-color-gray-300);
                    border-radius: 12px;
                    padding: 20px;
                    transition: all 0.2s ease;
                }

                .service-card:hover {
                    background: var(--spectrum-global-color-gray-75);
                }

                .service-card-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 8px;
                }

                .service-icon {
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                }

                .service-icon-small {
                    width: 18px;
                    height: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    font-size: 9px;
                }

                .github-icon {
                    background: var(--spectrum-global-color-gray-800);
                    color: var(--spectrum-global-color-gray-50);
                }

                .github-icon svg {
                    width: 16px;
                    height: 16px;
                }

                .service-icon-small.github-icon svg {
                    width: 12px;
                    height: 12px;
                }

                .dalive-icon {
                    background: var(--spectrum-global-color-gray-700);
                    color: var(--spectrum-global-color-gray-50);
                    font-size: 10px;
                    font-weight: 700;
                }

                .service-card-title {
                    font-size: 15px;
                    font-weight: 600;
                    color: var(--spectrum-global-color-gray-900);
                }

                .service-card-description {
                    font-size: 13px;
                    color: var(--spectrum-global-color-gray-600);
                    margin-bottom: 16px;
                }

                .service-card-status {
                    min-height: 32px;
                }

                .status-text {
                    font-size: 13px;
                    color: var(--spectrum-global-color-gray-700);
                }

                .status-text-muted {
                    font-size: 12px;
                    color: var(--spectrum-global-color-gray-500);
                }

                .status-text-error {
                    font-size: 12px;
                    color: var(--spectrum-semantic-negative-color-text-small);
                }

                .status-icon-success {
                    color: var(--spectrum-semantic-positive-color-icon);
                }

                .status-icon-error {
                    color: var(--spectrum-semantic-negative-color-icon);
                }

                .service-action-button {
                    background: var(--spectrum-global-color-blue-400);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    padding: 8px 16px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.15s ease;
                }

                .service-action-button:hover {
                    background: var(--spectrum-global-color-blue-500);
                }

                .service-action-button:disabled {
                    background: var(--spectrum-global-color-gray-400);
                    cursor: not-allowed;
                }

                .service-action-button-small {
                    background: var(--spectrum-global-color-blue-400);
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 4px 12px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.15s ease;
                }

                .service-action-button-small:hover {
                    background: var(--spectrum-global-color-blue-500);
                }

                .service-action-button-small:disabled {
                    background: var(--spectrum-global-color-gray-400);
                    cursor: not-allowed;
                }

                .service-action-link {
                    background: none;
                    border: none;
                    color: var(--spectrum-global-color-blue-500);
                    font-size: 12px;
                    cursor: pointer;
                    padding: 4px 8px;
                }

                .service-action-link:hover {
                    text-decoration: underline;
                }

                .service-input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid var(--spectrum-global-color-gray-300);
                    border-radius: 6px;
                    font-size: 13px;
                    background: var(--spectrum-global-color-gray-50);
                    color: var(--spectrum-global-color-gray-900);
                    margin-bottom: 8px;
                }

                .service-input:focus {
                    outline: none;
                    border-color: var(--spectrum-global-color-blue-400);
                    box-shadow: 0 0 0 1px var(--spectrum-global-color-blue-400);
                }

                .service-input-small {
                    width: 100%;
                    padding: 6px 10px;
                    border: 1px solid var(--spectrum-global-color-gray-300);
                    border-radius: 4px;
                    font-size: 12px;
                    background: var(--spectrum-global-color-gray-50);
                    color: var(--spectrum-global-color-gray-900);
                    margin-bottom: 6px;
                }

                .service-input-small:focus {
                    outline: none;
                    border-color: var(--spectrum-global-color-blue-400);
                    box-shadow: 0 0 0 1px var(--spectrum-global-color-blue-400);
                }

                .dalive-input-form {
                    display: flex;
                    flex-direction: column;
                }

                /* ========== OPTION B: Vertical Checklist ========== */
                .services-checklist {
                    display: flex;
                    flex-direction: column;
                    gap: 0;
                    margin-top: 8px;
                    border: 1px solid var(--spectrum-global-color-gray-200);
                    border-radius: 8px;
                    overflow: hidden;
                }

                .checklist-item {
                    display: flex;
                    gap: 16px;
                    padding: 16px 20px;
                    background: var(--spectrum-global-color-gray-50);
                    border-bottom: 1px solid var(--spectrum-global-color-gray-200);
                    transition: background 0.15s ease;
                }

                .checklist-item:last-child {
                    border-bottom: none;
                }

                .checklist-item:hover {
                    background: var(--spectrum-global-color-gray-75);
                }

                .checklist-item[data-connected="true"] {
                    background: var(--spectrum-global-color-gray-50);
                }

                .checklist-indicator {
                    flex-shrink: 0;
                    width: 24px;
                    display: flex;
                    align-items: flex-start;
                    padding-top: 2px;
                }

                .checklist-circle {
                    width: 18px;
                    height: 18px;
                    border: 2px solid var(--spectrum-global-color-gray-400);
                    border-radius: 50%;
                }

                .checklist-content {
                    flex: 1;
                    min-width: 0;
                }

                .checklist-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 4px;
                }

                .checklist-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--spectrum-global-color-gray-900);
                }

                .checklist-action {
                    flex-shrink: 0;
                }

                .checklist-description {
                    font-size: 13px;
                    color: var(--spectrum-global-color-gray-600);
                    line-height: 1.4;
                }

                .checklist-description strong {
                    color: var(--spectrum-global-color-gray-800);
                }

                .checklist-input-form {
                    margin-top: 8px;
                }

                .text-sm {
                    font-size: 12px !important;
                }
            `}</style>
        </SingleColumnLayout>
    );
}
