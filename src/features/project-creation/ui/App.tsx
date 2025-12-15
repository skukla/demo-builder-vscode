import { Provider, defaultTheme, View } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { WizardContainer } from './wizard/WizardContainer';
import { vscode } from '@/core/ui/utils/vscode-api';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { ThemeMode, ComponentSelection } from '@/types/webview';

const log = webviewLogger('App');

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
        log.debug('App mounted, setting up message listeners');

        // Apply VSCode theme class to body
        document.body.classList.add('vscode-dark');

        // Listen for initialization from extension
        const unsubscribe = vscode.onMessage('init', (data: unknown) => {
            const initData = data as InitMessageData;
            log.debug('Received init message:', initData);
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
                log.debug('Loaded wizard steps from configuration:', initData.wizardSteps);
            }
            setIsReady(true);
        });

        // Listen for theme changes
        const unsubscribeTheme = vscode.onMessage('theme-changed', (data: unknown) => {
            const themeData = data as ThemeChangedMessageData;
            log.debug('Received theme change:', themeData);
            setTheme(themeData.theme);
            // Update body class based on theme
            document.body.classList.remove('vscode-light', 'vscode-dark');
            document.body.classList.add(themeData.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
        });

        // Request initialization
        log.debug('Sending ready message to extension');
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