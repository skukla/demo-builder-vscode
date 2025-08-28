import React, { useEffect, useState } from 'react';
import { Provider, defaultTheme, View } from '@adobe/react-spectrum';
import { WelcomeScreen } from './welcome/WelcomeScreen';
import { vscode } from './app/vscodeApi';

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
            UNSAFE_style={{ 
                width: '100%', 
                height: '100vh',
                margin: 0,
                padding: 0,
                background: 'var(--vscode-editor-background)'
            }}
        >
            <WelcomeScreen theme={theme} />
        </Provider>
    );
}