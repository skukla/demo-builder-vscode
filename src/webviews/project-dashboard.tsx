import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectDashboardScreen } from './project-dashboard/ProjectDashboardScreen';
import { vscode } from './app/vscodeApi';
import { ThemeMode } from './types';
import './styles/index.css';
import './styles/vscode-theme.css';
import './styles/wizard.css';
import './styles/custom-spectrum.css';

function ProjectDashboardApp() {
    const [theme, setTheme] = useState<ThemeMode>('light');
    const [isReady, setIsReady] = useState(false);
    const [projectData, setProjectData] = useState<any>(null);

    useEffect(() => {
        // Apply VSCode theme class to body
        document.body.classList.add('vscode-dark');
        
        // Listen for initialization from extension
        const unsubscribe = vscode.onMessage('init', (data) => {
            if (data.theme) {
                setTheme(data.theme);
                document.body.classList.remove('vscode-light', 'vscode-dark');
                document.body.classList.add(data.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
            }
            if (data.project) {
                setProjectData(data.project);
            }
            setIsReady(true);
        });

        // Listen for theme changes
        const unsubscribeTheme = vscode.onMessage('theme-changed', (data) => {
            setTheme(data.theme);
            document.body.classList.remove('vscode-light', 'vscode-dark');
            document.body.classList.add(data.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
        });

        // Request initialization
        vscode.postMessage('ready');

        return () => {
            unsubscribe();
            unsubscribeTheme();
        };
    }, []);

    // Note: Loading state is now handled by setLoadingState() in the backend
    // We show content immediately once React is initialized
    if (!isReady) {
        // This should be very brief - just until init message arrives
        return null;
    }

    return (
        <Provider 
            theme={defaultTheme} 
            colorScheme={theme}
            isQuiet
            UNSAFE_className="app-container"
        >
            <ProjectDashboardScreen project={projectData} />
        </Provider>
    );
}

// Get root element
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

// Create React root and render app
const root = createRoot(container);
root.render(
    <React.StrictMode>
        <ProjectDashboardApp />
    </React.StrictMode>
);

