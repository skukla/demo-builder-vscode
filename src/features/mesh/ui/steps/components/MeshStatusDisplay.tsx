import { Flex, Text, Button } from '@/core/ui/components/aria';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { FadeTransition } from '@/core/ui/components/ui/FadeTransition';

interface MeshData {
    meshId?: string;
    status?: string;
    endpoint?: string;
}

interface MeshStatusDisplayProps {
    meshData: MeshData;
    onRecreateMesh: () => void;
    onBack: () => void;
}

export function MeshStatusDisplay({ meshData, onRecreateMesh, onBack }: MeshStatusDisplayProps) {
    const isError = meshData.status === 'error';

    return (
        <FadeTransition show={true}>
            <CenteredFeedbackContainer>
                <Flex direction="column" gap="size-200" alignItems="center">
                    {isError ? (
                        <>
                            <AlertCircle size="L" className="text-orange-600" />
                            <Flex direction="column" gap="size-100" alignItems="center">
                                <Text className="text-xl font-medium">Mesh in Error State</Text>
                                <Text className="text-sm text-gray-600 text-center-max-500">
                                    An API Mesh exists but is not functioning properly.
                                    Click "Recreate Mesh" below to delete and redeploy it.
                                </Text>
                            </Flex>
                        </>
                    ) : (
                        <>
                            <CheckmarkCircle size="L" className="text-green-600" />
                            <Flex direction="column" gap="size-100" alignItems="center">
                                <Text className="text-xl font-medium">
                                    API Mesh {meshData.status === 'deployed' ? 'Deployed' : 'Found'}
                                </Text>
                                <Text className="text-sm text-gray-600">
                                    An existing mesh was detected. It will be updated during deployment.
                                </Text>
                            </Flex>
                        </>
                    )}

                    {isError && (
                        <Flex gap="size-150" marginTop="size-300">
                            <Button variant="accent" onPress={onRecreateMesh}>Recreate Mesh</Button>
                            <Button variant="secondary" onPress={onBack}>Back</Button>
                        </Flex>
                    )}
                </Flex>
            </CenteredFeedbackContainer>
        </FadeTransition>
    );
}
