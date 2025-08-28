import React from 'react';
import {
    View,
    Flex,
    Text,
    Button,
    Content,
    IllustratedMessage,
    Heading
} from '@adobe/react-spectrum';
import FolderOpen from '@spectrum-icons/workflow/FolderOpen';
import Import from '@spectrum-icons/workflow/Import';

interface EmptyStateProps {
    onImport: () => void;
}

export function EmptyState({ onImport }: EmptyStateProps) {
    return (
        <View 
            padding="size-600" 
            UNSAFE_style={{ 
                textAlign: 'center',
                background: 'var(--vscode-sideBar-background)',
                borderRadius: '8px',
                border: '1px solid var(--vscode-widget-border)'
            }}
        >
            <IllustratedMessage>
                <FolderOpen size="XXL" />
                <Heading>No Recent Projects</Heading>
                <Content>
                    <Text>
                        You haven't opened any Demo Builder projects yet.
                        Create a new project or import an existing configuration to get started.
                    </Text>
                </Content>
            </IllustratedMessage>
            
            <Flex justifyContent="center" marginTop="size-300">
                <Button variant="secondary" onPress={onImport}>
                    <Import />
                    <Text>Import from Console</Text>
                </Button>
            </Flex>

            <View marginTop="size-400">
                <Text elementType="small" color="gray-600">
                    Tip: You can also drag and drop a console.json file onto this window to import it.
                </Text>
            </View>
        </View>
    );
}