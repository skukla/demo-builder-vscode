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

import { View, Flex, Button, TextField, Text } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { DeployingState, DeployedState, ErrorState } from './appBuilderComponentStates';
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

/**
 * App Builder card. Switches on the app status; defaults to the "No app" state
 * when no app prop is provided. Deploying/Deployed/Error reuse the shared
 * appBuilderComponent state pieces (id-less message dispatch for the singular app).
 */
export function AppBuilderCard({ app }: AppBuilderCardProps) {
    const status = app?.status ?? 'not-deployed';

    return (
        <View>
            {status === 'deploying' && <DeployingState message={app?.message} />}
            {status === 'deployed' && app && (
                <DeployedState
                    view={{ label: 'App Builder', url: app.url, deployedUrls: app.deployedUrls }}
                    onRedeploy={() => webviewClient.postMessage('redeployApp')}
                    onRemove={() => webviewClient.postMessage('removeApp')}
                />
            )}
            {status === 'error' && (
                <ErrorState
                    label="App Builder"
                    message={app?.message}
                    onRetry={() => webviewClient.postMessage('deployApp')}
                />
            )}
            {status === 'not-deployed' && <NoAppState />}
        </View>
    );
}
