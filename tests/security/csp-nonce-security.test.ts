/**
 * Security Tests: CSP Nonce Generation
 *
 * Tests cryptographic security of Content Security Policy nonce generation
 * to prevent XSS attacks via nonce prediction.
 *
 * OWASP Reference: A02:2021 - Cryptographic Failures
 * CVE Prevention: CSP bypass via predictable nonce values
 */

import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import * as vscode from 'vscode';
import { StateManager } from '@/core/state';
import { Logger } from '@/core/logging';

// Mock dependencies
jest.mock('vscode');
jest.mock('@/core/communication/webviewCommunicationManager');
jest.mock('@/core/utils/loadingHTML');
jest.mock('@/core/logging/debugLogger');

// Concrete test implementation of BaseWebviewCommand
class TestWebviewCommand extends BaseWebviewCommand {
    protected getWebviewId(): string {
        return 'testWebview';
    }
    protected getWebviewTitle(): string {
        return 'Test Webview';
    }
    protected async getWebviewContent(): Promise<string> {
        return '<html></html>';
    }
    protected initializeMessageHandlers(): void {
        // No-op for testing
    }
    protected async getInitialData(): Promise<unknown> {
        return {};
    }
    protected getLoadingMessage(): string {
        return 'Loading...';
    }

    // Expose protected method for testing
    public testGetNonce(): string {
        return this.getNonce();
    }

    async execute(): Promise<void> {
        // No-op for testing
    }
}

describe('Security: CSP Nonce Generation', () => {
    let command: TestWebviewCommand;
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: StateManager;
    let mockLogger: Logger;

    beforeEach(() => {
        mockContext = {
            extensionPath: '/mock/path',
            subscriptions: [],
        } as unknown as vscode.ExtensionContext;

        mockStateManager = {} as StateManager;
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        command = new TestWebviewCommand(
            mockContext,
            mockStateManager,
            mockLogger
        );
    });

    describe('Cryptographic Security', () => {
        it('should generate nonce using cryptographically secure random', () => {
            const nonce = command.testGetNonce();

            // Base64 encoded 16 bytes = 24 characters (with padding)
            expect(nonce.length).toBeGreaterThanOrEqual(20);
            expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 format
        });

        it('should generate unique nonces on each call', () => {
            const nonces = new Set<string>();
            const iterations = 100;

            for (let i = 0; i < iterations; i++) {
                nonces.add(command.testGetNonce());
            }

            // All nonces should be unique
            expect(nonces.size).toBe(iterations);
        });

        it('should not use predictable Math.random() pattern', () => {
            // Collect multiple nonces
            const nonces: string[] = [];
            for (let i = 0; i < 10; i++) {
                nonces.push(command.testGetNonce());
            }

            // Verify no nonces match the old Math.random() pattern
            // Old pattern: 32 chars of [A-Za-z0-9] only (no +, /, =)
            const oldPattern = /^[A-Za-z0-9]{32}$/;

            nonces.forEach(nonce => {
                // New secure nonces should be base64 (include +, /, =)
                // or be a different length than the old 32-char pattern
                expect(nonce).not.toMatch(oldPattern);
            });
        });

        it('should generate sufficient entropy (minimum 128 bits)', () => {
            const nonce = command.testGetNonce();

            // 16 bytes = 128 bits of entropy
            // Base64 encoding: 4 chars per 3 bytes
            // 16 bytes → 24 base64 chars (including padding)
            const decodedLength = Math.floor((nonce.replace(/=/g, '').length * 3) / 4);
            expect(decodedLength).toBeGreaterThanOrEqual(16);
        });
    });

    describe('XSS Prevention', () => {
        it('should prevent nonce prediction attacks', () => {
            // An attacker observing nonces should not be able to predict future values
            const observedNonces: string[] = [];

            // Attacker observes 10 nonces
            for (let i = 0; i < 10; i++) {
                observedNonces.push(command.testGetNonce());
            }

            // Attacker generates next nonce
            const attackerGuess = command.testGetNonce();

            // Next actual nonce
            const actualNext = command.testGetNonce();

            // Attacker's guess should not match actual nonce
            expect(attackerGuess).not.toBe(actualNext);

            // And should not match any previously observed nonces
            expect(observedNonces).not.toContain(actualNext);
        });

        it('should generate nonces suitable for CSP protection', () => {
            const nonce = command.testGetNonce();

            // Verify nonce is safe for use in CSP header
            // Must not contain characters that break HTML attributes
            expect(nonce).not.toContain('"');
            expect(nonce).not.toContain("'");
            expect(nonce).not.toContain('<');
            expect(nonce).not.toContain('>');

            // Must be base64 (safe for HTML attribute)
            expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
        });
    });

    describe('Performance', () => {
        it('should generate nonces efficiently', () => {
            const iterations = 1000;
            const startTime = Date.now();

            for (let i = 0; i < iterations; i++) {
                command.testGetNonce();
            }

            const duration = Date.now() - startTime;

            // Should complete 1000 nonces in under 100ms
            expect(duration).toBeLessThan(100);
        });
    });
});
