import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Flex,
    Heading,
    Text,
    ActionButton,
    Divider,
    ActionGroup,
    Item,
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
import { vscode } from '../app/vscodeApi';

interface ProjectStatus {
    name: string;
    path: string;
    status: 'created' | 'configuring' | 'ready' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
    port?: number;
    adobeOrg?: string;
    adobeProject?: string;
    frontendConfigChanged?: boolean; // True if frontend .env changed since demo started
    mesh?: {
        status: 'checking' | 'needs-auth' | 'authenticating' | 'not-deployed' | 'deploying' | 'deployed' | 'config-changed' | 'error';
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

    useEffect(() => {
        // Request project status updates
        vscode.postMessage('requestStatus');
        
        // Listen for full status updates
        const unsubscribeStatus = vscode.onMessage('statusUpdate', (data: ProjectStatus) => {
            setProjectStatus(data);
            setIsRunning(data.status === 'running');
        });
        
        // Listen for mesh-specific status updates (real-time during deployment)
        const unsubscribeMesh = vscode.onMessage('meshStatusUpdate', (data: { status: string; message?: string; endpoint?: string }) => {
            setProjectStatus(prev => prev ? {
                ...prev,
                mesh: {
                    status: data.status as any,
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

    // Initial focus: Start/Stop button (or Open if Start/Stop not present)
    useEffect(() => {
        if (projectStatus) {
            const timer = setTimeout(() => {
                // Focus first action button (Start/Stop or Open)
                const firstButton = document.querySelector('.dashboard-action-button') as HTMLElement;
                if (firstButton) {
                    firstButton.focus();
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, []); // Only on mount

    // Focus trap: Keep keyboard navigation within the dashboard
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;

            // Get all focusable elements in the dashboard
            const focusableElements = document.querySelectorAll<HTMLElement>(
                '.dashboard-action-button, button[aria-label], button:not([disabled])'
            );
            
            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement as HTMLElement;

            // Tab forward from last element -> wrap to first
            if (!e.shiftKey && activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
            
            // Tab backward from first element -> wrap to last
            if (e.shiftKey && activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Action handlers
    const handleStartDemo = () => vscode.postMessage('startDemo');
    const handleStopDemo = () => vscode.postMessage('stopDemo');
    
    // Re-authenticate: Trigger browser authentication flow
    const handleReAuthenticate = () => vscode.postMessage('re-authenticate');
    
    // Logs toggle: Retain focus
    const handleViewLogs = () => {
        vscode.postMessage('viewLogs');
        // Retain focus on Logs button after toggle
        setTimeout(() => {
            const logsButton = document.querySelector('[data-action="logs"]') as HTMLElement;
            if (logsButton) {
                logsButton.focus();
            }
        }, 50);
    };
    
    // Deploy Mesh: Retain focus
    const handleDeployMesh = () => {
        vscode.postMessage('deployMesh');
        // Retain focus on Deploy Mesh button
        setTimeout(() => {
            const deployButton = document.querySelector('[data-action="deploy-mesh"]') as HTMLElement;
            if (deployButton) {
                deployButton.focus();
            }
        }, 50);
    };
    
    const handleOpenBrowser = () => vscode.postMessage('openBrowser');
    const handleConfigure = () => vscode.postMessage('configure');
    const handleOpenDevConsole = () => vscode.postMessage('openDevConsole');
    const handleDeleteProject = () => vscode.postMessage('deleteProject');

    const displayName = projectStatus?.name || project?.name || 'Demo Project';
    const status = projectStatus?.status || 'ready';
    const port = projectStatus?.port || 3000;
    const frontendConfigChanged = projectStatus?.frontendConfigChanged || false;
    const meshStatus = projectStatus?.mesh?.status;
    const meshEndpoint = projectStatus?.mesh?.endpoint;
    const meshMessage = projectStatus?.mesh?.message;
    
    // Spectrum-friendly colors for each status
    const getStatusDisplay = () => {
        switch (status) {
            case 'starting':
                return {
                    color: 'var(--spectrum-global-color-blue-600)',
                    text: 'Starting...'
                };
            case 'running':
                // Amber indicator if config changed while running
                if (frontendConfigChanged) {
                    return {
                        color: 'var(--spectrum-global-color-orange-600)',
                        text: 'Restart Needed'
                    };
                }
                return {
                    color: 'var(--spectrum-global-color-green-600)',
                    text: `Running on port ${port}`
                };
            case 'stopping':
                return {
                    color: 'var(--spectrum-global-color-orange-600)',
                    text: 'Stopping...'
                };
            case 'stopped':
            case 'ready':
                return {
                    color: 'var(--spectrum-global-color-gray-500)',
                    text: 'Stopped'
                };
            case 'configuring':
                return {
                    color: 'var(--spectrum-global-color-blue-600)',
                    text: 'Configuring...'
                };
            case 'error':
                return {
                    color: 'var(--spectrum-global-color-red-600)',
                    text: 'Error'
                };
            default:
                return {
                    color: 'var(--spectrum-global-color-gray-500)',
                    text: 'Ready'
                };
        }
    };
    
    const getMeshStatusDisplay = () => {
        if (!meshStatus) {
            return null;
        }
        
        switch (meshStatus) {
            case 'checking':
                return {
                    color: 'var(--spectrum-global-color-blue-600)',
                    text: 'Checking...'
                };
            case 'needs-auth':
                return {
                    color: 'var(--spectrum-global-color-orange-600)',
                    text: 'Session expired'
                };
            case 'authenticating':
                return {
                    color: 'var(--spectrum-global-color-blue-600)',
                    text: 'Authenticating...'
                };
            case 'deploying':
                return {
                    color: 'var(--spectrum-global-color-blue-600)',
                    text: meshMessage || 'Deploying...'
                };
            case 'deployed':
                return {
                    color: 'var(--spectrum-global-color-green-600)',
                    text: meshEndpoint ? 'Deployed' : 'Deployed'
                };
            case 'config-changed':
                return {
                    color: 'var(--spectrum-global-color-orange-600)',
                    text: 'Redeploy Needed'
                };
            case 'not-deployed':
                return {
                    color: 'var(--spectrum-global-color-gray-500)',
                    text: 'Not Deployed'
                };
            case 'error':
                return {
                    color: 'var(--spectrum-global-color-red-600)',
                    text: 'Deployment Error'
                };
            default:
                return {
                    color: 'var(--spectrum-global-color-gray-500)',
                    text: 'Unknown'
                };
        }
    };
    
    const { color: statusColor, text: statusText } = getStatusDisplay();
    const meshStatusDisplay = getMeshStatusDisplay();

    return (
        <View 
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
                    <Flex direction="row" alignItems="center" gap="size-100" marginBottom="size-50">
                        <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: statusColor,
                            flexShrink: 0
                        }} />
                        <Text UNSAFE_style={{ fontSize: '13px', color: 'var(--spectrum-global-color-gray-700)' }}>
                            Demo: {statusText}
                        </Text>
                    </Flex>
                    
                    {/* Mesh Status */}
                    {meshStatusDisplay && (
                        <Flex direction="row" alignItems="center" gap="size-100">
                            <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: meshStatusDisplay.color,
                                flexShrink: 0
                            }} />
                            
                            {/* Special UI for authentication states */}
                            {meshStatus === 'needs-auth' ? (
                                <Flex direction="row" alignItems="center" gap="size-100">
                                    <Text UNSAFE_style={{ fontSize: '13px', color: 'var(--spectrum-global-color-gray-700)' }}>
                                        API Mesh: {meshStatusDisplay.text}
                                    </Text>
                                    <ActionButton 
                                        isQuiet 
                                        onPress={handleReAuthenticate}
                                        UNSAFE_style={{ marginLeft: '4px' }}
                                    >
                                        <Login size="XS" />
                                        <Text>Sign in</Text>
                                    </ActionButton>
                                </Flex>
                            ) : meshStatus === 'authenticating' ? (
                                <Flex direction="row" alignItems="center" gap="size-100">
                                    <ProgressCircle size="S" isIndeterminate UNSAFE_style={{ width: '16px', height: '16px' }} />
                                    <Text UNSAFE_style={{ fontSize: '13px', color: 'var(--spectrum-global-color-gray-700)' }}>
                                        API Mesh: {meshStatusDisplay.text}
                                    </Text>
                                </Flex>
                            ) : (
                                <Text UNSAFE_style={{ fontSize: '13px', color: 'var(--spectrum-global-color-gray-700)' }}>
                                    API Mesh: {meshStatusDisplay.text}
                                </Text>
                            )}
                        </Flex>
                    )}
                </View>

                <Divider size="S" marginBottom="size-100" />

                {/* Action Grid - 3 columns */}
                <Flex 
                    direction="row" 
                    gap="size-100" 
                    wrap="wrap"
                    UNSAFE_style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px'
                    }}
                >
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
                </Flex>
            </Flex>
        </View>
    );
}

