import React, { useEffect, useState, useMemo, useRef } from 'react';
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
    Content,
    ActionButton,
    Badge,
    Divider
} from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import Folder from '@spectrum-icons/workflow/Folder';
import Building from '@spectrum-icons/workflow/Building';
import Layers from '@spectrum-icons/workflow/Layers';
import ArrowDown from '@spectrum-icons/workflow/ArrowDown';
import { WizardState } from '../../types';
import { vscode } from '../../app/vscodeApi';

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

interface AdobeContextStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function AdobeContextStep({ state, updateState, setCanProceed }: AdobeContextStepProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
    const [projectError, setProjectError] = useState<string | null>(null);
    const [workspaceError, setWorkspaceError] = useState<string | null>(null);
    const [projectSearchQuery, setProjectSearchQuery] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(state.adobeProject?.id || null);
    const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(state.adobeWorkspace?.id || null);
    
    // Refs for scrolling
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const organizationRef = useRef<HTMLDivElement>(null);
    const projectRef = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Load projects when component mounts
        if (state.adobeOrg?.id) {
            loadProjects();
        }

        // Listen for projects from extension
        const unsubscribeProjects = vscode.onMessage('projects', (data) => {
            if (Array.isArray(data)) {
                setProjects(data);
                setProjectError(null);
                
                // Auto-select if only one project
                if (data.length === 1) {
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
                if (data.length === 1) {
                    selectWorkspace(data[0]);
                }
                
                // Auto-scroll to workspace section when workspaces load
                if (data.length > 0) {
                    setTimeout(() => {
                        scrollToSection('workspace');
                    }, 300);
                }
            } else {
                setWorkspaceError('Failed to load workspaces');
            }
            setIsLoadingWorkspaces(false);
        });

        return () => {
            unsubscribeProjects();
            unsubscribeWorkspaces();
        };
    }, [state.adobeOrg]);

    useEffect(() => {
        // Load workspaces when a project is selected
        if (selectedProjectId && selectedProjectId !== state.adobeProject?.id) {
            loadWorkspaces(selectedProjectId);
        }
    }, [selectedProjectId]);

    useEffect(() => {
        // Can proceed if both project and workspace are selected
        setCanProceed(!!(state.adobeProject?.id && state.adobeWorkspace?.id));
    }, [state.adobeProject, state.adobeWorkspace, setCanProceed]);

    const loadProjects = () => {
        if (!state.adobeOrg?.id) return;
        
        setIsLoadingProjects(true);
        setProjectError(null);
        vscode.requestProjects(state.adobeOrg.id);
    };

    const loadWorkspaces = (projectId: string) => {
        setIsLoadingWorkspaces(true);
        setWorkspaceError(null);
        setWorkspaces([]); // Clear previous workspaces
        setSelectedWorkspaceId(null);
        updateState({ adobeWorkspace: undefined });
        vscode.postMessage({ type: 'get-workspaces', projectId });
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
        loadWorkspaces(project.id);
        
        // Show loading state and scroll hint
        setTimeout(() => {
            if (!isLoadingWorkspaces) {
                scrollToSection('workspace');
            }
        }, 500);
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

    if (isLoadingProjects) {
        return (
            <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
                <View>
                    <Heading level={2} marginBottom="size-300">
                        Select Adobe Context
                    </Heading>
                    <Flex gap="size-200" alignItems="center">
                        <ProgressCircle size="S" isIndeterminate />
                        <Text>Loading projects...</Text>
                    </Flex>
                </View>
            </div>
        );
    }

    // Scroll to section function
    const scrollToSection = (section: 'org' | 'project' | 'workspace') => {
        const refs = {
            org: organizationRef,
            project: projectRef,
            workspace: workspaceRef
        };
        
        refs[section].current?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start'
        });
    };

    return (
        <div ref={scrollContainerRef} style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            <Heading level={2} marginBottom="size-300">
                Select Project and Workspace
            </Heading>
            
            <Text marginBottom="size-400">
                Choose your Adobe project and workspace for deployment.
            </Text>

            {/* Compact Organization Display */}
            {state.adobeOrg && (
                <div ref={organizationRef}>
                    <Well marginBottom="size-300">
                        <Flex gap="size-200" alignItems="center">
                            <Building size="S" />
                            <Text>
                                <strong>Organization:</strong> {state.adobeOrg.name}
                            </Text>
                            <ActionButton
                                isQuiet
                                onPress={() => vscode.requestAuth(true)}
                                marginStart="auto"
                            >
                                Switch
                            </ActionButton>
                        </Flex>
                    </Well>
                    
                    {/* Jump to Projects button */}
                    {projects.length > 0 && (
                        <Flex marginBottom="size-300" justifyContent="center">
                            <Button
                                variant="secondary"
                                onPress={() => scrollToSection('project')}
                            >
                                <ArrowDown size="S" />
                                <Text>Jump to Projects</Text>
                            </Button>
                        </Flex>
                    )}
                </div>
            )}

            {/* Project Selection Section */}
            <div ref={projectRef}>
                <View marginBottom="size-400">
                    <Heading level={3} marginBottom="size-200">
                        <Flex gap="size-100" alignItems="center">
                            <Folder size="S" />
                            <Text>Project</Text>
                        </Flex>
                    </Heading>

                {projectError ? (
                    <Well>
                        <Flex gap="size-200" alignItems="center">
                            <AlertCircle UNSAFE_className="text-red-600" />
                            <View flex>
                                <Text><strong>Error Loading Projects</strong></Text>
                                <Text UNSAFE_className="text-sm text-gray-700">{projectError}</Text>
                            </View>
                            <Button variant="secondary" onPress={loadProjects}>
                                Retry
                            </Button>
                        </Flex>
                    </Well>
                ) : projects.length > 0 ? (
                    <>
                        {/* Search Field */}
                        {projects.length > 3 && (
                            <SearchField
                                label="Search projects"
                                placeholder="Type to filter projects..."
                                value={projectSearchQuery}
                                onChange={setProjectSearchQuery}
                                width="100%"
                                marginBottom="size-200"
                            />
                        )}

                        {/* Projects List */}
                        {filteredProjects.length > 0 ? (
                            <ListView
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
                                height="size-4600"
                                width="100%"
                                marginBottom="size-200"
                            >
                                {(item) => (
                                    <Item key={item.id} textValue={item.title}>
                                        <Folder />
                                        <Text>{item.title}</Text>
                                        <Text slot="description" UNSAFE_className="text-sm">
                                            {item.description || item.name}
                                        </Text>
                                        {selectedProjectId === item.id && (
                                            <Badge variant="positive" marginStart="auto">
                                                Selected
                                            </Badge>
                                        )}
                                    </Item>
                                )}
                            </ListView>
                        ) : (
                            <Well>
                                <Flex gap="size-200" alignItems="center">
                                    <AlertCircle UNSAFE_className="text-yellow-600" />
                                    <Text>
                                        No projects found matching "{projectSearchQuery}". Try a different search term.
                                    </Text>
                                </Flex>
                            </Well>
                        )}
                    </>
                ) : (
                    <Well>
                        <Flex gap="size-200" alignItems="center">
                            <AlertCircle color="notice" />
                            <Text>No projects found in this organization. You may need to create a project in the Adobe Console first.</Text>
                        </Flex>
                    </Well>
                )}
                </View>
                
                {/* Jump to Workspaces button - show after project selection */}
                {selectedProjectId && !isLoadingWorkspaces && workspaces.length > 0 && (
                    <Flex marginBottom="size-300" justifyContent="center">
                        <Button
                            variant="secondary"
                            onPress={() => scrollToSection('workspace')}
                        >
                            <ArrowDown size="S" />
                            <Text>Select Workspace</Text>
                        </Button>
                    </Flex>
                )}
            </div>

            {/* Workspace Selection Section - Only show when project is selected */}
            {selectedProjectId && (
                <div ref={workspaceRef}>
                    <Divider size="S" marginY="size-300" />
                    <View marginBottom="size-400">
                        <Heading level={3} marginBottom="size-200">
                            <Flex gap="size-100" alignItems="center">
                                <Layers size="S" />
                                <Text>Workspace</Text>
                                {state.adobeProject && (
                                    <Badge variant="neutral" marginStart="size-100">
                                        {state.adobeProject.title}
                                    </Badge>
                                )}
                            </Flex>
                        </Heading>

                        {isLoadingWorkspaces ? (
                            <Flex gap="size-200" alignItems="center">
                                <ProgressCircle size="S" isIndeterminate />
                                <Text>Loading workspaces...</Text>
                            </Flex>
                        ) : workspaceError ? (
                            <Well>
                                <Flex gap="size-200" alignItems="center">
                                    <AlertCircle UNSAFE_className="text-red-600" />
                                    <View flex>
                                        <Text><strong>Error Loading Workspaces</strong></Text>
                                        <Text UNSAFE_className="text-sm text-gray-700">{workspaceError}</Text>
                                    </View>
                                    <Button variant="secondary" onPress={() => loadWorkspaces(selectedProjectId)}>
                                        Retry
                                    </Button>
                                </Flex>
                            </Well>
                        ) : workspaces.length > 0 ? (
                            <ListView
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
                                height="size-3000"
                                width="100%"
                                marginBottom="size-200"
                            >
                                {(item) => (
                                    <Item key={item.id} textValue={item.name}>
                                        <Layers />
                                        <Text>{item.title || item.name}</Text>
                                        {selectedWorkspaceId === item.id && (
                                            <Badge variant="positive" marginStart="auto">
                                                Selected
                                            </Badge>
                                        )}
                                    </Item>
                                )}
                            </ListView>
                        ) : (
                            <Well>
                                <Flex gap="size-200" alignItems="center">
                                    <AlertCircle color="notice" />
                                    <Text>No workspaces found for this project.</Text>
                                </Flex>
                            </Well>
                        )}
                    </View>
                </div>
            )}

            {/* Selected Context Summary */}
            {state.adobeProject && state.adobeWorkspace && (
                <Well backgroundColor="positive" marginTop="size-400">
                    <Flex gap="size-200" alignItems="center">
                        <AlertCircle color="positive" />
                        <View flex>
                            <Text><strong>Ready to proceed</strong></Text>
                            <Text UNSAFE_className="text-sm">
                                Project: {state.adobeProject.title} | Workspace: {state.adobeWorkspace.title || state.adobeWorkspace.name}
                            </Text>
                        </View>
                    </Flex>
                </Well>
            )}
        </div>
    );
}