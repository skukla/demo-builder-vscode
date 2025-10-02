import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    View, 
    Heading, 
    ListView, 
    Item, 
    Text, 
    SearchField,
    Button,
    Well,
    Flex
} from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import { vscode } from '../../app/vscodeApi';
import { LoadingDisplay } from '../shared/LoadingDisplay';
import { ConfigurationSummary } from '../shared/ConfigurationSummary';
import { WizardState, Project, AdobeOrg, WizardStep } from '../../types';
import { useDebouncedLoading } from '../../utils/useDebouncedLoading';

interface AdobeProjectStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    completedSteps?: WizardStep[];
}

export function AdobeProjectStep({ state, updateState, setCanProceed, completedSteps = [] }: AdobeProjectStepProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState(state.projectSearchFilter || '');
    
    // Debounce loading state: only show loading UI if operation takes >300ms
    // This prevents flash of loading state for fast SDK operations
    const showLoading = useDebouncedLoading(isLoadingProjects);

    useEffect(() => {
        // Always load projects since organization is set during authentication
        loadProjects();
    }, []);

    // Save search query to wizard state for persistence across navigation and reloads
    useEffect(() => {
        updateState({ projectSearchFilter: searchQuery });
    }, [searchQuery, updateState]);

    useEffect(() => {
        setCanProceed(!!state.adobeProject?.id);
    }, [state.adobeProject, setCanProceed]);

    
    // Listen for projects from extension
    useEffect(() => {
        const unsubscribeProjects = vscode.onMessage('projects', (data) => {
            if (Array.isArray(data)) {
                setProjects(data);
                setIsLoadingProjects(false);
                setError(null);

                // Auto-select if only one project
                if (data.length === 1 && !state.adobeProject?.id) {
                    selectProject(data[0]);
                }
            } else if (data && data.error) {
                setError(data.error);
                setIsLoadingProjects(false);
            }
        });

        const unsubscribeError = vscode.onMessage('project-error', (data) => {
            setError(data.error || 'Failed to load projects');
            setIsLoadingProjects(false);
        });

        return () => {
            unsubscribeProjects();
            unsubscribeError();
        };
    }, [state.adobeProject]);
    
    const loadProjects = () => {
        setIsLoadingProjects(true);
        setError(null);
        if (!state.adobeOrg?.id) {
            setError('No organization available. Please authenticate again.');
            setIsLoadingProjects(false);
            return;
        }
        vscode.postMessage('get-projects', { orgId: state.adobeOrg.id });
    };
    
    const selectProject = (project: Project) => {
        // BACKEND CALL ON CONTINUE PATTERN - UI PHASE:
        // This function provides immediate visual feedback to user selection
        // NO backend operations - those happen in WizardContainer.goNext()
        // when user clicks Continue to commit their choice

        updateState({
            adobeProject: {
                id: project.id,
                name: project.name,
                title: project.title,
                description: project.description,
                org_id: project.org_id  // Include numeric org ID for Adobe Console URLs
            },
            // Clear dependent state when parent selection changes
            // This maintains state consistency in the UI layer
            adobeWorkspace: undefined
        });
    };
    
    const filteredProjects = useMemo(() => {
        if (!searchQuery) return projects;
        const query = searchQuery.toLowerCase();
        return projects.filter(p => 
            p.title?.toLowerCase().includes(query) ||
            p.name?.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query)
        );
    }, [projects, searchQuery]);
    
    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', gap: '0' }}>
            {/* Left: Project Selection - constrained to 800px like other steps */}
            <div style={{
                maxWidth: '800px',
                width: '100%',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0  // Prevent flex shrinking issues
            }}>
                <Heading level={2} marginBottom="size-300">
                    {state.adobeOrg?.name ? `Projects in ${state.adobeOrg.name}` : 'Select Adobe Project'}
                </Heading>

                {showLoading ? (
                    <Flex justifyContent="center" alignItems="center" height="100%">
                        <LoadingDisplay
                            size="L"
                            message="Loading your Adobe projects..."
                            subMessage={state.adobeOrg?.name ? `Fetching from organization: ${state.adobeOrg.name}` : "Fetching projects..."}
                        />
                    </Flex>
                ) : error && !isLoadingProjects ? (
                    <Flex justifyContent="center" alignItems="center" height="100%">
                        <Well>
                            <Flex gap="size-200" alignItems="center">
                                <AlertCircle UNSAFE_className="text-red-600" />
                                <Flex direction="column" gap="size-50">
                                    <Text><strong>Error Loading Projects</strong></Text>
                                    <Text UNSAFE_className="text-sm">{error}</Text>
                                </Flex>
                            </Flex>
                            <Button variant="secondary" onPress={() => loadProjects()} marginTop="size-200">
                                Retry
                            </Button>
                        </Well>
                    </Flex>
                ) : projects.length === 0 ? (
                    <Well marginTop="size-200">
                        <Flex gap="size-200" alignItems="center">
                            <AlertCircle UNSAFE_className="text-yellow-600" />
                            <Flex direction="column" gap="size-50">
                                <Text><strong>No Projects Found</strong></Text>
                                <Text UNSAFE_className="text-sm">
                                    {state.adobeOrg?.name
                                        ? `No projects found in organization ${state.adobeOrg.name}. Please create a project in Adobe Console first.`
                                        : 'No projects found. Please create a project in Adobe Console first.'
                                    }
                                </Text>
                            </Flex>
                        </Flex>
                    </Well>
                ) : (
                    <>
                        {projects.length > 5 && (
                            <div style={{ position: 'relative' }}>
                                <SearchField
                                    placeholder="Type to filter projects..."
                                    value={searchQuery}
                                    onChange={setSearchQuery}
                                    marginBottom="size-200"
                                    width="100%"
                                    isQuiet
                                    autoFocus={!state.adobeProject?.id}
                                    UNSAFE_className="search-field-custom"
                                />
                                <style>{`
                                    .search-field-custom .spectrum-Textfield-input {
                                        padding-left: 40px !important;
                                    }
                                    .search-field-custom input[type="search"] {
                                        padding-left: 40px !important;
                                    }
                                    .search-field-custom .spectrum-Search-input {
                                        padding-left: 40px !important;
                                    }
                                `}</style>
                                {searchQuery && (
                                    <Text UNSAFE_className="text-sm text-gray-600" marginBottom="size-100">
                                        Showing {filteredProjects.length} of {projects.length} projects
                                    </Text>
                                )}
                            </div>
                        )}

                        <ListView
                            items={filteredProjects}
                            selectionMode="single"
                            selectedKeys={state.adobeProject?.id ? [state.adobeProject.id] : []}
                            onSelectionChange={(keys) => {
                                const projectId = Array.from(keys)[0] as string;
                                const project = projects.find(p => p.id === projectId);
                                if (project) {
                                    selectProject(project);
                                }
                            }}
                            height="100%"
                            UNSAFE_style={{ flex: 1 }}
                        >
                                    {(item) => (
                                        <Item key={item.id} textValue={item.title || item.name}>
                                            <Text>{item.title || item.name}</Text>
                                            {item.description && (
                                                <Text slot="description" UNSAFE_className="text-sm text-gray-600">
                                                    {item.description}
                                                </Text>
                                            )}
                                        </Item>
                                    )}
                        </ListView>

                        {filteredProjects.length === 0 && searchQuery && (
                            <Text UNSAFE_className="text-sm text-gray-600" marginTop="size-200">
                                No projects match "{searchQuery}"
                            </Text>
                        )}
                    </>
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