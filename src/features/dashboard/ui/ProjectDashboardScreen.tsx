import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    View,
    Flex,
    Heading,
    Text,
    ActionButton,
    Divider,
    ProgressCircle
} from '@adobe/react-spectrum';
import PlayCircle from '@spectrum-icons/workflow/PlayCircle';
import StopCircle from '@spectrum-icons/workflow/StopCircle';
import Settings from '@spectrum-icons/workflow/Settings';
import Refresh from '@spectrum-icons/workflow/Refresh';
import Globe from '@spectrum-icons/workflow/Globe';
import Delete from '@spectrum-icons/workflow/Delete';
import ViewList from '@spectrum-icons/workflow/ViewList';
import DataMapping from '@spectrum-icons/workflow/DataMapping';
import Data from '@spectrum-icons/workflow/Data';
import Login from '@spectrum-icons/workflow/Login';
import { vscode } from '@/core/ui/vscode-api';
import { useFocusTrap } from '@/webview-ui/shared/hooks';
import { StatusCard } from '@/webview-ui/shared/components/molecules';
import { GridLayout } from '@/webview-ui/shared/components/templates';

type MeshStatus = 'checking' | 'needs-auth' | 'authenticating' | 'not-deployed' | 'deploying' | 'deployed' | 'config-changed' | 'error';

interface ProjectStatus {
    name: string;
    path: string;
    status: 'created' | 'configuring' | 'ready' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
    port?: number;
    adobeOrg?: string;
    adobeProject?: string;
    frontendConfigChanged?: boolean;
    mesh?: {
        status: MeshStatus;
        endpoint?: string;
        message?: string;
    };
}

interface ProjectDashboardScreenProps {
    project?: {
        name: string;
        path: string;
    };
}

export function ProjectDashboardScreen({ project }: ProjectDashboardScreenProps) {
    const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    const containerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false
    });

    useEffect(() => {
        vscode.postMessage('requestStatus');

        const unsubscribeStatus = vscode.onMessage('statusUpdate', (data: ProjectStatus) => {
            setProjectStatus(data);
            setIsRunning(data.status === 'running');
        });

        const unsubscribeMesh = vscode.onMessage('meshStatusUpdate', (data: { status: MeshStatus; message?: string; endpoint?: string }) => {
            setProjectStatus(prev => prev ? {
                ...prev,
                mesh: {
                    status: data.status,
                    message: data.message,
                    endpoint: data.endpoint
                }
            } : prev);
        });

        return () => {
            unsubscribeStatus();
            unsubscribeMesh();
        };
    }, []);

    // Initial focus
    useEffect(() => {
        if (projectStatus) {
            const timer = setTimeout(() => {
                const firstButton = document.querySelector('.dashboard-action-button') as HTMLElement;
                if (firstButton) {
                    firstButton.focus();
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, []); // Only on mount

    // Action handlers with useCallback for performance
    const handleStartDemo = useCallback(() => vscode.postMessage('startDemo'), []);
    const handleStopDemo = useCallback(() => vscode.postMessage('stopDemo'), []);
    const handleReAuthenticate = useCallback(() => vscode.postMessage('re-authenticate'), []);

    const handleViewLogs = useCallback(() => {
        vscode.postMessage('viewLogs');
        setTimeout(() => {
            const logsButton = document.querySelector('[data-action="logs"]') as HTMLElement;
            if (logsButton) {
                logsButton.focus();
            }
        }, 50);
    }, []);

    const handleDeployMesh = useCallback(() => {
        vscode.postMessage('deployMesh');
        setTimeout(() => {
            const deployButton = document.querySelector('[data-action="deploy-mesh"]') as HTMLElement;
            if (deployButton) {
                deployButton.focus();
            }
        }, 50);
    }, []);

    const handleOpenBrowser = useCallback(() => vscode.postMessage('openBrowser'), []);
    const handleConfigure = useCallback(() => vscode.postMessage('configure'), []);
    const handleOpenDevConsole = useCallback(() => vscode.postMessage('openDevConsole'), []);
    const handleDeleteProject = useCallback(() => vscode.postMessage('deleteProject'), []);

    const displayName = projectStatus?.name || project?.name || 'Demo Project';
    const status = projectStatus?.status || 'ready';
    const port = projectStatus?.port || 3000;
    const frontendConfigChanged = projectStatus?.frontendConfigChanged || false;
    const meshStatus = projectStatus?.mesh?.status;
    const meshEndpoint = projectStatus?.mesh?.endpoint;
    const meshMessage = projectStatus?.mesh?.message;

    // Memoize status displays for performance
    const demoStatusDisplay = useMemo(() => {
        switch (status) {
            case 'starting':
                return { color: 'blue' as const, text: 'Starting...' };
            case 'running':
                if (frontendConfigChanged) {
                    return { color: 'yellow' as const, text: 'Restart Needed' };
                }
                return { color: 'green' as const, text: `Running on port ${port}` };
            case 'stopping':
                return { color: 'yellow' as const, text: 'Stopping...' };
            case 'stopped':
            case 'ready':
                return { color: 'gray' as const, text: 'Stopped' };
            case 'configuring':
                return { color: 'blue' as const, text: 'Configuring...' };
            case 'error':
                return { color: 'red' as const, text: 'Error' };
            default:
                return { color: 'gray' as const, text: 'Ready' };
        }
    }, [status, frontendConfigChanged, port]);

    const meshStatusDisplay = useMemo(() => {
        if (!meshStatus) return null;

        switch (meshStatus) {
            case 'checking':
                return { color: 'blue' as const, text: 'Checking...' };
            case 'needs-auth':
                return { color: 'yellow' as const, text: 'Session expired' };
            case 'authenticating':
                return { color: 'blue' as const, text: 'Authenticating...' };
            case 'deploying':
                return { color: 'blue' as const, text: meshMessage || 'Deploying...' };
            case 'deployed':
                return { color: 'green' as const, text: 'Deployed' };
            case 'config-changed':
                return { color: 'yellow' as const, text: 'Redeploy Needed' };
            case 'not-deployed':
                return { color: 'gray' as const, text: 'Not Deployed' };
            case 'error':
                return { color: 'red' as const, text: 'Deployment Error' };
            default:
                return { color: 'gray' as const, text: 'Unknown' };
        }
    }, [meshStatus, meshMessage]);

    return (
        <View
            ref={containerRef}
            padding="size-400"
            height="100vh"
            UNSAFE_style={{
                maxWidth: '500px',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <Flex direction="column" gap="size-200" UNSAFE_style={{ width: '100%' }}>
                {/* Project Header */}
                <View marginBottom="size-200">
                    <Heading level={1} marginBottom="size-50" UNSAFE_style={{ fontSize: '20px', fontWeight: 600 }}>
                        {displayName}
                    </Heading>

                    {/* Demo Status */}
                    <StatusCard
                        label="Demo"
                        status={demoStatusDisplay.text}
                        color={demoStatusDisplay.color}
                        size="S"
                    />

                    {/* Mesh Status */}
                    {meshStatusDisplay && (
                        <Flex direction="row" alignItems="center" gap="size-100" marginTop="size-50">
                            <StatusCard
                                label="API Mesh"
                                status={meshStatusDisplay.text}
                                color={meshStatusDisplay.color}
                                size="S"
                            />

                            {meshStatus === 'needs-auth' && (
                                <ActionButton
                                    isQuiet
                                    onPress={handleReAuthenticate}
                                    UNSAFE_style={{ marginLeft: '4px' }}
                                >
                                    <Login size="XS" />
                                    <Text>Sign in</Text>
                                </ActionButton>
                            )}

                            {meshStatus === 'authenticating' && (
                                <ProgressCircle size="S" isIndeterminate UNSAFE_style={{ width: '16px', height: '16px' }} />
                            )}
                        </Flex>
                    )}
                </View>

                <Divider size="S" marginBottom="size-100" />

                {/* Action Grid - 3 columns */}
                <GridLayout columns={3} gap="8px">
                    {/* Start/Stop */}
                    {!isRunning && (
                        <ActionButton
                            onPress={handleStartDemo}
                            isQuiet
                            UNSAFE_className="dashboard-action-button"
                        >
                            <PlayCircle size="L" />
                            <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Start</Text>
                        </ActionButton>
                    )}
                    {isRunning && (
                        <ActionButton
                            onPress={handleStopDemo}
                            isQuiet
                            UNSAFE_className="dashboard-action-button"
                        >
                            <StopCircle size="L" />
                            <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Stop</Text>
                        </ActionButton>
                    )}

                    {/* Open Browser */}
                    <ActionButton
                        onPress={handleOpenBrowser}
                        isQuiet
                        isDisabled={!isRunning}
                        UNSAFE_className="dashboard-action-button"
                    >
                        <Globe size="L" />
                        <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Open</Text>
                    </ActionButton>

                    {/* Logs */}
                    <ActionButton
                        onPress={handleViewLogs}
                        isQuiet
                        UNSAFE_className="dashboard-action-button"
                        data-action="logs"
                    >
                        <ViewList size="L" />
                        <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Logs</Text>
                    </ActionButton>

                    {/* Deploy Mesh */}
                    <ActionButton
                        onPress={handleDeployMesh}
                        isQuiet
                        UNSAFE_className="dashboard-action-button"
                        data-action="deploy-mesh"
                    >
                        <Refresh size="L" />
                        <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Deploy Mesh</Text>
                    </ActionButton>

                    {/* Configure */}
                    <ActionButton
                        onPress={handleConfigure}
                        isQuiet
                        UNSAFE_className="dashboard-action-button"
                    >
                        <Settings size="L" />
                        <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Configure</Text>
                    </ActionButton>

                    {/* Developer Console */}
                    <ActionButton
                        onPress={handleOpenDevConsole}
                        isQuiet
                        UNSAFE_className="dashboard-action-button"
                    >
                        <Globe size="L" />
                        <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Dev Console</Text>
                    </ActionButton>

                    {/* Mesh Designer (Coming Soon) */}
                    <ActionButton
                        isQuiet
                        isDisabled
                        UNSAFE_className="dashboard-action-button"
                    >
                        <DataMapping size="L" />
                        <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Mesh Designer</Text>
                    </ActionButton>

                    {/* Data Manager (Coming Soon) */}
                    <ActionButton
                        isQuiet
                        isDisabled
                        UNSAFE_className="dashboard-action-button"
                    >
                        <Data size="L" />
                        <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Data Manager</Text>
                    </ActionButton>

                    {/* Delete Project */}
                    <ActionButton
                        onPress={handleDeleteProject}
                        isQuiet
                        UNSAFE_className="dashboard-action-button"
                    >
                        <Delete size="L" />
                        <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Delete</Text>
                    </ActionButton>
                </GridLayout>
            </Flex>
        </View>
    );
}
