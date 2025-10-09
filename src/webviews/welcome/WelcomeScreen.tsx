import React, { useEffect } from 'react';
import {
    View,
    Flex,
    Heading,
    Text,
    Grid,
    Divider,
    ActionButton,
    Button,
    DialogTrigger,
    Dialog,
    Content,
    ButtonGroup,
    AlertDialog,
    Well
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import FolderOpen from '@spectrum-icons/workflow/FolderOpen';
import Book from '@spectrum-icons/workflow/Book';
import Settings from '@spectrum-icons/workflow/Settings';
import Star from '@spectrum-icons/workflow/Star';
import { vscode } from '../app/vscodeApi';
import { cn } from '../utils/classNames';

interface WelcomeScreenProps {
    theme?: 'light' | 'dark';
}

export function WelcomeScreen({ theme = 'dark' }: WelcomeScreenProps) {
    useEffect(() => {
        // Request initialization
        vscode.postMessage('ready');
    }, []);

    const handleCreateNew = () => {
        console.log('handleCreateNew called');
        console.log('Sending create-new message');
        vscode.postMessage('create-new');
    };

    const handleOpenExisting = () => {
        vscode.postMessage('open-project');
    };

    const handleOpenDocs = () => {
        vscode.postMessage('open-docs');
    };

    const handleOpenSettings = () => {
        vscode.postMessage('open-settings');
    };

    // Focus trap for Tab navigation — matches wizard implementation
    useEffect(() => {
        const selector = 'button:not([disabled]):not([tabindex="-1"]), ' +
            'input:not([disabled]):not([tabindex="-1"]), ' +
            'select:not([disabled]):not([tabindex="-1"]), ' +
            'textarea:not([disabled]):not([tabindex="-1"]), ' +
            '[tabindex]:not([tabindex="-1"]):not([tabindex="0"])';

        const focusDefaultElement = () => {
            // Focus first element (autoFocus on Create button handles initial focus)
            const focusableElements = document.querySelectorAll(selector);
            if (focusableElements.length > 0) {
                const first = focusableElements[0] as HTMLElement;
                if (document.activeElement === document.body || !document.activeElement) {
                    first.focus();
                }
            }
        };

        // Ensure focus starts inside the webview
        const focusTimeout = window.setTimeout(focusDefaultElement, 0);
        window.addEventListener('focus', focusDefaultElement);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Tab') {
                const focusableElements = document.querySelectorAll(selector);

                const focusableArray = Array.from(focusableElements) as HTMLElement[];
                if (focusableArray.length === 0) {
                    return;
                }

                const currentIndex = focusableArray.indexOf(document.activeElement as HTMLElement);

                e.preventDefault();

                if (e.shiftKey) {
                    const nextIndex = currentIndex <= 0 ? focusableArray.length - 1 : currentIndex - 1;
                    focusableArray[nextIndex].focus();
                } else {
                    const nextIndex = currentIndex >= focusableArray.length - 1 ? 0 : currentIndex + 1;
                    focusableArray[nextIndex].focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.clearTimeout(focusTimeout);
            window.removeEventListener('focus', focusDefaultElement);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    // Main welcome screen
    return (
        <View height="100vh" backgroundColor="gray-50">
            <Flex direction="column" alignItems="center" justifyContent="center" height="100%">
                <View width="100%" maxWidth="900px" padding="size-400">
                    {/* Header */}
                    <View marginBottom="size-400">
                        <Flex justifyContent="space-between" alignItems="center">
                            <View>
                                <Heading level={1} UNSAFE_className={cn('text-3xl', 'mb-2')}>
                                    Adobe Demo Builder
                                </Heading>
                                <Text UNSAFE_className={cn('text-md', 'text-gray-600')}>
                                    Create and manage Adobe Commerce demo environments
                                </Text>
                            </View>
                            <Flex gap="size-100">
                                <ActionButton isQuiet onPress={handleOpenDocs} height="32px">
                                    <Book size="S" />
                                    <Text>Docs</Text>
                                </ActionButton>
                                <ActionButton isQuiet onPress={handleOpenSettings} height="32px">
                                    <Settings size="S" />
                                    <Text>Settings</Text>
                                </ActionButton>
                            </Flex>
                        </Flex>
                    </View>

                    <Divider size="S" marginBottom="size-400" />

                    {/* Main Actions */}
                    <Grid
                        columns={['1fr', '1fr']}
                        gap="size-300"
                    >
                        {/* Create New Project Card */}
                        <ActionButton
                            onPress={handleCreateNew}
                            isQuiet
                            UNSAFE_className="welcome-action-card"
                            autoFocus
                        >
                            <View UNSAFE_className={cn('mb-5', 'scale-180')}>
                                <Add size="L" UNSAFE_className="text-blue-600" />
                            </View>
                            <Heading level={3} UNSAFE_className={cn('mb-2', 'text-2xl')}>
                                Create New Project
                            </Heading>
                            <Text UNSAFE_className={cn('text-15', 'text-gray-700')}>
                                Set up a new demo environment
                            </Text>
                        </ActionButton>

                        {/* Open Existing Project Card */}
                        <ActionButton
                            onPress={handleOpenExisting}
                            isQuiet
                            UNSAFE_className="welcome-action-card"
                        >
                            <View UNSAFE_className={cn('mb-5', 'scale-180')}>
                                <FolderOpen size="L" UNSAFE_className="text-gray-700" />
                            </View>
                            <Heading level={3} UNSAFE_className={cn('mb-2', 'text-2xl')}>
                                Open Existing Project
                            </Heading>
                            <Text UNSAFE_className={cn('text-15', 'text-gray-700')}>
                                Continue working on a demo
                            </Text>
                        </ActionButton>
                    </Grid>
                </View>
            </Flex>
        </View>
    );
}