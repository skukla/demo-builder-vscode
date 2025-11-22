import React from 'react';
import { Flex, Text } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import { FadeTransition } from '@/core/ui/components/ui/FadeTransition';

interface UserData {
    name: string;
    email: string;
    orgName?: string;
    orgId?: string;
}

interface AuthSuccessStateProps {
    userData: UserData;
}

export function AuthSuccessState({ userData }: AuthSuccessStateProps) {
    return (
        <FadeTransition show={true}>
            <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                <Flex direction="column" gap="size-200" alignItems="center">
                    <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                    <Flex direction="column" gap="size-100" alignItems="center">
                        <Text UNSAFE_className="text-xl font-medium">Successfully Authenticated</Text>
                        <Text UNSAFE_className="text-sm text-gray-600">{userData.name}</Text>
                        <Text UNSAFE_className="text-sm text-gray-600">{userData.email}</Text>
                        {userData.orgName && (
                            <Text UNSAFE_className="text-sm text-gray-600">{userData.orgName}</Text>
                        )}
                    </Flex>
                </Flex>
            </Flex>
        </FadeTransition>
    );
}
