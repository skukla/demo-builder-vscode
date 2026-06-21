/**
 * Shared deployable state pieces (D2 Track B — Step 05)
 *
 * The 4-state presentational machine first written for {@link AppBuilderCard}
 * (not-deployed / deploying / deployed / error), extracted so BOTH the singular
 * App Builder card and the keyed {@link DeployableRow} render identical states
 * (Rule of Three: 2 concrete in-plan consumers → extract now). The pieces are
 * pure presentational: every action is an injected callback, so each consumer
 * supplies either id-less (card) or id-scoped (row) message dispatch.
 *
 * Follows the dashboard UI conventions (reference_dashboard_ui_conventions):
 * subtle Spectrum primitives, quiet Links, the shared StatusCard, no saturated
 * fills.
 *
 * @module features/dashboard/ui/components/deployableStates
 */

import { Flex, Button, Link, ProgressCircle, Text } from '@adobe/react-spectrum';
import React from 'react';
import { StatusCard } from '@/core/ui/components/feedback';
import type { StatusCardAction } from '@/core/ui/components/feedback/StatusCard';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/** Deployable status as surfaced to the dashboard. */
export type DeployableViewStatus = 'not-deployed' | 'deploying' | 'deployed' | 'error';

/** Deployed-state view inputs (URL set + label). */
export interface DeployedView {
    label: string;
    url?: string;
    deployedUrls?: Record<string, string>;
}

/** Resolve the URL set to render (deployedUrls, else a single primary url). */
function resolveUrls(view: DeployedView): Record<string, string> {
    if (view.deployedUrls && Object.keys(view.deployedUrls).length > 0) {
        return view.deployedUrls;
    }
    return view.url ? { app: view.url } : {};
}

/** "Deploying" state: spinner + the live status message. */
export function DeployingState({ message }: { message?: string }) {
    return (
        <Flex alignItems="center" gap="size-150">
            <ProgressCircle aria-label="Deploying" isIndeterminate size="S" />
            <Text>{message || 'Deploying…'}</Text>
        </Flex>
    );
}

/**
 * "Deployed" state: status badge (+ optional Verify action) + action URLs
 * (quiet Links) + Redeploy + Remove. Each button's handler is injected.
 */
export function DeployedState({
    view,
    onRedeploy,
    onRemove,
    verifyAction,
}: {
    view: DeployedView;
    onRedeploy: () => void;
    onRemove: () => void;
    verifyAction?: StatusCardAction;
}) {
    const urls = resolveUrls(view);

    return (
        <Flex direction="column" gap="size-150">
            <StatusCard label={view.label} status="Deployed" color="green" size="S" action={verifyAction} />
            <Flex direction="column" gap="size-50">
                {Object.entries(urls).map(([name, url]) => (
                    <Link
                        key={name}
                        isQuiet
                        href={url}
                        // Reuse the validated openLiveSite handler so the URL is
                        // sanitized + opened by the extension.
                        onPress={() => webviewClient.postMessage('openLiveSite', { url })}
                    >
                        {name}
                    </Link>
                ))}
            </Flex>
            <Flex gap="size-150">
                <Button variant="secondary" onPress={onRedeploy}>Redeploy</Button>
                <Button variant="secondary" onPress={onRemove}>Remove</Button>
            </Flex>
        </Flex>
    );
}

/** "Error" state: inline message + Retry. */
export function ErrorState({
    label,
    message,
    onRetry,
}: {
    label: string;
    message?: string;
    onRetry: () => void;
}) {
    return (
        <Flex direction="column" gap="size-150">
            <StatusCard label={label} status={message || 'Deployment failed'} color="red" size="S" />
            <Flex>
                <Button variant="primary" onPress={onRetry}>Retry</Button>
            </Flex>
        </Flex>
    );
}
