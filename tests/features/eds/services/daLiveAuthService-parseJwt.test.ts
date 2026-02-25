/**
 * Tests for parseJwtPayload utility
 *
 * Verifies the JWT payload parsing utility extracted from storeToken
 * to eliminate duplication between storeToken and validateDaLiveToken.
 */

// Mock vscode before imports
jest.mock('vscode', () => ({
    env: { openExternal: jest.fn().mockResolvedValue(true) },
    Uri: { parse: jest.fn((s: string) => s) },
}));

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

import { parseJwtPayload } from '@/features/eds/services/daLiveAuthService';

// Helper to create test JWT tokens
function createTestJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = 'test_signature';
    return `${header}.${body}.${signature}`;
}

describe('parseJwtPayload', () => {
    it('should decode a valid JWT payload', () => {
        // Given: A valid JWT with known payload
        const token = createTestJwt({
            email: 'user@adobe.com',
            client_id: 'darkalley',
            created_at: '1700000000000',
            expires_in: '86400000',
        });

        // When: Parsing the JWT
        const result = parseJwtPayload(token);

        // Then: Should return the decoded payload
        expect(result).not.toBeNull();
        expect(result!.email).toBe('user@adobe.com');
        expect(result!.client_id).toBe('darkalley');
        expect(result!.created_at).toBe('1700000000000');
        expect(result!.expires_in).toBe('86400000');
    });

    it('should return null for non-JWT string', () => {
        // Given: A string that is not a JWT
        const token = 'not-a-jwt-token';

        // When: Parsing the string
        const result = parseJwtPayload(token);

        // Then: Should return null
        expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
        const result = parseJwtPayload('');
        expect(result).toBeNull();
    });

    it('should return null for JWT with invalid base64 payload', () => {
        // Given: A token with valid header but invalid base64 in payload
        const token = 'eyJhbGciOiJSUzI1NiJ9.!!!invalid!!!.signature';

        // When: Parsing the token
        const result = parseJwtPayload(token);

        // Then: Should return null
        expect(result).toBeNull();
    });

    it('should handle JWT with only two parts (no signature)', () => {
        // Given: A two-part JWT (header.payload)
        const payload = { email: 'test@test.com' };
        const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64');
        const body = Buffer.from(JSON.stringify(payload)).toString('base64');
        const token = `${header}.${body}`;

        // When: Parsing the token
        const result = parseJwtPayload(token);

        // Then: Should still decode the payload
        expect(result).not.toBeNull();
        expect(result!.email).toBe('test@test.com');
    });

    it('should return null for JWT with fewer than two parts', () => {
        // Given: A token with only one part
        const token = 'eyJhbGciOiJSUzI1NiJ9';

        // When: Parsing the token
        const result = parseJwtPayload(token);

        // Then: Should return null (can not extract payload)
        expect(result).toBeNull();
    });

    it('should handle payload with preferred_username', () => {
        // Given: A JWT with preferred_username instead of email
        const token = createTestJwt({
            preferred_username: 'preferred@adobe.com',
        });

        // When: Parsing the JWT
        const result = parseJwtPayload(token);

        // Then: Should return the payload with preferred_username
        expect(result).not.toBeNull();
        expect(result!.preferred_username).toBe('preferred@adobe.com');
    });

    it('should handle payload with numeric values', () => {
        // Given: A JWT with numeric payload values
        const token = createTestJwt({
            created_at: 1700000000000,
            expires_in: 86400000,
        });

        // When: Parsing the JWT
        const result = parseJwtPayload(token);

        // Then: Should preserve numeric types
        expect(result).not.toBeNull();
        expect(result!.created_at).toBe(1700000000000);
        expect(result!.expires_in).toBe(86400000);
    });
});
