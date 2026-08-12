/**
 * Data Installer screen.
 *
 * A composition of the shared vocabulary, not a new one. Per `reuse-first` and the
 * job→component table in `core/ui/components/CLAUDE.md`:
 *
 *   - page shell            → `PageLayout` + `PageHeader`
 *   - full-block waiting    → `LoadingDisplay`
 *   - error / signed-out    → `StatusDisplay` with `actions[]` (signed-out is a
 *                             user-initiated sign-in, never a Retry)
 *   - transport             → `useVSCodeRequest`
 *
 * Nothing new is declared here. This slice is the connectivity surface: it proves
 * the panel → handshake → handler → guard → client → service seam end to end before
 * the catalog UI is layered on. The catalog grid, detail drawer, installed list and
 * activity log replace the body in the next slice.
 *
 * @module features/data-installer/ui/DataInstallerScreen
 */

import { Flex, Text } from '@adobe/react-spectrum';
import React, { useEffect } from 'react';
import type { ServiceHealth } from '../types';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';
import { PageLayout } from '@/core/ui/components/layout/PageLayout';
import { useVSCodeRequest } from '@/core/ui/hooks/useVSCodeRequest';
import { ErrorCode } from '@/types/errorCodes';

/** Init payload, owned by `ShowDataInstallerCommand.getInitialData()`. */
export interface DataInstallerScreenProps {
    theme?: 'dark' | 'light';
    projectName?: string;
}

/** A failure carrying the code the guard set, so the right affordance is offered. */
interface CodedError extends Error {
    code?: string;
}

export function DataInstallerScreen(_props: DataInstallerScreenProps): React.JSX.Element {
    const { execute, loading, error, data } = useVSCodeRequest<ServiceHealth>(
        'check-datapack-service',
    );

    useEffect(() => {
        void execute();
    }, [execute]);

    return (
        <PageLayout
            header={
                <PageHeader
                    title="Data Installer"
                    subtitle="Browse and install Adobe Commerce sample-data datapacks"
                />
            }
        >
            {renderBody({ loading, error, data, onRetry: () => void execute() })}
        </PageLayout>
    );
}

/** Pick the one state to show. Extracted so the component stays a shell. */
function renderBody(args: {
    loading: boolean;
    error: Error | null;
    data: ServiceHealth | null;
    onRetry: () => void;
}): React.JSX.Element {
    const { loading, error, data, onRetry } = args;

    if (loading) {
        return <LoadingDisplay size="L" message="Checking the Data Installer service..." />;
    }

    if (error) {
        return renderFailure(error as CodedError, onRetry);
    }

    if (data && !data.reachable) {
        return (
            <StatusDisplay
                variant="error"
                title="The Data Installer service did not respond"
                message="The service may be down, or the configured API URL may point somewhere else."
                actions={[{ label: 'Try Again', onPress: onRetry, variant: 'primary' }]}
            />
        );
    }

    return (
        <Flex direction="column" gap="size-100">
            <Text>Connected to the Data Installer service.</Text>
            {data?.message ? <Text>{data.message}</Text> : null}
        </Flex>
    );
}

/**
 * Render a failure with the affordance that can actually fix it.
 *
 * A signed-out user cannot be helped by Retry, so `AUTH_REQUIRED` gets a sign-in
 * action instead — the house treatment (`AdobeAuthStep` is the reference).
 */
function renderFailure(error: CodedError, onRetry: () => void): React.JSX.Element {
    if (error.code === ErrorCode.AUTH_REQUIRED) {
        return (
            <StatusDisplay
                variant="info"
                title="Adobe sign-in required"
                message="Sign in with Adobe to browse datapacks."
                actions={[
                    {
                        label: 'Sign In with Adobe',
                        onPress: onRetry,
                        variant: 'primary',
                    },
                ]}
            />
        );
    }

    if (error.code === ErrorCode.INVALID_OPERATION) {
        return (
            <StatusDisplay
                variant="warning"
                title="The Data Installer is not configured"
                message={error.message}
                details={[
                    'Set demoBuilder.dataInstaller.apiBaseUrl, and make sure demoBuilder.dataInstaller.enabled is on.',
                ]}
            />
        );
    }

    return (
        <StatusDisplay
            variant="error"
            title="Could not reach the Data Installer"
            message={error.message}
            actions={[{ label: 'Try Again', onPress: onRetry, variant: 'primary' }]}
        />
    );
}
