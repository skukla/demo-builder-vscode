/**
 * The service-card shell — one home for the frame and state machine that
 * {@link GitHubServiceCard} and {@link DaLiveServiceCard} each carried as a
 * private copy (EDS-7; found by the 2026-08-25 codebase sweep, extracted by
 * the 2026-08-27 dedup sweep — the moment the files were open anyway).
 *
 * The shared states, in the order both cards check them:
 *   loading → [custom state] → connected → error → action button
 *
 * `customState` is DA.live's token-input form slot: it renders INSTEAD of the
 * connected/error/button states when provided, exactly where DA.live's
 * `showInput` branch sat. GitHub passes none.
 *
 * Everything that differed between the copies is a prop: the connected label
 * (`user.login` vs `verifiedOrg`), the Change callback (optional on GitHub),
 * the action label ("Connect GitHub" vs "Set up DA.live"/"Connect DA.live"),
 * and the loading label ("Connecting..." vs "Verifying...").
 *
 * Local to the eds feature on purpose: two consumers in one feature is not
 * the 2+-features bar `core/ui` promotion asks for.
 *
 * @module features/eds/ui/components/ServiceCardShell
 */

import { Flex, Text } from '@adobe/react-spectrum';
import Alert from '@spectrum-icons/workflow/Alert';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import { Spinner } from '@/core/ui/components/ui/Spinner';

import { cn } from '@/core/ui/utils/classNames';
/** Props for the card frame. */
export interface ServiceCardShellProps {
    /** Icon content for the `service-icon` well. */
    icon: React.ReactNode;
    /** Extra class on the icon well (e.g. 'github-icon', 'dalive-icon'). */
    iconClassName: string;
    title: string;
    description: string;
    /** Drives the `data-connected` styling attribute. */
    isConnected: boolean;
    /** The status slot — normally a {@link ServiceCardStatus}. */
    children: React.ReactNode;
}

/** The card frame: header (icon + title), description, status slot. */
export function ServiceCardShell({
    icon,
    iconClassName,
    title,
    description,
    isConnected,
    children,
}: ServiceCardShellProps): React.ReactElement {
    return (
        <div className="service-card" data-connected={isConnected ? 'true' : 'false'}>
            <div className="service-card-header">
                <div className={cn('service-icon', iconClassName)}>{icon}</div>
                <div className="service-card-title">{title}</div>
            </div>
            <div className="service-card-description">{description}</div>
            <div className="service-card-status">{children}</div>
        </div>
    );
}

/** Props for the shared status state machine. */
export interface ServiceCardStatusProps {
    isLoading: boolean;
    /** Shown beside the spinner while loading. */
    loadingLabel: string;
    /** When provided, renders instead of the connected/error/button states. */
    customState?: React.ReactNode;
    isConnected: boolean;
    /** Compact connected view drops the detail line to a "Connected" pill. */
    compact: boolean;
    /** The connected detail line (account login / verified org). */
    connectedLabel: string;
    /** Renders the "Change" link when provided. */
    onChange?: () => void;
    error?: string;
    /** The error state's retry and the idle state's action. */
    onAction: () => void;
    actionLabel: string;
}

/** The four shared states, checked in the order both cards always used. */
export function ServiceCardStatus({
    isLoading,
    loadingLabel,
    customState,
    isConnected,
    compact,
    connectedLabel,
    onChange,
    error,
    onAction,
    actionLabel,
}: ServiceCardStatusProps): React.ReactElement {
    if (isLoading) {
        return (
            <Flex alignItems="center" gap="size-100">
                <Spinner size="S" aria-label="Checking" />
                <Text UNSAFE_className="status-text">{loadingLabel}</Text>
            </Flex>
        );
    }
    if (customState) {
        return <>{customState}</>;
    }
    if (isConnected) {
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
                    <Text UNSAFE_className="status-text">{connectedLabel}</Text>
                </Flex>
                {onChange && (
                    <button className="service-action-link" onClick={onChange}>
                        Change
                    </button>
                )}
            </Flex>
        );
    }
    if (error) {
        return (
            <Flex direction="column" gap="size-100">
                <Flex alignItems="center" gap="size-100">
                    <Alert size="S" UNSAFE_className="status-icon-error" />
                    <Text UNSAFE_className="status-text-error">{error}</Text>
                </Flex>
                <button className="service-action-button" onClick={onAction}>
                    Try Again
                </button>
            </Flex>
        );
    }
    return (
        <button className="service-action-button" onClick={onAction}>
            {actionLabel}
        </button>
    );
}
