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
                data?: { projects: Project[] };
            }>('getProjects');
            if (response?.success && response.data?.projects) {
                setProjects(response.data.projects);
                setHasLoadedOnce(true);
            }
        } catch (error) {
            console.error('Failed to fetch projects:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    // Fetch projects on mount
    useEffect(() => {
        // Guard against StrictMode double-fetch (only fetch once)
        if (!initialFetchTriggeredRef.current) {
            initialFetchTriggeredRef.current = true;
            fetchProjects(false);
        }

        // Subscribe to project updates
        const unsubscribe = webviewClient.onMessage('projectsUpdated', (data) => {
            const typedData = data as { projects?: Project[] } | undefined;
            if (typedData?.projects) {
                setProjects(typedData.projects);
            }
        });

        return () => {
            unsubscribe();
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

    // Handle open documentation
    const handleOpenDocs = useCallback(async () => {
        try {
            await webviewClient.postMessage('openDocs');
        } catch (error) {
            console.error('Failed to open docs:', error);
        }
    }, []);

    // Handle open help
    const handleOpenHelp = useCallback(async () => {
        try {
            await webviewClient.postMessage('openHelp');
        } catch (error) {
            console.error('Failed to open help:', error);
        }
    }, []);

    // Handle open settings
    const handleOpenSettings = useCallback(async () => {
        try {
            await webviewClient.postMessage('openSettings');
        } catch (error) {
            console.error('Failed to open settings:', error);
        }
    }, []);

    return (
        <ProjectsDashboard
            projects={projects}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            hasLoadedOnce={hasLoadedOnce}
            onOpenDocs={handleOpenDocs}
            onOpenHelp={handleOpenHelp}
            onOpenSettings={handleOpenSettings}
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
