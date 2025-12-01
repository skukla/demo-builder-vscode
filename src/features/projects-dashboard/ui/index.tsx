/**
 * Projects Dashboard Webview Entry Point
 *
 * Entry point for the Projects Dashboard webview.
 * Renders the main dashboard with project cards.
 */

import React, { useState, useEffect, useCallback } from 'react';
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

    // Fetch projects on mount
    useEffect(() => {
        const fetchProjects = async () => {
            setIsLoading(true);
            try {
                const response = await webviewClient.request<{
                    success: boolean;
                    data?: { projects: Project[] };
                }>('getProjects');
                if (response?.success && response.data?.projects) {
                    setProjects(response.data.projects);
                }
            } catch (error) {
                console.error('Failed to fetch projects:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchProjects();

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
    }, []);

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

    return (
        <ProjectsDashboard
            projects={projects}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
            isLoading={isLoading}
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
