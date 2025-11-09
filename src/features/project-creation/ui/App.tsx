import { Provider, defaultTheme, View } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { WizardContainer } from './wizard/WizardContainer';
import { ThemeMode, ComponentSelection } from '@/types/webview';
import { vscode } from '@/core/ui/utils/vscode-api';

interface WizardStepConfig {
    id: string;
    name: string;
    enabled: boolean;
}

interface InitMessageData {
    theme?: ThemeMode;
    componentDefaults?: ComponentSelection;
    wizardSteps?: WizardStepConfig[];
}

interface ThemeChangedMessageData {
    theme: ThemeMode;
}

export function App() {
    const [theme, setTheme] = useState<ThemeMode>('dark');
    const [isReady, setIsReady] = useState(false);
    const [componentDefaults, setComponentDefaults] = useState<ComponentSelection | null>(null);
    const [wizardSteps, setWizardSteps] = useState<WizardStepConfig[] | null>(null);

    useEffect(() => {
        console.log('App mounted, setting up message listeners');
        
        // Apply VSCode theme class to body
        document.body.classList.add('vscode-dark');
        
        // Listen for initialization from extension
        const unsubscribe = vscode.onMessage('init', (data: unknown) => {
            const initData = data as InitMessageData;
            console.log('Received init message:', initData);
            if (initData.theme) {
                setTheme(initData.theme);
                // Update body class based on theme
                document.body.classList.remove('vscode-light', 'vscode-dark');
                document.body.classList.add(initData.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
            }
            if (initData.componentDefaults) {
                setComponentDefaults(initData.componentDefaults);
            }
            if (initData.wizardSteps) {
                setWizardSteps(initData.wizardSteps);
                console.log('Loaded wizard steps from configuration:', initData.wizardSteps);
            }
            setIsReady(true);
        });

        // Listen for theme changes
        const unsubscribeTheme = vscode.onMessage('theme-changed', (data: unknown) => {
            const themeData = data as ThemeChangedMessageData;
            console.log('Received theme change:', themeData);
            setTheme(themeData.theme);
            // Update body class based on theme
            document.body.classList.remove('vscode-light', 'vscode-dark');
            document.body.classList.add(themeData.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
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
            <WizardContainer
                componentDefaults={componentDefaults ?? undefined}
                wizardSteps={wizardSteps ?? undefined}
            />
        </Provider>
    );
}