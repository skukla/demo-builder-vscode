import React from 'react';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';

interface AuthErrorStateProps {
    error: string;
    onRetry: () => void;
    onBack: () => void;
}

export function AuthErrorState({ error, onRetry, onBack }: AuthErrorStateProps) {
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
