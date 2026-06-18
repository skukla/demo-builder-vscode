/**
 * AppBuilderCard Component
 *
 * Dashboard card for the project's (singular) App Builder app — sibling of the
 * mesh status card. Renders one of four states from the `app` prop and posts
 * add/deploy/redeploy/remove messages via the dashboard message client.
 *
 * Follows the dashboard UI conventions (reference_dashboard_ui_conventions):
 * subtle Spectrum primitives, quiet Links, the shared StatusCard, no saturated
 * fills. Deploy progress arrives via the dashboard status channel (the parent
 * maps `appStatusUpdate` into the `app` prop), so this card is presentational +
 * intent-dispatching only.
 *
 * @module features/dashboard/ui/components/AppBuilderCard
 */

import { View, Flex, Button, TextField, Link, ProgressCircle, Text } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { StatusCard } from '@/core/ui/components/feedback';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/** App deployment status as surfaced to the dashboard card. */
export type AppCardStatus = 'not-deployed' | 'deploying' | 'deployed' | 'error';

/** App state the card renders from (derived from project.appState / status channel). */
export interface AppCardState {
    status: AppCardStatus;
    /** Primary deployed app URL. */
    url?: string;
    /** Per-action/runtime URLs (Deployed state lists these as quiet Links). */
    deployedUrls?: Record<string, string>;
    /** Live deploy progress (Deploying) or failure detail (Error). */
    message?: string;
}

export interface AppBuilderCardProps {
    app?: AppCardState;
}

/** "No app" state: prompt + public-git URL input + gated Add button. */
function NoAppState() {
    const [gitUrl, setGitUrl] = useState('');
    const trimmed = gitUrl.trim();

    return (
        <Flex direction="column" gap="size-150">
            <Text>Add an App Builder app from a public GitHub repository.</Text>
            <TextField
                label="App Builder app URL"
                placeholder="https://github.com/owner/repo"
                value={gitUrl}
                onChange={setGitUrl}
                width="100%"
            />
            <Flex>
                <Button
                    variant="primary"
                    isDisabled={!trimmed}
                    onPress={() => webviewClient.postMessage('addApp', { gitUrl: trimmed })}
                >
                    Add
                </Button>
            </Flex>
        </Flex>
    );
}

/** "Deploying" state: spinner + the live status message. */
function DeployingState({ message }: { message?: string }) {
    return (
        <Flex alignItems="center" gap="size-150">
            <ProgressCircle aria-label="Deploying App Builder app" isIndeterminate size="S" />
            <Text>{message || 'Deploying…'}</Text>
        </Flex>
    );
}

/** "Deployed" state: status badge + action URLs (quiet Links) + Redeploy + Remove. */
function DeployedState({ app }: { app: AppCardState }) {
    const urls = app.deployedUrls && Object.keys(app.deployedUrls).length > 0
        ? app.deployedUrls
        : (app.url ? { app: app.url } : {});

    return (
        <Flex direction="column" gap="size-150">
            <StatusCard label="App Builder" status="Deployed" color="green" size="S" />
            <Flex direction="column" gap="size-50">
                {Object.entries(urls).map(([name, url]) => (
                    <Link
                        key={name}
                        isQuiet
                        href={url}
                        // Reuse the validated openLiveSite handler so the URL is
                        // sanitized + opened by the extension (Spectrum onPress
                        // intercepts the click; href is kept for accessibility).
                        onPress={() => webviewClient.postMessage('openLiveSite', { url })}
                    >
                        {name}
                    </Link>
                ))}
            </Flex>
            <Flex gap="size-150">
                <Button variant="secondary" onPress={() => webviewClient.postMessage('redeployApp')}>
                    Redeploy
                </Button>
                <Button variant="secondary" onPress={() => webviewClient.postMessage('removeApp')}>
                    Remove
                </Button>
            </Flex>
        </Flex>
    );
}

/** "Error" state: inline message + Retry. */
function ErrorState({ message }: { message?: string }) {
    return (
        <Flex direction="column" gap="size-150">
            <StatusCard label="App Builder" status={message || 'Deployment failed'} color="red" size="S" />
            <Flex>
                <Button variant="primary" onPress={() => webviewClient.postMessage('deployApp')}>
                    Retry
                </Button>
            </Flex>
        </Flex>
    );
}

/**
 * App Builder card. Switches on the app status; defaults to the "No app" state
 * when no app prop is provided.
 */
export function AppBuilderCard({ app }: AppBuilderCardProps) {
    const status = app?.status ?? 'not-deployed';

    return (
        <View>
            {status === 'deploying' && <DeployingState message={app?.message} />}
            {status === 'deployed' && app && <DeployedState app={app} />}
            {status === 'error' && <ErrorState message={app?.message} />}
            {status === 'not-deployed' && <NoAppState />}
        </View>
    );
}
