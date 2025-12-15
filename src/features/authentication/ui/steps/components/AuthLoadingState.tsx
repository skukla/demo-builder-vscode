import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';

interface AuthLoadingStateProps {
    message: string;
    subMessage?: string;
    helperText?: string;
}

export function AuthLoadingState({ message, subMessage, helperText }: AuthLoadingStateProps) {
    return (
        <CenteredFeedbackContainer>
            <LoadingDisplay
                size="L"
                message={message}
                subMessage={subMessage}
                helperText={helperText}
            />
        </CenteredFeedbackContainer>
    );
}
