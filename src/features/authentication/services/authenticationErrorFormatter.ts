/**
 * Format authentication errors for user-friendly display
 */
export class AuthenticationErrorFormatter {
    /**
     * Format error with user-friendly message
     */
    static formatError(error: unknown, context: { operation: string; timeout?: number }): {
        title: string;
        message: string;
        technical: string;
    } {
        const err = error as any;
        const errorMessage = err?.message || String(error);

        let title = 'Authentication Error';
        let message = errorMessage;

        // Detect timeout errors
        if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('timed out')) {
            title = 'Operation Timed Out';
            message = `${context.operation} timed out after ${context.timeout}ms. Please try again.`;
        }

        // Detect network errors
        else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('enotfound')) {
            title = 'Network Error';
            message = 'No internet connection. Please check your network and try again.';
        }

        // Detect auth errors
        else if (errorMessage.toLowerCase().includes('auth') || errorMessage.toLowerCase().includes('unauthorized')) {
            title = 'Authentication Failed';
            message = 'Authentication failed. Please try logging in again.';
        }

        const technical = `Operation: ${context.operation}\nError: ${errorMessage}\nStack: ${err?.stack || 'N/A'}`;

        return { title, message, technical };
    }
}
