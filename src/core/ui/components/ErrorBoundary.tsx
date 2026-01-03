/**
 * ErrorBoundary
 *
 * React Error Boundary component to catch and display errors gracefully.
 * Prevents blank screens when components throw errors.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */

import Alert from '@spectrum-icons/workflow/Alert';
import React, { Component, ReactNode, ErrorInfo } from 'react';
import { View, Text, Heading } from '@/core/ui/components/aria';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';

const log = webviewLogger('ErrorBoundary');

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        log.error('Error caught:', error);
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        log.error('Component stack:', errorInfo.componentStack as unknown as Error);

        this.setState({
            errorInfo,
        });

        // Call optional error handler
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }

    render(): ReactNode {
        if (this.state.hasError) {
            // Use custom fallback if provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default error UI
            // Note: backgroundColor/borderRadius/borderWidth/borderColor props replaced with CSS classes
            return (
                <View
                    padding="size-400"
                    className="bg-gray-100 rounded border border-red-600"
                >
                    <View marginBottom="size-200">
                        <Alert size="L" color="negative" />
                    </View>
                    <Heading level={3} marginBottom="size-100">
                        Something went wrong
                    </Heading>
                    <Text>
                        {this.state.error?.message || 'An unexpected error occurred'}
                    </Text>
                    {this.state.errorInfo && (
                        <View marginTop="size-200">
                            <Text className="text-sm font-mono whitespace-pre-wrap">
                                {this.state.errorInfo.componentStack}
                            </Text>
                        </View>
                    )}
                </View>
            );
        }

        return this.props.children;
    }
}
