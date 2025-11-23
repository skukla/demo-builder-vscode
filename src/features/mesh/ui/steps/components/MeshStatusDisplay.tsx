import React from 'react';
import { Flex, Text, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
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
            <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                <Flex direction="column" gap="size-200" alignItems="center">
                    {isError ? (
                        <>
                            <AlertCircle size="L" UNSAFE_className="text-orange-600" />
                            <Flex direction="column" gap="size-100" alignItems="center">
                                <Text UNSAFE_className="text-xl font-medium">Mesh in Error State</Text>
                                <Text UNSAFE_className="text-sm text-gray-600 text-center" UNSAFE_style={{ maxWidth: '500px' }}>
                                    An API Mesh exists but is not functioning properly.
                                    Click "Recreate Mesh" below to delete and redeploy it.
                                </Text>
                            </Flex>
                        </>
                    ) : (
                        <>
                            <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                            <Flex direction="column" gap="size-100" alignItems="center">
                                <Text UNSAFE_className="text-xl font-medium">
                                    API Mesh {meshData.status === 'deployed' ? 'Deployed' : 'Found'}
                                </Text>
                                <Text UNSAFE_className="text-sm text-gray-600">
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
            </Flex>
        </FadeTransition>
    );
}
