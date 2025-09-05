import React, { useEffect, useState, useMemo } from 'react';
import {
    View,
    Heading,
    Text,
    SearchField,
    ListView,
    Item,
    Well,
    ProgressCircle,
    Flex,
    Button,
    ActionButton,
    Divider
} from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Edit from '@spectrum-icons/workflow/Edit';
import { WizardState } from '../../types';
import { vscode } from '../../app/vscodeApi';
import { cn } from '../../utils/classNames';

interface Project {
    id: string;
    name: string;
    title: string;
    description?: string;
    type?: string;
}

interface Workspace {
    id: string;
    name: string;
    title?: string;
}

interface AdobeSetupStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

type SetupStep = 'auth' | 'project' | 'workspace';

export function AdobeSetupStep({ state, updateState, setCanProceed }: AdobeSetupStepProps) {
    const [currentStep, setCurrentStep] = useState<SetupStep>('auth');
    const [projects, setProjects] = useState<Project[]>([]);
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(false);
    const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
    const [projectError, setProjectError] = useState<string | null>(null);
    const [workspaceError, setWorkspaceError] = useState<string | null>(null);
    const [projectSearchQuery, setProjectSearchQuery] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(state.adobeProject?.id || null);
    const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(state.adobeWorkspace?.id || null);
    const [isInitialCheck, setIsInitialCheck] = useState(true);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isTransitioningToProjects, setIsTransitioningToProjects] = useState(false);
    const [shouldShowAuthSuccess, setShouldShowAuthSuccess] = useState(false);

    useEffect(() => {
        // Always check authentication on mount
        if (isInitialCheck) {
            checkAuthentication();
            setIsInitialCheck(false);
        }
        
        // Load projects when authenticated and have org
        if (state.adobeAuth.isAuthenticated && state.adobeOrg?.id && projects.length === 0 && !isLoadingProjects) {
            loadProjects();
        }
        
        // Auto-advance steps based on state
        // But don't auto-advance if we should show auth success first
        if (state.adobeAuth.isAuthenticated && !state.adobeProject?.id && currentStep === 'auth' && !shouldShowAuthSuccess) {
            // Only auto-advance if we're not showing the success message
            if (!isTransitioningToProjects) {
                transitionToStep('project');
            }
        } else if (state.adobeProject?.id && !state.adobeWorkspace?.id && currentStep !== 'workspace') {
            transitionToStep('workspace');
        }

        // Listen for auth status updates
        const unsubscribeAuth = vscode.onMessage('auth-status', (data) => {
            updateState({
                adobeAuth: {
                    isAuthenticated: data.isAuthenticated,
                    // Only clear isChecking if we're not actively logging in
                    isChecking: isLoggingIn ? state.adobeAuth.isChecking : false,
                    email: data.email,
                    error: data.error
                },
                adobeOrg: data.organization ? {
                    id: data.organization.id,
                    code: data.organization.code,
                    name: data.organization.name
                } : undefined
            });
            
            // If we have a new organization, persist it
            if (data.organization && (!state.adobeOrg || state.adobeOrg.code !== data.organization.code)) {
                vscode.postMessage('select-organization', { orgCode: data.organization.code });
            }
            
            // Auto-advance if authenticated
            if (data.isAuthenticated && currentStep === 'auth') {
                const isInitialAuthCheck = isInitialCheck || (!isLoggingIn && !isTransitioningToProjects);
                
                if (isInitialAuthCheck) {
                    // First time checking and already authenticated - show success message
                    setShouldShowAuthSuccess(true);
                    setIsTransitioningToProjects(true);
                    // Always load projects after authentication
                    loadProjects();
                    // Show success state for comfortable reading time then transition
                    setTimeout(() => {
                        transitionToStep('project');
                        setIsTransitioningToProjects(false);
                        setShouldShowAuthSuccess(false);
                    }, 2000);
                } else if (isLoggingIn) {
                    // User just logged in - show success message
                    setIsLoggingIn(false);
                    setIsTransitioningToProjects(true);
                    // Always load projects after authentication (for fresh login or org switch)
                    loadProjects();
                    // Show success state for comfortable reading time then transition
                    setTimeout(() => {
                        transitionToStep('project');
                        setIsTransitioningToProjects(false);
                    }, 2000);
                }
            } else if (!data.isAuthenticated && data.error) {
                // Clear logging in state if there was an error
                setIsLoggingIn(false);
            }
        });

        // Listen for projects from extension
        const unsubscribeProjects = vscode.onMessage('projects', (data) => {
            if (Array.isArray(data)) {
                setProjects(data);
                setProjectError(null);
                
                // Auto-select if only one project
                if (data.length === 1 && !selectedProjectId) {
                    selectProject(data[0]);
                }
            } else {
                setProjectError('Failed to load projects');
            }
            setIsLoadingProjects(false);
        });

        // Listen for workspaces from extension
        const unsubscribeWorkspaces = vscode.onMessage('workspaces', (data) => {
            if (Array.isArray(data)) {
                setWorkspaces(data);
                setWorkspaceError(null);
                
                // Auto-select if only one workspace
                if (data.length === 1 && !selectedWorkspaceId) {
                    selectWorkspace(data[0]);
                }
            } else {
                setWorkspaceError('Failed to load workspaces');
            }
            setIsLoadingWorkspaces(false);
        });

        return () => {
            unsubscribeAuth();
            unsubscribeProjects();
            unsubscribeWorkspaces();
        };
    }, [state.adobeAuth.isAuthenticated, state.adobeOrg, state.adobeProject, currentStep, isInitialCheck, projects.length, isLoadingProjects, isLoggingIn, shouldShowAuthSuccess, isTransitioningToProjects]);

    useEffect(() => {
        // Update proceed state when selections change
        const canProceed = !!state.adobeAuth.isAuthenticated && 
                          !!state.adobeProject?.id && 
                          !!state.adobeWorkspace?.id;
        setCanProceed(canProceed);
    }, [state.adobeAuth.isAuthenticated, state.adobeProject, state.adobeWorkspace, setCanProceed]);

    const transitionToStep = (step: SetupStep) => {
        setIsTransitioning(true);
        setTimeout(() => {
            setCurrentStep(step);
            setIsTransitioning(false);
        }, 200);
    };

    const checkAuthentication = () => {
        updateState({
            adobeAuth: { ...state.adobeAuth, isChecking: true }
        });
        vscode.postMessage('check-auth');
    };

    const handleLogin = (force: boolean = false) => {
        setIsLoggingIn(true);  // Track that user initiated login
        updateState({
            adobeAuth: { 
                ...state.adobeAuth, 
                isChecking: true,
                isAuthenticated: force ? false : state.adobeAuth.isAuthenticated
            },
            ...(force && {
                adobeOrg: undefined,
                adobeProject: undefined,
                adobeWorkspace: undefined
            })
        });
        vscode.requestAuth(force);
    };

    const loadProjects = () => {
        if (!state.adobeOrg?.id) return;
        
        setIsLoadingProjects(true);
        setProjectError(null);
        vscode.requestProjects(state.adobeOrg.id);
    };

    const loadWorkspaces = (projectId: string) => {
        setIsLoadingWorkspaces(true);
        setWorkspaceError(null);
        setWorkspaces([]);
        vscode.postMessage("get-workspaces", { projectId });
    };

    const selectProject = (project: Project) => {
        setSelectedProjectId(project.id);
        updateState({
            adobeProject: {
                id: project.id,
                name: project.name,
                title: project.title,
                description: project.description
            }
        });
        
        // Persist project selection globally for CLI
        vscode.postMessage('select-project', { projectId: project.id });
        
        // Auto-advance to workspace step
        transitionToStep('workspace');
        loadWorkspaces(project.id);
    };

    const selectWorkspace = (workspace: Workspace) => {
        setSelectedWorkspaceId(workspace.id);
        updateState({
            adobeWorkspace: {
                id: workspace.id,
                name: workspace.name,
                title: workspace.title
            }
        });
        
        // Persist workspace selection globally for CLI
        vscode.postMessage('select-workspace', { workspaceId: workspace.id });
        
        // Auto-advance to the next step in the wizard after workspace selection
        // This matches the behavior of project selection for consistency
        setTimeout(() => {
            if (onNext) {
                onNext();
            }
        }, 500); // Small delay to let the user see the selection
    };

    const editStep = (step: SetupStep) => {
        if (step === 'auth') {
            // Clear ALL state including projects list when switching orgs
            setProjects([]);
            setWorkspaces([]);
            setSelectedProjectId(null);
            setSelectedWorkspaceId(null);
            setProjectSearchQuery('');
            
            // Set loading state BEFORE transitioning to show immediate feedback
            setIsLoggingIn(true);
            updateState({
                adobeAuth: { 
                    ...state.adobeAuth, 
                    isChecking: true,
                    // Clear authenticated state when switching orgs
                    isAuthenticated: false
                },
                adobeOrg: undefined,
                adobeProject: undefined,
                adobeWorkspace: undefined
            });
            
            // Now transition to show the loading state
            transitionToStep('auth');
            
            // Then actually initiate the re-authentication
            setTimeout(() => {
                vscode.requestAuth(true);
            }, 250);  // Small delay to allow transition to complete
        } else {
            // Clear dependent selections when going back
            if (step === 'project') {
                // Clear workspace when going back to project selection
                setSelectedWorkspaceId(null);
                updateState({ adobeWorkspace: undefined });
                setWorkspaces([]);
            }
            transitionToStep(step);
        }
    };

    // Filter projects based on search query
    const filteredProjects = useMemo(() => {
        if (!projectSearchQuery.trim()) {
            return projects;
        }
        
        const query = projectSearchQuery.toLowerCase();
        return projects.filter(project => 
            project.title.toLowerCase().includes(query) ||
            project.name.toLowerCase().includes(query) ||
            (project.description?.toLowerCase().includes(query) || false)
        );
    }, [projects, projectSearchQuery]);

    const renderLeftColumn = () => {
        const stepContent = cn(
            'step-content',
            isTransitioning && 'transitioning'
        );

        switch (currentStep) {
            case 'auth':
                return (
                    <div className={stepContent}>
                        <Heading level={2} marginBottom="size-300">
                            Adobe Authentication
                        </Heading>
                        
                        {state.adobeAuth.isChecking ? (
                            <Flex direction="column" gap="size-200" alignItems="center" justifyContent="center" height="100%">
                                <ProgressCircle size="L" isIndeterminate />
                                <Text UNSAFE_className="text-lg">
                                    {isLoggingIn ? 'Opening browser for authentication...' : 'Checking authentication status...'}
                                </Text>
                                {isLoggingIn && (
                                    <>
                                        <Text UNSAFE_className="text-sm text-gray-600">
                                            Please complete the login process in your browser
                                        </Text>
                                        <Text UNSAFE_className="text-xs text-gray-600" marginTop="size-100">
                                            This window will update automatically when complete
                                        </Text>
                                    </>
                                )}
                            </Flex>
                        ) : !state.adobeAuth.isAuthenticated ? (
                            <Flex direction="column" gap="size-300" alignItems="center" justifyContent="center" height="100%">
                                <AlertCircle size="L" UNSAFE_className="text-yellow-600" />
                                <Text UNSAFE_className="text-lg">Sign in to continue</Text>
                                <Text UNSAFE_className="text-sm text-gray-600">
                                    You need to authenticate with Adobe to create projects
                                </Text>
                                <Button variant="cta" onPress={() => handleLogin(false)}>
                                    Sign In with Adobe
                                </Button>
                            </Flex>
                        ) : isTransitioningToProjects ? (
                            <Flex direction="column" gap="size-300" alignItems="center" justifyContent="center" height="100%">
                                <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                                <Text UNSAFE_className="text-lg">Authentication successful</Text>
                                <Text UNSAFE_className="text-sm text-gray-600">
                                    Loading your projects...
                                </Text>
                                <ProgressCircle size="S" isIndeterminate marginTop="size-200" />
                            </Flex>
                        ) : (
                            <Flex direction="column" gap="size-300" alignItems="center" justifyContent="center" height="100%">
                                <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                                <Text UNSAFE_className="text-lg">Authentication successful</Text>
                            </Flex>
                        )}
                    </div>
                );

            case 'project':
                return (
                    <div className={stepContent}>
                        <Heading level={2} marginBottom="size-200">
                            Select Adobe Project
                        </Heading>
                        
                        {projects.length > 5 && (
                            <SearchField
                                label="Search projects"
                                placeholder="Type to filter projects..."
                                value={projectSearchQuery}
                                onChange={setProjectSearchQuery}
                                width="100%"
                                marginBottom="size-200"
                                isQuiet
                            />
                        )}

                        {isLoadingProjects ? (
                            <Flex direction="column" gap="size-200" alignItems="center" justifyContent="center" height="100%">
                                <ProgressCircle size="L" isIndeterminate />
                                <Text UNSAFE_className="text-lg">Loading your Adobe projects...</Text>
                                {state.adobeOrg && (
                                    <Text UNSAFE_className="text-sm text-gray-600">
                                        Fetching from organization: {state.adobeOrg.name}
                                    </Text>
                                )}
                            </Flex>
                        ) : projectError ? (
                            <Well>
                                <Flex direction="column" gap="size-200" alignItems="center">
                                    <AlertCircle size="L" UNSAFE_className="text-red-600" />
                                    <Text>{projectError}</Text>
                                    <Button variant="secondary" onPress={loadProjects}>
                                        Retry
                                    </Button>
                                </Flex>
                            </Well>
                        ) : filteredProjects.length > 0 ? (
                            <ListView
                                UNSAFE_className="adobe-project-list"
                                items={filteredProjects}
                                selectionMode="single"
                                selectedKeys={selectedProjectId ? [selectedProjectId] : []}
                                onSelectionChange={(keys) => {
                                    const selectedId = Array.from(keys)[0];
                                    if (selectedId) {
                                        const project = projects.find(p => p.id === selectedId);
                                        if (project) selectProject(project);
                                    }
                                }}
                                height="100%"
                                width="100%"
                            >
                                {(item) => (
                                    <Item key={item.id} textValue={item.title}>
                                        <Text>{item.title}</Text>
                                        <Text slot="description" UNSAFE_className="text-sm">
                                            {item.description || item.name}
                                        </Text>
                                    </Item>
                                )}
                            </ListView>
                        ) : (
                            <Flex alignItems="center" justifyContent="center" height="100%">
                                <Text UNSAFE_className="text-gray-600">No projects found</Text>
                            </Flex>
                        )}
                    </div>
                );

            case 'workspace':
                return (
                    <div className={stepContent}>
                        <Heading level={2} marginBottom="size-300">
                            Select Workspace
                        </Heading>

                        {isLoadingWorkspaces ? (
                            <Flex direction="column" gap="size-200" alignItems="center" justifyContent="center" height="100%">
                                <ProgressCircle size="L" isIndeterminate />
                                <Text UNSAFE_className="text-lg">Loading workspaces...</Text>
                                {state.adobeProject && (
                                    <Text UNSAFE_className="text-sm text-gray-600">
                                        Fetching from project: {state.adobeProject.title}
                                    </Text>
                                )}
                            </Flex>
                        ) : workspaceError ? (
                            <Well>
                                <Flex direction="column" gap="size-200" alignItems="center">
                                    <AlertCircle size="L" UNSAFE_className="text-red-600" />
                                    <Text>{workspaceError}</Text>
                                    <Button 
                                        variant="secondary" 
                                        onPress={() => selectedProjectId && loadWorkspaces(selectedProjectId)}
                                    >
                                        Retry
                                    </Button>
                                </Flex>
                            </Well>
                        ) : workspaces.length > 0 ? (
                            <ListView
                                UNSAFE_className="adobe-workspace-list"
                                items={workspaces}
                                selectionMode="single"
                                selectedKeys={selectedWorkspaceId ? [selectedWorkspaceId] : []}
                                onSelectionChange={(keys) => {
                                    const selectedId = Array.from(keys)[0];
                                    if (selectedId) {
                                        const workspace = workspaces.find(w => w.id === selectedId);
                                        if (workspace) selectWorkspace(workspace);
                                    }
                                }}
                                height="100%"
                                width="100%"
                            >
                                {(item) => (
                                    <Item key={item.id} textValue={item.name}>
                                        <Text>{item.title || item.name}</Text>
                                    </Item>
                                )}
                            </ListView>
                        ) : (
                            <Flex alignItems="center" justifyContent="center" height="100%">
                                <Text UNSAFE_className="text-gray-600">No workspaces found</Text>
                            </Flex>
                        )}
                    </div>
                );
        }
    };

    const renderRightColumn = () => {
        const isComplete = state.adobeAuth.isAuthenticated && 
                          state.adobeProject?.id && 
                          state.adobeWorkspace?.id;

        return (
            <View height="100%" UNSAFE_className={cn('adobe-summary-panel')}>
                <Heading level={3} marginBottom="size-300">
                    Configuration Summary
                </Heading>

                {/* Authentication Status */}
                <View marginBottom="size-200">
                    <Flex justifyContent="space-between" alignItems="center" marginBottom="size-100">
                        <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')}>
                            Authentication
                        </Text>
                        {state.adobeAuth.isAuthenticated && (
                            <ActionButton
                                isQuiet
                                onPress={() => editStep('auth')}
                                UNSAFE_className="edit-button"
                            >
                                <Edit size="XS" />
                            </ActionButton>
                        )}
                    </Flex>
                    {state.adobeAuth.isAuthenticated ? (
                        <Flex gap="size-100" alignItems="center">
                            <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                            <View>
                                <Text UNSAFE_className="text-sm">{state.adobeAuth.email}</Text>
                                {state.adobeOrg && (
                                    <Text UNSAFE_className="text-xs text-gray-600">
                                        {state.adobeOrg.name}
                                    </Text>
                                )}
                            </View>
                        </Flex>
                    ) : (
                        <Text UNSAFE_className="text-sm text-gray-600">Not authenticated</Text>
                    )}
                </View>

                <Divider size="S" />

                {/* Project Selection */}
                <View marginTop="size-200" marginBottom="size-200">
                    <Flex justifyContent="space-between" alignItems="center" marginBottom="size-100">
                        <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')}>
                            Project
                        </Text>
                        {state.adobeProject?.id && (
                            <ActionButton
                                isQuiet
                                onPress={() => editStep('project')}
                                UNSAFE_className="edit-button"
                            >
                                <Edit size="XS" />
                            </ActionButton>
                        )}
                    </Flex>
                    {state.adobeProject ? (
                        <Flex gap="size-100" alignItems="flex-start">
                            <CheckmarkCircle size="S" UNSAFE_className="text-green-600" marginTop="size-50" />
                            <View>
                                <Text UNSAFE_className="text-sm font-medium">
                                    {state.adobeProject.title}
                                </Text>
                                {state.adobeProject.description && (
                                    <Text UNSAFE_className="text-xs text-gray-600">
                                        {state.adobeProject.description}
                                    </Text>
                                )}
                            </View>
                        </Flex>
                    ) : (
                        <Text UNSAFE_className="text-sm text-gray-600">
                            {state.adobeAuth.isAuthenticated ? 'No project selected' : 'Authenticate first'}
                        </Text>
                    )}
                </View>

                <Divider size="S" />

                {/* Workspace Selection */}
                <View marginTop="size-200" marginBottom="size-200">
                    <Flex justifyContent="space-between" alignItems="center" marginBottom="size-100">
                        <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')}>
                            Workspace
                        </Text>
                        {state.adobeWorkspace?.id && (
                            <ActionButton
                                isQuiet
                                onPress={() => editStep('workspace')}
                                UNSAFE_className="edit-button"
                            >
                                <Edit size="XS" />
                            </ActionButton>
                        )}
                    </Flex>
                    {state.adobeWorkspace ? (
                        <Flex gap="size-100" alignItems="center">
                            <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                            <Text UNSAFE_className="text-sm">
                                {state.adobeWorkspace.title || state.adobeWorkspace.name}
                            </Text>
                        </Flex>
                    ) : (
                        <Text UNSAFE_className="text-sm text-gray-600">
                            {state.adobeProject?.id ? 'No workspace selected' : 'Select project first'}
                        </Text>
                    )}
                </View>

                {/* Ready Status */}
                {isComplete && (
                    <>
                        <Divider size="S" />
                        <View marginTop="size-200">
                            <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')} marginBottom="size-100">
                                Status
                            </Text>
                            <Flex gap="size-100" alignItems="center">
                                <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />
                                <Text UNSAFE_className="text-sm">
                                    All configurations complete
                                </Text>
                            </Flex>
                        </View>
                    </>
                )}
            </View>
        );
    };

    return (
        <div className="adobe-setup-two-column" style={{ width: '100%', height: '100%', margin: 0, padding: 0 }}>
            {/* Use standard div with flex for layout to avoid Spectrum width constraints */}
            <div style={{ display: 'flex', height: '100%', width: '100%', gap: '0' }}>
                {/* Left Column - Active Step (60%) */}
                <div style={{ flex: '1 1 60%', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                    {renderLeftColumn()}
                </div>

                {/* Right Column - Summary (40%) */}
                <div style={{ 
                    flex: '0 0 40%', 
                    padding: '24px', 
                    backgroundColor: 'var(--spectrum-global-color-gray-75)',
                    borderLeft: '1px solid var(--spectrum-global-color-gray-200)'
                }}>
                    {renderRightColumn()}
                </div>
            </div>

            <style>{`
                .adobe-setup-two-column {
                    overflow: hidden;
                }

                .step-content {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    opacity: 1;
                    transform: translateX(0);
                    transition: opacity 0.2s ease, transform 0.2s ease;
                }
                
                .step-content.transitioning {
                    opacity: 0;
                    transform: translateX(-10px);
                }

                .adobe-project-list,
                .adobe-workspace-list {
                    border: 1px solid var(--spectrum-global-color-gray-200);
                    border-radius: 4px;
                    background: var(--spectrum-global-color-gray-50);
                }

                .adobe-project-list [aria-selected="true"],
                .adobe-workspace-list [aria-selected="true"] {
                    background-color: var(--spectrum-global-color-blue-100) !important;
                    border-left: 3px solid var(--spectrum-global-color-blue-600) !important;
                    padding-left: 13px !important;
                }

                .adobe-summary-panel {
                    position: sticky;
                    top: 0;
                }

                .edit-button {
                    color: var(--spectrum-global-color-gray-600);
                    transition: color 0.2s ease;
                }

                .edit-button:hover {
                    color: var(--spectrum-global-color-blue-600);
                }

                .text-uppercase {
                    text-transform: uppercase;
                }

                .letter-spacing-05 {
                    letter-spacing: 0.05em;
                }

                .font-semibold {
                    font-weight: 600;
                }

                .text-xs {
                    font-size: 11px;
                }

                .text-sm {
                    font-size: 13px;
                }

                .text-lg {
                    font-size: 18px;
                }

                .text-gray-600 {
                    color: var(--spectrum-global-color-gray-600);
                }

                .text-gray-700 {
                    color: var(--spectrum-global-color-gray-700);
                }

                .text-green-600 {
                    color: var(--spectrum-global-color-green-600);
                }

                .text-yellow-600 {
                    color: var(--spectrum-global-color-yellow-600);
                }

                .text-red-600 {
                    color: var(--spectrum-global-color-red-600);
                }

                .font-medium {
                    font-weight: 500;
                }
            `}</style>
        </div>
    );
}