import React, { useEffect, useState } from 'react';
import { Provider, defaultTheme, View } from '@adobe/react-spectrum';
import { WelcomeScreen } from './welcome/WelcomeScreen';
import { vscode } from './app/vscodeApi';
import { cn } from './utils/classNames';

export function WelcomeApp() {
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');

    useEffect(() => {
        // Apply VSCode theme class to body
        document.body.classList.add('vscode-dark');
        
        // Listen for initialization from extension
        const unsubscribe = vscode.onMessage('init', (data) => {
            if (data.theme) {
                setTheme(data.theme);
                // Update body class based on theme
                document.body.classList.remove('vscode-light', 'vscode-dark');
                document.body.classList.add(data.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
            }
        });

        // Listen for theme changes
        const unsubscribeTheme = vscode.onMessage('theme-changed', (data) => {
            setTheme(data.theme);
            // Update body class based on theme
            document.body.classList.remove('vscode-light', 'vscode-dark');
            document.body.classList.add(data.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
        });

        return () => {
            unsubscribe();
            unsubscribeTheme();
        };
    }, []);

    return (
        <Provider 
            theme={defaultTheme} 
            colorScheme={theme}
            isQuiet
            UNSAFE_className="app-container"
        >
            <WelcomeScreen theme={theme} />
        </Provider>
    );
}