import React, { useEffect, useCallback } from 'react';
import {
    View,
    Flex,
    Heading,
    Text,
    Grid,
    Divider,
    ActionButton
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import FolderOpen from '@spectrum-icons/workflow/FolderOpen';
import Book from '@spectrum-icons/workflow/Book';
import Settings from '@spectrum-icons/workflow/Settings';
import { vscode } from '@/core/ui/vscode-api';
import { useFocusTrap } from '@/webview-ui/shared/hooks';
import { cn } from '@/webview-ui/shared/utils/classNames';

interface WelcomeScreenProps {
    theme?: 'light' | 'dark';
}

export function WelcomeScreen({ theme = 'dark' }: WelcomeScreenProps) {
    const containerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: true
    });

    useEffect(() => {
        vscode.postMessage('ready');
    }, []);

    // Action handlers with useCallback
    const handleCreateNew = useCallback(() => {
        vscode.postMessage('create-new');
    }, []);

    const handleOpenExisting = useCallback(() => {
        vscode.postMessage('open-project');
    }, []);

    const handleOpenDocs = useCallback(() => {
        vscode.postMessage('open-docs');
    }, []);

    const handleOpenSettings = useCallback(() => {
        vscode.postMessage('open-settings');
    }, []);

    return (
        <View height="100vh" backgroundColor="gray-50">
            <Flex direction="column" alignItems="center" justifyContent="center" height="100%">
                <View ref={containerRef} width="100%" maxWidth="900px" padding="size-400">
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
