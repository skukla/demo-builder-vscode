/**
 * Tests for the last-known-good (LKG) SHA reader.
 *
 * Per ADR-006 D2 the patches repo (`eds-demo-patches`) hosts a plain-text
 * `last-known-good` file at its root holding ONLY the verified canonical
 * SHA (Chromium LKGR / Nix `git-revision` convention). The reader fetches
 * this file, trims whitespace, validates a 40-hex SHA shape, and returns
 * undefined for any failure mode (so the caller can fall back to canonical
 * HEAD per D1 proceed-and-warn).
 */

import { readLkgSha } from '@/features/eds/services/lkgReader';
import type { Logger } from '@/types';

const mockLogger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

const originalFetch = global.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
});

afterEach(() => {
    global.fetch = originalFetch;
});

const SOURCE = { owner: 'skukla', repo: 'eds-demo-patches' };
const VALID_SHA = 'a1b2c3d4e5f6789012345678901234567890abcd';

// ==========================================================================
// Happy path
// ==========================================================================

describe('readLkgSha — happy path', () => {
    it('returns the SHA for an OK response with a valid 40-hex body', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(VALID_SHA),
        });

        const sha = await readLkgSha(SOURCE, mockLogger);
        expect(sha).toBe(VALID_SHA);
    });

    it('trims surrounding whitespace + trailing newline (Chromium LKGR convention)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(`  ${VALID_SHA}\n`),
        });

        const sha = await readLkgSha(SOURCE, mockLogger);
        expect(sha).toBe(VALID_SHA);
    });

    it('fetches from raw.githubusercontent.com at the patches-repo root (not in any subdir)', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(VALID_SHA),
        });
        global.fetch = fetchMock;

        await readLkgSha(SOURCE, mockLogger);

        const calledUrl = fetchMock.mock.calls[0][0] as string;
        expect(calledUrl).toBe('https://raw.githubusercontent.com/skukla/eds-demo-patches/main/last-known-good');
    });

    it('honors lkgFile when set — for multi-canonical patches repos (e.g., b2b)', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(VALID_SHA),
        });
        global.fetch = fetchMock;

        await readLkgSha(
            { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
            mockLogger,
        );

        const calledUrl = fetchMock.mock.calls[0][0] as string;
        expect(calledUrl).toBe('https://raw.githubusercontent.com/skukla/eds-demo-patches/main/b2b/last-known-good');
    });
});

// ==========================================================================
// Failure modes (per D1: proceed-and-warn, caller falls back to canonical HEAD)
// ==========================================================================

describe('readLkgSha — failure modes', () => {
    it('returns undefined on HTTP error and warns', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
        });

        const sha = await readLkgSha(SOURCE, mockLogger);
        expect(sha).toBeUndefined();
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('404'));
    });

    it('returns undefined on network error and warns', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network unreachable'));

        const sha = await readLkgSha(SOURCE, mockLogger);
        expect(sha).toBeUndefined();
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Network unreachable'));
    });

    it('returns undefined and warns when body is not a 40-hex SHA (rejects "main")', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('main'),
        });

        const sha = await readLkgSha(SOURCE, mockLogger);
        expect(sha).toBeUndefined();
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid'));
    });

    it('returns undefined for a short SHA (e.g., 7-char abbreviation)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('a1b2c3d'),
        });

        const sha = await readLkgSha(SOURCE, mockLogger);
        expect(sha).toBeUndefined();
    });

    it('returns undefined for a SHA with non-hex characters', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'),  // 40 chars, not hex
        });

        const sha = await readLkgSha(SOURCE, mockLogger);
        expect(sha).toBeUndefined();
    });

    it('returns undefined for an empty body', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(''),
        });

        const sha = await readLkgSha(SOURCE, mockLogger);
        expect(sha).toBeUndefined();
    });

    it('does not log the entire malformed body when it is huge (caps to ~80 chars)', async () => {
        const huge = 'x'.repeat(10000);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(huge),
        });

        await readLkgSha(SOURCE, mockLogger);

        const warnCalls = (mockLogger.warn as jest.Mock).mock.calls.map(c => c[0] as string);
        const malformedWarn = warnCalls.find(c => c.includes('Invalid'));
        expect(malformedWarn).toBeDefined();
        // The warn line itself should not be 10000 chars
        expect(malformedWarn!.length).toBeLessThan(300);
    });
});
