import React from 'react';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { ErrorCode } from '@/types/errorCodes';

interface AuthErrorStateProps {
    error: string;
    /** Typed error code for programmatic error handling */
    code?: ErrorCode;
    onRetry: () => void;
    onBack: () => void;
}

export function AuthErrorState({ error, code, onRetry, onBack }: AuthErrorStateProps) {
    return (
        <StatusDisplay
            variant="error"
            title="Authentication Failed"
            message={error}
            actions={[
                { label: 'Retry', variant: 'accent', onPress: onRetry },
                { label: 'Back', variant: 'secondary', onPress: onBack },
            ]}
        />
    );
}
