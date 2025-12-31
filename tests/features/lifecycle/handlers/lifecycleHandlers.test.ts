/**
 * lifecycleHandlers Tests
 *
 * Tests for the lifecycle feature handler map.
 * Verifies all required message types are present.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { lifecycleHandlers, handleOpenExternal } from '@/features/lifecycle/handlers/lifecycleHandlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import type { HandlerContext } from '@/commands/handlers/HandlerContext';

describe('lifecycleHandlers', () => {
    describe('handler registration', () => {
        it('should be defined as an object', () => {
            // Given: lifecycleHandlers object
            // When: Checking type
            // Then: Should be a non-null object
            expect(lifecycleHandlers).toBeDefined();
            expect(typeof lifecycleHandlers).toBe('object');
            expect(lifecycleHandlers).not.toBeNull();
        });

        it('should include core lifecycle handlers', () => {
            // Given: lifecycleHandlers object
            // When: Checking for core message types
            // Then: Core handlers present
            expect(hasHandler(lifecycleHandlers, 'ready')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'cancel')).toBe(true);
        });

        it('should include cancellation handlers', () => {
            // Given: lifecycleHandlers object
            // When: Checking for cancellation message types
            // Then: Cancellation handlers present
            expect(hasHandler(lifecycleHandlers, 'cancel-project-creation')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'cancel-mesh-creation')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'cancel-auth-polling')).toBe(true);
        });

        it('should include project action handlers', () => {
            // Given: lifecycleHandlers object
            // When: Checking for project action message types
            // Then: Project action handlers present
            expect(hasHandler(lifecycleHandlers, 'openProject')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'browseFiles')).toBe(true);
        });

        it('should include utility handlers', () => {
            // Given: lifecycleHandlers object
            // When: Checking for utility message types
            // Then: Utility handlers present
            expect(hasHandler(lifecycleHandlers, 'log')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'open-adobe-console')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'show-logs')).toBe(true);
            expect(hasHandler(lifecycleHandlers, 'openExternal')).toBe(true);
        });

        it('should have exactly 11 handlers', () => {
            // Given: lifecycleHandlers object
            // When: Getting registered types
            const types = getRegisteredTypes(lifecycleHandlers);

            // Then: Exactly 11 handlers
            expect(types).toHaveLength(11);
        });

        it('should have handlers as functions', () => {
            // Given: lifecycleHandlers object
            // When: Checking handler types
            // Then: All handlers should be functions
            const types = getRegisteredTypes(lifecycleHandlers);
            for (const type of types) {
                expect(typeof lifecycleHandlers[type]).toBe('function');
            }
        });
    });
});

// Mock vscode module
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn().mockResolvedValue(true),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
        file: jest.fn((path: string) => ({ fsPath: path })),
    },
}));

describe('handleOpenExternal - Security', () => {
    // Create mock context factory
    const createMockContext = (): HandlerContext => ({
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any,
        debugLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
        context: {} as any,
        panel: undefined,
        stateManager: {} as any,
        communicationManager: undefined,
        sendMessage: jest.fn(),
        sharedState: { isAuthenticating: false },
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('URL validation (SECURITY)', () => {
        it('should reject URLs with javascript: protocol', async () => {
            // Given: XSS attempt via javascript: URL
            const context = createMockContext();
            const maliciousPayload = { url: 'javascript:alert(document.cookie)' };

            // When: Handler is called with malicious URL
            const result = await handleOpenExternal(context, maliciousPayload);

            // Then: Should reject with error
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid');
        });

        it('should reject URLs pointing to localhost (SSRF prevention)', async () => {
            // Given: SSRF attempt via localhost URL
            const context = createMockContext();
            const ssrfPayload = { url: 'https://localhost:8080/admin' };

            // When: Handler is called with localhost URL
            const result = await handleOpenExternal(context, ssrfPayload);

            // Then: Should reject with error
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid');
        });

        it('should reject URLs pointing to private IP ranges (SSRF prevention)', async () => {
            // Given: SSRF attempt via private IP
            const context = createMockContext();
            const ssrfPayload = { url: 'https://192.168.1.1/admin' };

            // When: Handler is called with private IP URL
            const result = await handleOpenExternal(context, ssrfPayload);

            // Then: Should reject with error
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid');
        });

        it('should reject URLs with http: protocol (insecure)', async () => {
            // Given: Insecure HTTP URL
            const context = createMockContext();
            const insecurePayload = { url: 'http://example.com' };

            // When: Handler is called with HTTP URL
            const result = await handleOpenExternal(context, insecurePayload);

            // Then: Should reject (only HTTPS allowed by default)
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid');
        });

        it('should reject cloud metadata endpoint URLs (AWS/GCP/Azure SSRF)', async () => {
            // Given: Cloud metadata SSRF attempt
            const context = createMockContext();
            const metadataPayload = { url: 'https://169.254.169.254/latest/meta-data/' };

            // When: Handler is called with metadata URL
            const result = await handleOpenExternal(context, metadataPayload);

            // Then: Should reject with error
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid');
        });
    });

    describe('input validation', () => {
        it('should reject missing URL', async () => {
            // Given: No URL provided
            const context = createMockContext();

            // When: Handler is called without URL
            const result = await handleOpenExternal(context, {});

            // Then: Should return error
            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });

        it('should reject empty URL', async () => {
            // Given: Empty URL
            const context = createMockContext();
            const emptyPayload = { url: '' };

            // When: Handler is called with empty URL
            const result = await handleOpenExternal(context, emptyPayload);

            // Then: Should return error
            expect(result.success).toBe(false);
        });
    });
});
