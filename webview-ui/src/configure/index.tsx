import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigureScreen } from './ConfigureScreen';
import { vscode } from '../wizard/app/vscodeApi';
import { ThemeMode } from '../shared/types';
import '../shared/styles/index.css';
import '../shared/styles/vscode-theme.css';
import '../shared/styles/wizard.css';
import '../shared/styles/custom-spectrum.css';

function ConfigureApp() {
    const [theme, setTheme] = useState<ThemeMode>('light');
    const [isReady, setIsReady] = useState(false);
    const [projectData, setProjectData] = useState<any>(null);
    const [componentsData, setComponentsData] = useState<any>(null);
    const [existingEnvValues, setExistingEnvValues] = useState<any>(null);

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
            if (data.componentsData) {
                setComponentsData(data.componentsData);
            }
            if (data.existingEnvValues) {
                setExistingEnvValues(data.existingEnvValues);
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

    if (!isReady || !projectData || !componentsData) {
        return null;
    }

    return (
        <Provider 
            theme={defaultTheme} 
            colorScheme={theme}
            isQuiet
            UNSAFE_className="app-container"
        >
            <ConfigureScreen 
                project={projectData} 
                componentsData={componentsData}
                existingEnvValues={existingEnvValues}
            />
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
        <ConfigureApp />
    </React.StrictMode>
);

