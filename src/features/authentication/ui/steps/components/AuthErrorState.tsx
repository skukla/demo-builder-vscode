import React from 'react';
import { Flex, Text, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import { FadeTransition } from '@/core/ui/components/ui/FadeTransition';

interface AuthErrorStateProps {
    error: string;
    onRetry: () => void;
    onBack: () => void;
}

export function AuthErrorState({ error, onRetry, onBack }: AuthErrorStateProps) {
    return (
        <FadeTransition show={true}>
            <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                <Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
                    <AlertCircle size="L" UNSAFE_className="text-red-600" />
                    <Flex direction="column" gap="size-100" alignItems="center">
                        <Text UNSAFE_className="text-xl font-medium">Authentication Failed</Text>
                        <Text UNSAFE_className="text-sm text-gray-600">{error}</Text>
                    </Flex>

                    <Flex gap="size-150" marginTop="size-300">
                        <Button variant="accent" onPress={onRetry}>Retry</Button>
                        <Button variant="secondary" onPress={onBack}>Back</Button>
                    </Flex>
                </Flex>
            </Flex>
        </FadeTransition>
    );
}
