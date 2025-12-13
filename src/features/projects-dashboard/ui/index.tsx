/**
 * Projects Dashboard Webview Entry Point
 *
 * Entry point for the Projects Dashboard webview.
 * Renders the main dashboard with project cards.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { WebviewApp } from '@/core/ui/components/WebviewApp';
import { ProjectsDashboard } from './ProjectsDashboard';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { Project } from '@/types/base';

// Import global styles
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/custom-spectrum.css';

/**
 * ProjectsDashboardApp - Wrapper component that handles data fetching
 */
const ProjectsDashboardApp: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [initialViewMode, setInitialViewMode] = useState<'cards' | 'rows'>('cards');
    // Track whether initial fetch was triggered (prevent StrictMode double-fetch)
    const initialFetchTriggeredRef = useRef(false);

    // Fetch projects (reusable for initial load and refresh)
    const fetchProjects = useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const response = await webviewClient.request<{
                success: boolean;
                data?: { projects: Project[]; projectsViewMode?: 'cards' | 'rows' };
            }>('getProjects');

            let projectList: Project[] = [];

            if (response?.success && response.data?.projects) {
                projectList = response.data.projects;
                // View mode comes from backend (includes session override if set)
                if (response.data.projectsViewMode) {
                    setInitialViewMode(response.data.projectsViewMode);
                }
            }

            setProjects(projectList);
            setHasLoadedOnce(true);
        } catch (error) {
            console.error('Failed to fetch projects:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    // Fetch projects on mount and listen for messages
    useEffect(() => {
        // Guard against StrictMode double-fetch (only fetch once)
        if (!initialFetchTriggeredRef.current) {
            initialFetchTriggeredRef.current = true;
            fetchProjects(false);
        }

        // Subscribe to configuration changes (live updates from VS Code settings)
        // Note: Session overrides are handled on the backend, so we can apply config changes here
        // The backend will continue to return the session override until it's cleared
        const unsubscribeConfig = webviewClient.onMessage('configChanged', (data) => {
            const configData = data as { projectsViewMode?: 'cards' | 'rows' } | undefined;
            if (configData?.projectsViewMode) {
                // Re-fetch to get the proper view mode (backend handles override logic)
                fetchProjects(true);
            }
        });

        // Subscribe to project updates
        const unsubscribeProjects = webviewClient.onMessage('projectsUpdated', (data) => {
            const typedData = data as { projects?: Project[] } | undefined;
            if (typedData?.projects) {
                setProjects(typedData.projects);
            }
        });

        return () => {
            unsubscribeConfig();
            unsubscribeProjects();
        };
    }, [fetchProjects]);

    // Handle refresh
    const handleRefresh = useCallback(() => {
        fetchProjects(true);
    }, [fetchProjects]);

    // Handle project selection
    const handleSelectProject = useCallback(async (project: Project) => {
        try {
            await webviewClient.postMessage('selectProject', {
                projectPath: project.path,
            });
            // Navigation to project detail will be handled by extension
        } catch (error) {
            console.error('Failed to select project:', error);
        }
    }, []);

    // Handle create project
    const handleCreateProject = useCallback(async () => {
        try {
            await webviewClient.postMessage('createProject');
            // Wizard will open, handled by extension
        } catch (error) {
            console.error('Failed to create project:', error);
        }
    }, []);

    // Handle copy from existing project
    const handleCopyFromExisting = useCallback(async () => {
        try {
            await webviewClient.postMessage('copyFromExisting');
            // QuickPick will show, then wizard opens - handled by extension
        } catch (error) {
            console.error('Failed to copy from existing:', error);
        }
    }, []);

    // Handle import from file
    const handleImportFromFile = useCallback(async () => {
        try {
            await webviewClient.postMessage('importFromFile');
            // File picker will show, then wizard opens - handled by extension
        } catch (error) {
            console.error('Failed to import from file:', error);
        }
    }, []);

    // Handle export project settings
    const handleExportProject = useCallback(async (project: Project) => {
        try {
            await webviewClient.postMessage('exportProject', {
                projectPath: project.path,
            });
            // Save dialog will show - handled by extension
        } catch (error) {
            console.error('Failed to export project:', error);
        }
    }, []);

    // Handle delete project
    const handleDeleteProject = useCallback(async (project: Project) => {
        try {
            const response = await webviewClient.request<{
                success: boolean;
                data?: { success: boolean; error?: string };
            }>('deleteProject', {
                projectPath: project.path,
            });

            // Refresh projects list if deletion was successful
            if (response?.success && response.data?.success) {
                fetchProjects(true);
            }
        } catch (error) {
            console.error('Failed to delete project:', error);
        }
    }, [fetchProjects]);

    // Handle view mode override - saves to backend for session persistence
    const handleViewModeOverride = useCallback((mode: 'cards' | 'rows') => {
        setInitialViewMode(mode);
        // Persist to backend so it survives webview recreations
        webviewClient.postMessage('setViewModeOverride', { viewMode: mode });
    }, []);

    return (
        <ProjectsDashboard
            projects={projects}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
            onCopyFromExisting={handleCopyFromExisting}
            onImportFromFile={handleImportFromFile}
            onExportProject={handleExportProject}
            onDeleteProject={handleDeleteProject}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            hasLoadedOnce={hasLoadedOnce}
            initialViewMode={initialViewMode}
            onViewModeOverride={handleViewModeOverride}
        />
    );
};

// Mount the app
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <WebviewApp>
            <ProjectsDashboardApp />
        </WebviewApp>
    </React.StrictMode>
);
