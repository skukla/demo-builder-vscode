import React, { useEffect, useState } from 'react';
import { Provider, defaultTheme, View } from '@adobe/react-spectrum';
import { WizardContainer } from '../components/wizard/WizardContainer';
import { vscode } from './vscodeApi';
import { ThemeMode } from '../types';
import { cn } from '../utils/classNames';

export function App() {
    const [theme, setTheme] = useState<ThemeMode>('light');
    const [isReady, setIsReady] = useState(false);
    const [componentDefaults, setComponentDefaults] = useState<any>(null);

    useEffect(() => {
        console.log('App mounted, setting up message listeners');
        
        // Apply VSCode theme class to body
        document.body.classList.add('vscode-dark');
        
        // Listen for initialization from extension
        const unsubscribe = vscode.onMessage('init', (data) => {
            console.log('Received init message:', data);
            if (data.theme) {
                setTheme(data.theme);
                // Update body class based on theme
                document.body.classList.remove('vscode-light', 'vscode-dark');
                document.body.classList.add(data.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
            }
            if (data.componentDefaults) {
                setComponentDefaults(data.componentDefaults);
            }
            setIsReady(true);
        });

        // Listen for theme changes
        const unsubscribeTheme = vscode.onMessage('theme-changed', (data) => {
            console.log('Received theme change:', data);
            setTheme(data.theme);
            // Update body class based on theme
            document.body.classList.remove('vscode-light', 'vscode-dark');
            document.body.classList.add(data.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
        });

        // Request initialization
        console.log('Sending ready message to extension');
        vscode.postMessage('ready');

        return () => {
            unsubscribe();
            unsubscribeTheme();
        };
    }, []);

    if (!isReady) {
        return (
            <View padding="size-400">
                <div>Initializing...</div>
            </View>
        );
    }

    return (
        <Provider 
            theme={defaultTheme} 
            colorScheme={theme}
            isQuiet // Enable quiet mode globally for minimal appearance
            UNSAFE_className="app-container"
        >
            <WizardContainer componentDefaults={componentDefaults} />
        </Provider>
    );
}