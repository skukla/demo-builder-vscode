/**
 * Tests for ErrorCode integration in webview types
 *
 * These tests verify that webview state interfaces properly support
 * the ErrorCode enum for typed error handling.
 */
import { ErrorCode } from '@/types/errorCodes';
import type { AdobeAuthState, WizardState } from '@/types/webview';

describe('webview types with ErrorCode', () => {
    describe('AdobeAuthState', () => {
        it('accepts code field with valid ErrorCode', () => {
            const state: AdobeAuthState = {
                isAuthenticated: false,
                isChecking: false,
                error: 'timeout',
                code: ErrorCode.TIMEOUT,
            };
            expect(state.code).toBe(ErrorCode.TIMEOUT);
        });

        it('allows undefined code field', () => {
            const state: AdobeAuthState = {
                isAuthenticated: false,
                isChecking: false,
                error: 'some error',
                // code is optional - should work without it
            };
            expect(state.code).toBeUndefined();
        });

        it('accepts AUTH_NO_APP_BUILDER code', () => {
            const state: AdobeAuthState = {
                isAuthenticated: false,
                isChecking: false,
                error: 'no app builder access',
                code: ErrorCode.AUTH_NO_APP_BUILDER,
                orgLacksAccess: true,
            };
            expect(state.code).toBe(ErrorCode.AUTH_NO_APP_BUILDER);
        });

        it('accepts AUTH_REQUIRED code', () => {
            const state: AdobeAuthState = {
                isAuthenticated: false,
                isChecking: false,
                error: 'authentication required',
                code: ErrorCode.AUTH_REQUIRED,
            };
            expect(state.code).toBe(ErrorCode.AUTH_REQUIRED);
        });

        it('accepts NETWORK code', () => {
            const state: AdobeAuthState = {
                isAuthenticated: false,
                isChecking: false,
                error: 'network error',
                code: ErrorCode.NETWORK,
            };
            expect(state.code).toBe(ErrorCode.NETWORK);
        });
    });

    describe('WizardState.apiMesh', () => {
        it('accepts code field in apiMesh state', () => {
            const wizardState: Partial<WizardState> = {
                apiMesh: {
                    isChecking: false,
                    apiEnabled: false,
                    meshExists: false,
                    error: 'deployment failed',
                    code: ErrorCode.MESH_DEPLOY_FAILED,
                },
            };
            expect(wizardState.apiMesh?.code).toBe(ErrorCode.MESH_DEPLOY_FAILED);
        });

        it('accepts MESH_NOT_FOUND code', () => {
            const wizardState: Partial<WizardState> = {
                apiMesh: {
                    isChecking: false,
                    apiEnabled: false,
                    meshExists: false,
                    error: 'mesh not found',
                    code: ErrorCode.MESH_NOT_FOUND,
                },
            };
            expect(wizardState.apiMesh?.code).toBe(ErrorCode.MESH_NOT_FOUND);
        });

        it('accepts TIMEOUT code for mesh operations', () => {
            const wizardState: Partial<WizardState> = {
                apiMesh: {
                    isChecking: false,
                    apiEnabled: false,
                    meshExists: false,
                    error: 'operation timed out',
                    code: ErrorCode.TIMEOUT,
                },
            };
            expect(wizardState.apiMesh?.code).toBe(ErrorCode.TIMEOUT);
        });

        it('allows undefined code field in apiMesh', () => {
            const wizardState: Partial<WizardState> = {
                apiMesh: {
                    isChecking: false,
                    apiEnabled: false,
                    meshExists: false,
                    error: 'some error',
                    // code is optional
                },
            };
            expect(wizardState.apiMesh?.code).toBeUndefined();
        });
    });

    describe('WizardState.apiVerification', () => {
        it('accepts code field in apiVerification state', () => {
            const wizardState: Partial<WizardState> = {
                apiVerification: {
                    isChecking: false,
                    error: 'verification failed',
                    code: ErrorCode.MESH_VERIFY_FAILED,
                },
            };
            expect(wizardState.apiVerification?.code).toBe(ErrorCode.MESH_VERIFY_FAILED);
        });

        it('allows undefined code field in apiVerification', () => {
            const wizardState: Partial<WizardState> = {
                apiVerification: {
                    isChecking: false,
                    error: 'some error',
                    // code is optional
                },
            };
            expect(wizardState.apiVerification?.code).toBeUndefined();
        });
    });

    describe('type safety', () => {
        it('ErrorCode enum values are string literals', () => {
            // Verify ErrorCode values are strings (for JSON serialization)
            expect(typeof ErrorCode.TIMEOUT).toBe('string');
            expect(typeof ErrorCode.AUTH_NO_APP_BUILDER).toBe('string');
            expect(typeof ErrorCode.MESH_DEPLOY_FAILED).toBe('string');
        });

        it('ErrorCode can be used in switch statements', () => {
            const state: AdobeAuthState = {
                isAuthenticated: false,
                isChecking: false,
                error: 'timeout',
                code: ErrorCode.TIMEOUT,
            };

            let result: string;
            switch (state.code) {
                case ErrorCode.TIMEOUT:
                    result = 'timeout_handled';
                    break;
                case ErrorCode.NETWORK:
                    result = 'network_handled';
                    break;
                default:
                    result = 'default';
            }

            expect(result).toBe('timeout_handled');
        });
    });
});
