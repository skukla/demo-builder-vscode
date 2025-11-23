import React from 'react';
import { Flex } from '@adobe/react-spectrum';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';

interface AuthLoadingStateProps {
    message: string;
    subMessage?: string;
    helperText?: string;
}

export function AuthLoadingState({ message, subMessage, helperText }: AuthLoadingStateProps) {
    return (
        <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
            <LoadingDisplay
                size="L"
                message={message}
                subMessage={subMessage}
                helperText={helperText}
            />
        </Flex>
    );
}
