import React, { useState, useEffect } from 'react';
import {
    View,
    Flex,
    Heading,
    Text,
    ActionButton,
    Divider,
    ActionGroup,
    Item
} from '@adobe/react-spectrum';
import PlayCircle from '@spectrum-icons/workflow/PlayCircle';
import StopCircle from '@spectrum-icons/workflow/StopCircle';
import Settings from '@spectrum-icons/workflow/Settings';
import Refresh from '@spectrum-icons/workflow/Refresh';
import Globe from '@spectrum-icons/workflow/Globe';
import Delete from '@spectrum-icons/workflow/Delete';
import ViewList from '@spectrum-icons/workflow/ViewList';
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
        status: 'not-deployed' | 'deploying' | 'deployed' | 'config-changed' | 'error';
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

    // Auto-focus the Start button when dashboard opens (if not running)
    useEffect(() => {
        if (projectStatus && !isRunning) {
            // Small delay to ensure DOM is ready
            const timer = setTimeout(() => {
                const startButton = document.querySelector('.dashboard-action-button') as HTMLElement;
                if (startButton) {
                    startButton.focus();
                }
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [projectStatus, isRunning]);

    // Focus trap for Tab navigation - keeps focus within the webview
    useEffect(() => {
        const selector = 'button:not([disabled]):not([tabindex="-1"]), ' +
            'input:not([disabled]):not([tabindex="-1"]), ' +
            'select:not([disabled]):not([tabindex="-1"]), ' +
            'textarea:not([disabled]):not([tabindex="-1"]), ' +
            '[tabindex]:not([tabindex="-1"]):not([tabindex="0"])';

        const focusDefaultElement = () => {
            // Focus first focusable element if no element is focused
            const focusableElements = document.querySelectorAll(selector);
            if (focusableElements.length > 0) {
                const first = focusableElements[0] as HTMLElement;
                if (document.activeElement === document.body || !document.activeElement) {
                    first.focus();
                }
            }
        };

        // Ensure focus starts inside the webview
        const focusTimeout = window.setTimeout(focusDefaultElement, 0);
        window.addEventListener('focus', focusDefaultElement);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Tab') {
                const focusableElements = document.querySelectorAll(selector);
                const focusableArray = Array.from(focusableElements) as HTMLElement[];
                
                if (focusableArray.length === 0) {
                    return;
                }

                const currentIndex = focusableArray.indexOf(document.activeElement as HTMLElement);

                e.preventDefault();

                if (e.shiftKey) {
                    // Shift+Tab: move to previous element (or wrap to last)
                    const nextIndex = currentIndex <= 0 ? focusableArray.length - 1 : currentIndex - 1;
                    focusableArray[nextIndex].focus();
                } else {
                    // Tab: move to next element (or wrap to first)
                    const nextIndex = currentIndex >= focusableArray.length - 1 ? 0 : currentIndex + 1;
                    focusableArray[nextIndex].focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        
        return () => {
            window.clearTimeout(focusTimeout);
            window.removeEventListener('focus', focusDefaultElement);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [projectStatus, isRunning]); // Re-run when button layout changes

    const handleStartDemo = () => vscode.postMessage('startDemo');
    const handleStopDemo = () => vscode.postMessage('stopDemo');
    const handleOpenBrowser = () => vscode.postMessage('openBrowser');
    const handleViewLogs = () => vscode.postMessage('viewLogs');
    const handleDeployMesh = () => vscode.postMessage('deployMesh');
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
                        text: 'Configuration Changed'
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
                    text: 'Configuration Changed'
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
                            <Text UNSAFE_style={{ fontSize: '13px', color: 'var(--spectrum-global-color-gray-700)' }}>
                                API Mesh: {meshStatusDisplay.text}
                            </Text>
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
                            UNSAFE_className="dashboard-action-button dashboard-action-button-enter"
                        >
                            <PlayCircle size="L" />
                            <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Start</Text>
                        </ActionButton>
                    )}
                    {isRunning && (
                        <ActionButton 
                            onPress={handleStopDemo}
                            isQuiet
                            UNSAFE_className="dashboard-action-button dashboard-action-button-enter"
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
                    >
                        <ViewList size="L" />
                        <Text UNSAFE_style={{ fontSize: '12px', marginTop: '4px' }}>Logs</Text>
                    </ActionButton>

                    {/* Deploy Mesh */}
                    <ActionButton 
                        onPress={handleDeployMesh}
                        isQuiet
                        UNSAFE_className="dashboard-action-button"
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

