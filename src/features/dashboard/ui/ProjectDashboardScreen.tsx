import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View,
    Flex,
    Text,
    Button,
    ActionButton,
    ProgressCircle
} from '@adobe/react-spectrum';
import PlayCircle from '@spectrum-icons/workflow/PlayCircle';
import StopCircle from '@spectrum-icons/workflow/StopCircle';
import Settings from '@spectrum-icons/workflow/Settings';
import Refresh from '@spectrum-icons/workflow/Refresh';
import Globe from '@spectrum-icons/workflow/Globe';
import Delete from '@spectrum-icons/workflow/Delete';
import ViewList from '@spectrum-icons/workflow/ViewList';
import FolderOpen from '@spectrum-icons/workflow/FolderOpen';
import Data from '@spectrum-icons/workflow/Data';
import Login from '@spectrum-icons/workflow/Login';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { useFocusTrap } from '@/core/ui/hooks';
import { StatusCard } from '@/core/ui/components/feedback';
import { GridLayout, PageLayout, PageHeader } from '@/core/ui/components/layout';
import { isStartActionDisabled } from './dashboardPredicates';

type MeshStatus = 'checking' | 'needs-auth' | 'authenticating' | 'not-deployed' | 'deploying' | 'deployed' | 'config-changed' | 'update-declined' | 'error';

/** Mesh statuses that indicate a user-initiated operation is in progress (preserve during updates) */
const isMeshDeploying = (status: MeshStatus | undefined): boolean =>
    status === 'deploying' || status === 'authenticating';

/** Mesh statuses that indicate any operation is in progress (disable UI actions) */
const isMeshBusy = (status: MeshStatus | undefined): boolean =>
    status === 'deploying' || status === 'checking' || status === 'authenticating';

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
    hasMesh?: boolean;
}

export function ProjectDashboardScreen({ project, hasMesh }: ProjectDashboardScreenProps) {
    const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false); // Local state for immediate button disable
    // Temporarily suppress hover after click to prevent stuck state during layout shift
    const [isLogsHoverSuppressed, setIsLogsHoverSuppressed] = useState(false);
    // Track whether status was requested (prevent StrictMode double-request)
    const statusRequestedRef = useRef(false);

    const containerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false,
        containFocus: true,  // Prevent focus escape (WCAG 2.1 AA)
    });

    useEffect(() => {
        // Guard against StrictMode double-request (only send message once)
        if (!statusRequestedRef.current) {
            statusRequestedRef.current = true;
            webviewClient.postMessage('requestStatus');
        }

        const unsubscribeStatus = webviewClient.onMessage('statusUpdate', (data: unknown) => {
            const projectData = data as ProjectStatus;
            // Merge status update, preserving mesh status only during active deployment
            // This prevents update checks from resetting mesh button state mid-deployment
            // but allows async 'checking' status to resolve to final state
            setProjectStatus(prev => ({
                ...projectData,
                mesh: isMeshDeploying(prev?.mesh?.status) ? prev?.mesh : projectData.mesh
            }));
            setIsRunning(projectData.status === 'running');
            // Clear transitioning state when we receive a definitive status
            if (projectData.status === 'running' || projectData.status === 'ready' || projectData.status === 'stopped') {
                setIsTransitioning(false);
            }
        });

        const unsubscribeMesh = webviewClient.onMessage('meshStatusUpdate', (data: unknown) => {
            const meshData = data as { status: MeshStatus; message?: string; endpoint?: string };
            setProjectStatus(prev => prev ? {
                ...prev,
                mesh: {
                    status: meshData.status,
                    message: meshData.message,
                    endpoint: meshData.endpoint
                }
            } : prev);
            // Clear transitioning state when mesh operation completes
            if (!isMeshBusy(meshData.status)) {
                setIsTransitioning(false);
            }
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
        return undefined;
    }, []); // Only on mount

    // Action handlers with useCallback for performance
    const handleStartDemo = useCallback(() => {
        setIsTransitioning(true);
        webviewClient.postMessage('startDemo');
    }, []);
    const handleStopDemo = useCallback(() => {
        setIsTransitioning(true);
        webviewClient.postMessage('stopDemo');
    }, []);
    const handleReAuthenticate = useCallback(() => webviewClient.postMessage('re-authenticate'), []);

    const handleViewLogs = useCallback(() => {
        // Suppress hover styles during layout shift
        setIsLogsHoverSuppressed(true);
        (document.activeElement as HTMLElement)?.blur();
        webviewClient.postMessage('viewLogs');
        // Re-enable hover after layout stabilizes
        setTimeout(() => setIsLogsHoverSuppressed(false), 500);
    }, []);

    const handleDeployMesh = useCallback(() => {
        setIsTransitioning(true);
        webviewClient.postMessage('deployMesh');
    }, []);

    const handleOpenBrowser = useCallback(() => webviewClient.postMessage('openBrowser'), []);
    const handleConfigure = useCallback(() => webviewClient.postMessage('configure'), []);
    const handleOpenDevConsole = useCallback(() => webviewClient.postMessage('openDevConsole'), []);
    const handleDeleteProject = useCallback(() => webviewClient.postMessage('deleteProject'), []);
    const handleNavigateBack = useCallback(() => webviewClient.postMessage('navigateBack'), []);
    const handleViewComponents = useCallback(() => webviewClient.postMessage('viewComponents'), []);

    const displayName = projectStatus?.name || project?.name || 'Demo Project';
    const status = projectStatus?.status || 'ready';
    const port = projectStatus?.port || 3000;
    const frontendConfigChanged = projectStatus?.frontendConfigChanged || false;
    const meshStatus = projectStatus?.mesh?.status;
    const meshEndpoint = projectStatus?.mesh?.endpoint;
    const meshMessage = projectStatus?.mesh?.message;

    // Button disabled states
    const isStartDisabled = isStartActionDisabled(isTransitioning, meshStatus, status);
    const isStopDisabled = isTransitioning || status === 'stopping';
    const isMeshActionDisabled = isTransitioning || isMeshBusy(meshStatus);

    // Memoize status displays for performance
    const demoStatusDisplay = useMemo(() => {
        switch (status) {
            case 'starting':
                return { color: 'blue' as const, text: 'Starting...' };
            case 'running':
                if (frontendConfigChanged) {
                    return { color: 'yellow' as const, text: 'Restart needed' };
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
        // If no mesh status yet, show checking state until we have definitive info
        if (!meshStatus) {
            // If we know hasMesh, use it
            if (hasMesh) return { color: 'blue' as const, text: 'Checking status...' };
            // If projectStatus hasn't loaded yet, show checking (avoids flash)
            if (!projectStatus) return { color: 'blue' as const, text: 'Checking status...' };
            // projectStatus loaded and no mesh - hide the section
            return null;
        }

        switch (meshStatus) {
            case 'checking':
                return { color: 'blue' as const, text: 'Checking status...' };
            case 'needs-auth':
                return { color: 'yellow' as const, text: 'Session expired' };
            case 'authenticating':
                return { color: 'blue' as const, text: 'Authenticating...' };
            case 'deploying':
                return { color: 'blue' as const, text: meshMessage || 'Deploying...' };
            case 'deployed':
                return { color: 'green' as const, text: 'Deployed' };
            case 'config-changed':
                return { color: 'yellow' as const, text: 'Redeploy needed' };
            case 'update-declined':
                return { color: 'orange' as const, text: 'Needs deployment' };
            case 'not-deployed':
                return { color: 'gray' as const, text: 'Not deployed' };
            case 'error':
                return { color: 'red' as const, text: 'Deployment error' };
            default:
                return { color: 'gray' as const, text: 'Unknown' };
        }
    }, [meshStatus, meshMessage, hasMesh, projectStatus]);

    return (
        <div ref={containerRef}>
            <PageLayout
                header={
                    <PageHeader
                        title={displayName}
                        constrainWidth
                    />
                }
                backgroundColor="var(--spectrum-global-color-gray-50)"
            >
                {/* Status Header - matches Projects List header design */}
                <div className="dashboard-status-header">
                    <div className="max-w-800 mx-auto px-4 pt-6 pb-4">
                        <Flex alignItems="center" gap="size-300">
                            {/* Status indicators */}
                            <View flex>
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
                                                UNSAFE_style={{ minHeight: 'auto', height: 'auto', padding: '2px 6px' }}
                                            >
                                                <Login size="XS" />
                                                <Text>Sign in</Text>
                                            </ActionButton>
                                        )}

                                        {meshStatus === 'authenticating' && (
                                            <ProgressCircle size="S" isIndeterminate UNSAFE_className="w-4 h-4" />
                                        )}
                                    </Flex>
                                )}
                            </View>
                            {/* All Projects button */}
                            <Button variant="secondary" onPress={handleNavigateBack}>
                                All Projects
                            </Button>
                        </Flex>
                    </div>
                </div>

                <div className="w-full max-w-800 mx-auto px-4 pb-4">

                    {/* Center the grid of fixed-width buttons */}
                    <div className="dashboard-grid-container">
                    <GridLayout columns={3} gap="size-300" className="dashboard-grid">
                        {/* Start/Stop */}
                        {!isRunning && (
                            <ActionButton
                                onPress={handleStartDemo}
                                isQuiet
                                isDisabled={isStartDisabled}
                                UNSAFE_className="dashboard-action-button"
                            >
                                <PlayCircle size="L" />
                                <Text UNSAFE_className="icon-label">Start</Text>
                            </ActionButton>
                        )}
                        {isRunning && (
                            <ActionButton
                                onPress={handleStopDemo}
                                isQuiet
                                isDisabled={isStopDisabled}
                                UNSAFE_className="dashboard-action-button"
                            >
                                <StopCircle size="L" />
                                <Text UNSAFE_className="icon-label">Stop</Text>
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
                            <Text UNSAFE_className="icon-label">Open</Text>
                        </ActionButton>

                        {/* Logs */}
                        <ActionButton
                            onPress={handleViewLogs}
                            isQuiet
                            UNSAFE_className={`dashboard-action-button ${isLogsHoverSuppressed ? 'hover-suppressed' : ''}`}
                        >
                            <ViewList size="L" />
                            <Text UNSAFE_className="icon-label">Logs</Text>
                        </ActionButton>

                        {/* Deploy Mesh */}
                        <ActionButton
                            onPress={handleDeployMesh}
                            isQuiet
                            isDisabled={isMeshActionDisabled}
                            UNSAFE_className="dashboard-action-button"
                            data-action="deploy-mesh"
                        >
                            <Refresh size="L" />
                            <Text UNSAFE_className="icon-label">Deploy Mesh</Text>
                        </ActionButton>

                        {/* Configure */}
                        <ActionButton
                            onPress={handleConfigure}
                            isQuiet
                            isDisabled={isMeshActionDisabled}
                            UNSAFE_className="dashboard-action-button"
                        >
                            <Settings size="L" />
                            <Text UNSAFE_className="icon-label">Configure</Text>
                        </ActionButton>

                        {/* Developer Console */}
                        <ActionButton
                            onPress={handleOpenDevConsole}
                            isQuiet
                            UNSAFE_className="dashboard-action-button"
                        >
                            <Globe size="L" />
                            <Text UNSAFE_className="icon-label">Dev Console</Text>
                        </ActionButton>

                        {/* View Components */}
                        <ActionButton
                            onPress={handleViewComponents}
                            isQuiet
                            UNSAFE_className="dashboard-action-button"
                        >
                            <FolderOpen size="L" />
                            <Text UNSAFE_className="icon-label">Components</Text>
                        </ActionButton>

                        {/* Data Manager (Coming Soon) */}
                        <ActionButton
                            isQuiet
                            isDisabled
                            UNSAFE_className="dashboard-action-button"
                        >
                            <Data size="L" />
                            <Text UNSAFE_className="icon-label">Data Manager</Text>
                        </ActionButton>

                        {/* Delete Project */}
                        <ActionButton
                            onPress={handleDeleteProject}
                            isQuiet
                            UNSAFE_className="dashboard-action-button"
                        >
                            <Delete size="L" />
                            <Text UNSAFE_className="icon-label">Delete</Text>
                        </ActionButton>
                    </GridLayout>
                    </div>
                </div>
            </PageLayout>
        </div>
    );
}
