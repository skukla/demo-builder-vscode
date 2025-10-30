import React, { useState, useEffect, useMemo } from 'react';
import {
    Heading,
    ListView,
    Item,
    Text,
    Button,
    Well,
    Flex,
    ActionButton,
    SearchField,
    ProgressCircle
} from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import Refresh from '@spectrum-icons/workflow/Refresh';
import { webviewClient } from '@/webview-ui/shared/utils/WebviewClient';
import { LoadingDisplay } from '@/webview-ui/shared/components/feedback/LoadingDisplay';
import { ConfigurationSummary } from '@/webview-ui/shared/components/ui/ConfigurationSummary';
import { FadeTransition } from '@/webview-ui/shared/components/ui/FadeTransition';
import { TwoColumnLayout } from '@/webview-ui/shared/components/layout/TwoColumnLayout';
import { WizardState, Workspace, WizardStep } from '@/webview-ui/shared/types';
import { useDebouncedLoading } from '@/hooks';

interface AdobeWorkspaceStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
}

export function AdobeWorkspaceStep({ state, updateState, setCanProceed, completedSteps = [] }: AdobeWorkspaceStepProps) {
    // Use workspaces from wizard state cache (persistent across navigation)
    const workspaces = state.workspacesCache || [];
    const [isLoading, setIsLoading] = useState(!state.workspacesCache);
    const [isRefreshing, setIsRefreshing] = useState(false); // Track refresh vs initial load
    const [hasLoadedOnce, setHasLoadedOnce] = useState(!!state.workspacesCache); // Track if we've ever loaded data
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Debounce loading state: only show loading UI if operation takes >300ms
    // This prevents flash of loading state for fast SDK operations
    const showLoading = useDebouncedLoading(isLoading && !isRefreshing);
    
    // Filter workspaces based on search query
    const filteredWorkspaces = useMemo(() => {
        if (!searchQuery.trim()) {
            return workspaces;
        }
        
        const query = searchQuery.toLowerCase();
        return workspaces.filter(workspace => 
            workspace.name?.toLowerCase().includes(query) ||
            workspace.title?.toLowerCase().includes(query)
        );
    }, [workspaces, searchQuery]);
    
    useEffect(() => {
        // Only load workspaces if not already cached
        if (!state.workspacesCache) {
            if (state.adobeProject?.id) {
                loadWorkspaces();
            } else {
                setError('No project selected. Please go back and select a project.');
                setIsLoading(false);
            }
        }
    }, []);
    
    useEffect(() => {
        setCanProceed(!!state.adobeWorkspace?.id);
    }, [state.adobeWorkspace, setCanProceed]);
    
    // Listen for workspaces from extension
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('workspaces', (data) => {
            if (Array.isArray(data)) {
                // Store workspaces in wizard state cache for persistence
                updateState({ workspacesCache: data });
                setIsLoading(false);
                setIsRefreshing(false);
                setHasLoadedOnce(true); // Mark that we've loaded data at least once
                setError(null);

                // Auto-select if only one workspace
                if (data.length === 1 && !state.adobeWorkspace?.id) {
                    selectWorkspace(data[0]);
                }

                // Auto-select Stage workspace if available and nothing selected
                if (!state.adobeWorkspace?.id && data.length > 1) {
                    // Look for Stage workspace (case-insensitive)
                    const stageWorkspace = data.find(ws =>
                        ws.name?.toLowerCase().includes('stage') ||
                        ws.title?.toLowerCase().includes('stage')
                    );

                    if (stageWorkspace) {
                        selectWorkspace(stageWorkspace);
                    }
                }
            } else {
                const errorData = data as any;
                if (errorData && errorData.error) {
                    // Backend sends structured error (including timeout)
                    setError(errorData.error);
                    setIsLoading(false);
                    setIsRefreshing(false);
                }
            }
        });
        
        const unsubscribeError = webviewClient.onMessage('workspace-error', (data) => {
            const errorData = data as any;
            setError(errorData.error || 'Failed to load workspaces');
            setIsLoading(false);
            setIsRefreshing(false);
        });
        
        return () => {
            unsubscribe();
            unsubscribeError();
        };
    }, [state.adobeWorkspace, updateState]);
    
    const loadWorkspaces = () => {
        setIsLoading(true);
        setError(null);
        // Backend handles timeout detection and will send error via 'workspaces' message
        webviewClient.postMessage('get-workspaces', { projectId: state.adobeProject!.id });
    };
    
    const selectWorkspace = (workspace: Workspace) => {
        // BACKEND CALL ON CONTINUE PATTERN - UI PHASE:
        // Immediate UI state update for visual feedback
        // Backend workspace selection happens in WizardContainer.goNext()
        updateState({
            adobeWorkspace: {
                id: workspace.id,
                name: workspace.name,
                title: workspace.title
            }
        });
    };
    
    return (
        <TwoColumnLayout
            leftMaxWidth="800px"
            leftPadding="size-300"
            rightPadding="size-300"
            gap="0"
            leftContent={
                <>
                    <Heading level={2} marginBottom="size-300">
                        Select Workspace
                    </Heading>

                    {showLoading || (isLoading && !hasLoadedOnce) ? (
                    <Flex justifyContent="center" alignItems="center" height="350px">
                        <LoadingDisplay 
                            size="L"
                            message="Loading workspaces..."
                            subMessage={state.adobeProject ? `Fetching from project: ${state.adobeProject.title || state.adobeProject.name}` : undefined}
                            helperText="This could take up to 30 seconds"
                        />
                    </Flex>
                ) : error && !isLoading ? (
                    <FadeTransition show={true}>
                        <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                            <Flex direction="column" gap="size-200" alignItems="center">
                                <AlertCircle UNSAFE_className="text-red-600" size="L" />
                                <Flex direction="column" gap="size-100" alignItems="center">
                                    <Text UNSAFE_className="text-xl font-medium">
                                        Error Loading Workspaces
                                    </Text>
                                    <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{maxWidth: '450px'}}>
                                        {error}
                                    </Text>
                                </Flex>
                                <Button variant="accent" onPress={loadWorkspaces} marginTop="size-300">
                                    <Refresh size="S" marginEnd="size-100" />
                                    Try Again
                                </Button>
                            </Flex>
                        </Flex>
                    </FadeTransition>
                ) : workspaces.length === 0 && !isLoading ? (
                    <Flex justifyContent="center" alignItems="center" height="350px">
                        <Well>
                            <Flex gap="size-200" alignItems="center">
                                <AlertCircle UNSAFE_className="text-yellow-600" />
                                <Flex direction="column" gap="size-50">
                                    <Text><strong>No Workspaces Found</strong></Text>
                                    <Text UNSAFE_className="text-sm">
                                        No workspaces found in project {state.adobeProject?.title || state.adobeProject?.name}.
                                        Please create a workspace in Adobe Console first.
                                    </Text>
                                </Flex>
                            </Flex>
                        </Well>
                    </Flex>
                ) : (
                    <>
                        {/* Search field - only show when > 5 workspaces */}
                        {workspaces.length > 5 && (
                            <Flex gap="size-100" marginBottom="size-200" alignItems="end">
                                <SearchField
                                    placeholder="Type to filter workspaces..."
                                    value={searchQuery}
                                    onChange={setSearchQuery}
                                    width="100%"
                                    isQuiet
                                    autoFocus={!state.adobeWorkspace?.id}
                                    UNSAFE_style={{ flex: 1 }}
                                />
                                <ActionButton 
                                    isQuiet 
                                    onPress={() => {
                                        setIsRefreshing(true);
                                        // Don't clear cache - keep old data visible while refreshing
                                        loadWorkspaces();
                                    }}
                                    aria-label="Refresh workspaces"
                                    isDisabled={isLoading}
                                    UNSAFE_style={{ cursor: 'pointer' }}
                                >
                                    {isLoading ? <ProgressCircle size="S" isIndeterminate /> : <Refresh />}
                                </ActionButton>
                            </Flex>
                        )}

                        {/* Workspace count - only show after data has loaded */}
                        {hasLoadedOnce && (
                            <Flex justifyContent="space-between" alignItems="center" marginBottom="size-200">
                                <Text UNSAFE_className="text-sm text-gray-700">
                                    Showing {filteredWorkspaces.length} of {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}
                                </Text>
                                {workspaces.length <= 5 && (
                                    <ActionButton 
                                        isQuiet 
                                        onPress={() => {
                                            setIsRefreshing(true);
                                            // Don't clear cache - keep old data visible while refreshing
                                            loadWorkspaces();
                                        }}
                                        aria-label="Refresh workspaces"
                                        isDisabled={isLoading}
                                        UNSAFE_style={{ cursor: 'pointer' }}
                                    >
                                        {isLoading ? <ProgressCircle size="S" isIndeterminate /> : <Refresh />}
                                    </ActionButton>
                                )}
                            </Flex>
                        )}

                        <div style={{
                            flex: 1,
                            transition: 'opacity 200ms ease-in-out',
                            opacity: isRefreshing ? 0.5 : 1,
                            pointerEvents: isRefreshing ? 'none' : 'auto'
                        }}>
                            <ListView
                            items={filteredWorkspaces}
                            selectionMode="single"
                            selectedKeys={state.adobeWorkspace?.id ? [state.adobeWorkspace.id] : []}
                            onSelectionChange={(keys) => {
                                const workspaceId = Array.from(keys)[0] as string;
                                const workspace = workspaces.find(w => w.id === workspaceId);
                                if (workspace) {
                                    selectWorkspace(workspace);
                                }
                            }}
                            aria-label="Adobe I/O Workspaces"
                            height="100%"
                            UNSAFE_style={{ flex: 1 }}
                        >
                            {(item) => (
                                <Item key={item.id} textValue={item.title || item.name}>
                                    <Text>{item.title || item.name}</Text>
                                    {item.title && item.name && item.title !== item.name && (
                                        <Text slot="description" UNSAFE_className="text-sm text-gray-600">
                                            {item.name}
                                        </Text>
                                    )}
                                </Item>
                            )}
                        </ListView>
                        </div>
                    </>
                )}
                </>
            }
            rightContent={
                <ConfigurationSummary state={state} completedSteps={completedSteps} currentStep={state.currentStep} />
            }
        />
    );
}