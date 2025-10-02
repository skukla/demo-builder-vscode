import React, { useState, useEffect } from 'react';
import { 
    View, 
    Heading, 
    ListView, 
    Item, 
    Text,
    Button,
    Well,
    Flex
} from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import { vscode } from '../../app/vscodeApi';
import { LoadingDisplay } from '../shared/LoadingDisplay';
import { ConfigurationSummary } from '../shared/ConfigurationSummary';
import { WizardState, Workspace, WizardStep } from '../../types';
import { useDebouncedLoading } from '../../utils/useDebouncedLoading';

interface AdobeWorkspaceStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
}

export function AdobeWorkspaceStep({ state, updateState, setCanProceed, completedSteps = [] }: AdobeWorkspaceStepProps) {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Debounce loading state: only show loading UI if operation takes >300ms
    // This prevents flash of loading state for fast SDK operations
    const showLoading = useDebouncedLoading(isLoading);
    
    useEffect(() => {
        if (state.adobeProject?.id) {
            loadWorkspaces();
        } else {
            setError('No project selected. Please go back and select a project.');
            setIsLoading(false);
        }
    }, []);
    
    useEffect(() => {
        setCanProceed(!!state.adobeWorkspace?.id);
    }, [state.adobeWorkspace, setCanProceed]);
    
    // Listen for workspaces from extension
    useEffect(() => {
        const unsubscribe = vscode.onMessage('workspaces', (data) => {
            if (Array.isArray(data)) {
                setWorkspaces(data);
                setIsLoading(false);
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
            } else if (data && data.error) {
                setError(data.error);
                setIsLoading(false);
            }
        });
        
        const unsubscribeError = vscode.onMessage('workspace-error', (data) => {
            setError(data.error || 'Failed to load workspaces');
            setIsLoading(false);
        });
        
        return () => {
            unsubscribe();
            unsubscribeError();
        };
    }, [state.adobeWorkspace]);
    
    const loadWorkspaces = () => {
        setIsLoading(true);
        setError(null);
        vscode.postMessage('get-workspaces', { projectId: state.adobeProject!.id });
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
        <div style={{ display: 'flex', height: '100%', width: '100%', gap: '0' }}>
            {/* Left: Workspace Selection - constrained to 800px like other steps */}
            <div style={{
                maxWidth: '800px',
                width: '100%',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <Heading level={2} marginBottom="size-300">
                    Select Workspace
                </Heading>
                
                <Text marginBottom="size-200" UNSAFE_className="text-sm text-gray-600">
                    Project: {state.adobeProject?.title || state.adobeProject?.name}
                </Text>


                {showLoading ? (
                    <Flex justifyContent="center" alignItems="center" height="100%">
                        <LoadingDisplay 
                            size="L"
                            message="Loading workspaces..."
                            subMessage={state.adobeProject ? `Fetching from project: ${state.adobeProject.title || state.adobeProject.name}` : undefined}
                        />
                    </Flex>
                ) : error && !isLoading ? (
                    <Flex justifyContent="center" alignItems="center" height="100%">
                        <Well>
                            <Flex gap="size-200" alignItems="center">
                                <AlertCircle UNSAFE_className="text-red-600" />
                                <Flex direction="column" gap="size-50">
                                    <Text><strong>Error Loading Workspaces</strong></Text>
                                    <Text UNSAFE_className="text-sm">{error}</Text>
                                </Flex>
                            </Flex>
                            <Button variant="secondary" onPress={loadWorkspaces} marginTop="size-200">
                                Retry
                            </Button>
                        </Well>
                    </Flex>
                ) : workspaces.length === 0 && !isLoading ? (
                    <Flex justifyContent="center" alignItems="center" height="100%">
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
                    <ListView
                        items={workspaces}
                        selectionMode="single"
                        selectedKeys={state.adobeWorkspace?.id ? [state.adobeWorkspace.id] : []}
                        onSelectionChange={(keys) => {
                            const workspaceId = Array.from(keys)[0] as string;
                            const workspace = workspaces.find(w => w.id === workspaceId);
                            if (workspace) {
                                selectWorkspace(workspace);
                            }
                        }}
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
                )}
            </div>
            
            {/* Right: Summary Panel - positioned after main content */}
            <div style={{
                flex: '1',
                padding: '24px',
                backgroundColor: 'var(--spectrum-global-color-gray-75)',
                borderLeft: '1px solid var(--spectrum-global-color-gray-200)'
            }}>
                <ConfigurationSummary state={state} completedSteps={completedSteps} currentStep={state.currentStep} />
            </div>
        </div>
    );
}