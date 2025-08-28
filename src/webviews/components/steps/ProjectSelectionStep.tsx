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
    Content,
    ActionButton,
    Badge
} from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import Folder from '@spectrum-icons/workflow/Folder';
import Building from '@spectrum-icons/workflow/Building';
import { WizardState } from '../../types';
import { vscode } from '../../app/vscodeApi';

interface Project {
    id: string;
    name: string;
    title: string;
    description?: string;
    type?: string;
}

interface ProjectSelectionStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function ProjectSelectionStep({ state, updateState, setCanProceed }: ProjectSelectionStepProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(state.adobeProject?.id || null);

    useEffect(() => {
        // Request projects when component mounts and org is selected
        if (state.adobeOrg?.id) {
            loadProjects();
        }

        // Listen for projects from extension
        const unsubscribe = vscode.onMessage('projects', (data) => {
            if (Array.isArray(data)) {
                setProjects(data);
                setError(null);
                
                // Auto-select if only one project
                if (data.length === 1) {
                    selectProject(data[0]);
                }
            } else {
                setError('Failed to load projects');
            }
            setIsLoading(false);
        });

        return unsubscribe;
    }, [state.adobeOrg]);

    useEffect(() => {
        // Can proceed if a project is selected
        setCanProceed(!!state.adobeProject?.id);
    }, [state.adobeProject, setCanProceed]);

    const loadProjects = () => {
        if (!state.adobeOrg?.id) return;
        
        setIsLoading(true);
        setError(null);
        vscode.requestProjects(state.adobeOrg.id);
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
    };

    // Filter projects based on search query
    const filteredProjects = useMemo(() => {
        if (!searchQuery.trim()) {
            return projects;
        }
        
        const query = searchQuery.toLowerCase();
        return projects.filter(project => 
            project.title.toLowerCase().includes(query) ||
            project.name.toLowerCase().includes(query) ||
            (project.description?.toLowerCase().includes(query) || false)
        );
    }, [projects, searchQuery]);

    if (isLoading) {
        return (
            <View padding="size-400" maxWidth="size-6000">
                <Heading level={2} marginBottom="size-300">
                    Select Project
                </Heading>
                <Flex gap="size-200" alignItems="center">
                    <ProgressCircle size="S" isIndeterminate />
                    <Text>Loading projects...</Text>
                </Flex>
            </View>
        );
    }

    if (error) {
        return (
            <View padding="size-400" maxWidth="size-6000">
                <Heading level={2} marginBottom="size-300">
                    Select Project
                </Heading>
                <Well>
                    <Flex gap="size-200" alignItems="center">
                        <AlertCircle color="negative" />
                        <View flex>
                            <Text><strong>Error Loading Projects</strong></Text>
                            <Text elementType="small" color="gray-700">{error}</Text>
                        </View>
                    </Flex>
                </Well>
                <Button variant="secondary" onPress={loadProjects} marginTop="size-200">
                    Retry
                </Button>
            </View>
        );
    }

    return (
        <View padding="size-400" maxWidth="size-6000">
            <Heading level={2} marginBottom="size-300">
                Select Project
            </Heading>
            
            <Text marginBottom="size-400">
                Choose the Adobe project where your demo will be deployed.
            </Text>

            {/* Current Organization */}
            {state.adobeOrg && (
                <Well marginBottom="size-300">
                    <Flex gap="size-200" alignItems="center">
                        <Building />
                        <View>
                            <Text elementType="small" color="gray-700">Organization</Text>
                            <Text><strong>{state.adobeOrg.name}</strong></Text>
                        </View>
                    </Flex>
                </Well>
            )}

            {projects.length > 0 ? (
                <>
                    {/* Search Field */}
                    <SearchField
                        label="Search projects"
                        placeholder="Type to filter projects..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        width="100%"
                        marginBottom="size-200"
                    />

                    {/* Results count */}
                    <Flex justifyContent="space-between" marginBottom="size-100">
                        <Text elementType="small" color="gray-700">
                            {filteredProjects.length === projects.length 
                                ? `${projects.length} projects available`
                                : `Showing ${filteredProjects.length} of ${projects.length} projects`
                            }
                        </Text>
                        {searchQuery && (
                            <ActionButton 
                                isQuiet 
                                onPress={() => setSearchQuery('')}
                            >
                                Clear search
                            </ActionButton>
                        )}
                    </Flex>

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
                            height="size-3600"
                            width="100%"
                            marginBottom="size-300"
                        >
                            {(item) => (
                                <Item key={item.id} textValue={item.title}>
                                    <Folder />
                                    <Text>{item.title}</Text>
                                    <Text slot="description" elementType="small">
                                        {item.description || item.name}
                                    </Text>
                                    {selectedProjectId === item.id && (
                                        <Badge variant="info" marginStart="auto">
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
                                <Text>
                                    No projects found matching "{searchQuery}". Try a different search term.
                                </Text>
                            </Flex>
                        </Well>
                    )}

                    {/* Selected Project Display */}
                    {state.adobeProject && (
                        <Well backgroundColor="blue-100">
                            <Flex gap="size-200" alignItems="center">
                                <Folder />
                                <Content>
                                    <Text>
                                        <strong>Selected:</strong> {state.adobeProject.title}
                                    </Text>
                                    {state.adobeProject.description && (
                                        <Text elementType="small" color="gray-700">
                                            {state.adobeProject.description}
                                        </Text>
                                    )}
                                </Content>
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
    );
}