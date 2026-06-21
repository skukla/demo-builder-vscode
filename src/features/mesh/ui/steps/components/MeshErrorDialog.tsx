import React from 'react';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { ErrorCode } from '@/types/errorCodes';

interface MeshErrorDialogProps {
    error: string;
    /** Typed error code for programmatic error handling */
    code?: ErrorCode;
    onRetry: () => void;
    onBack: () => void;
}

export function MeshErrorDialog({ error, code: _code, onRetry, onBack }: MeshErrorDialogProps) {
    return (
        <StatusDisplay
            variant="error"
            title="API Mesh API Not Enabled"
            message={error}
            actions={[
                { label: 'Retry', variant: 'accent', onPress: onRetry },
                { label: 'Back', variant: 'secondary', onPress: onBack },
            ]}
        />
    );
}
