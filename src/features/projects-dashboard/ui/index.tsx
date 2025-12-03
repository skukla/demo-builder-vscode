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

// Mock data for layout prototyping
// When true: loads real projects AND adds mock projects for scale testing
const USE_MOCK_DATA = true;

const MOCK_PROJECTS: Project[] = [
    {
        name: 'acme-storefront',
        path: '/Users/demo/projects/acme-storefront',
        status: 'stopped',
    },
    {
        name: 'test-project',
        path: '/Users/demo/projects/test-project',
        status: 'stopped',
    },
    {
        name: 'client-demo-march',
        path: '/Users/demo/projects/client-demo-march',
        status: 'running',
        componentInstances: {
            frontend: { id: 'citisignal', status: 'running', port: 3001 },
        },
    },
    {
        name: 'edge-delivery-poc',
        path: '/Users/demo/projects/edge-delivery-poc',
        status: 'error',
    },
    {
        name: 'summit-2025-demo',
        path: '/Users/demo/projects/summit-2025-demo',
        status: 'stopped',
    },
    {
        name: 'partner-integration',
        path: '/Users/demo/projects/partner-integration',
        status: 'running',
        componentInstances: {
            frontend: { id: 'citisignal', status: 'running', port: 3002 },
        },
    },
    {
        name: 'sandbox-testing',
        path: '/Users/demo/projects/sandbox-testing',
        status: 'stopped',
    },
    {
        name: 'headless-commerce-v2',
        path: '/Users/demo/projects/headless-commerce-v2',
        status: 'stopped',
    },
    {
        name: 'mobile-app-backend',
        path: '/Users/demo/projects/mobile-app-backend',
        status: 'starting',
    },
    {
        name: 'analytics-dashboard',
        path: '/Users/demo/projects/analytics-dashboard',
        status: 'stopped',
    },
    {
        name: 'customer-portal',
        path: '/Users/demo/projects/customer-portal',
        status: 'running',
        componentInstances: {
            frontend: { id: 'citisignal', status: 'running', port: 3003 },
        },
    },
    {
        name: 'b2b-marketplace',
        path: '/Users/demo/projects/b2b-marketplace',
        status: 'stopped',
    },
    {
        name: 'loyalty-program',
        path: '/Users/demo/projects/loyalty-program',
        status: 'error',
    },
    {
        name: 'inventory-sync',
        path: '/Users/demo/projects/inventory-sync',
        status: 'stopped',
    },
    {
        name: 'checkout-optimization',
        path: '/Users/demo/projects/checkout-optimization',
        status: 'stopped',
    },
];

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

            let projectList: Project[] = [];

            if (response?.success && response.data?.projects) {
                projectList = response.data.projects;
            }

            // Add mock projects for scale testing (real projects come first)
            if (USE_MOCK_DATA) {
                projectList = [...projectList, ...MOCK_PROJECTS];
            }

            setProjects(projectList);
            setHasLoadedOnce(true);
        } catch (error) {
            console.error('Failed to fetch projects:', error);
            // Still show mock data if real fetch fails
            if (USE_MOCK_DATA) {
                setProjects(MOCK_PROJECTS);
                setHasLoadedOnce(true);
            }
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
