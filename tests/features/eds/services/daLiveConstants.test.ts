/**
 * DA.live Constants Tests
 */

import {
    DA_LIVE_BASE_URL,
    MAX_RETRY_ATTEMPTS,
    RETRY_DELAY_BASE,
    RETRYABLE_STATUS_CODES,
    getRetryDelay,
    normalizePath,
} from '@/features/eds/services/daLiveConstants';

describe('daLiveConstants', () => {
    describe('DA_LIVE_BASE_URL', () => {
        it('should be the admin DA.live URL', () => {
            expect(DA_LIVE_BASE_URL).toBe('https://admin.da.live');
        });
    });

    describe('MAX_RETRY_ATTEMPTS', () => {
        it('should be 3', () => {
            expect(MAX_RETRY_ATTEMPTS).toBe(3);
        });
    });

    describe('RETRY_DELAY_BASE', () => {
        it('should be 1000ms', () => {
            expect(RETRY_DELAY_BASE).toBe(1000);
        });
    });

    describe('RETRYABLE_STATUS_CODES', () => {
        it('should include 502, 503, 504', () => {
            expect(RETRYABLE_STATUS_CODES).toContain(502);
            expect(RETRYABLE_STATUS_CODES).toContain(503);
            expect(RETRYABLE_STATUS_CODES).toContain(504);
        });
    });

    describe('getRetryDelay', () => {
        it('should return base delay for first attempt', () => {
            expect(getRetryDelay(1)).toBe(1000);
        });

        it('should return double base delay for second attempt', () => {
            expect(getRetryDelay(2)).toBe(2000);
        });

        it('should return quadruple base delay for third attempt', () => {
            expect(getRetryDelay(3)).toBe(4000);
        });
    });

    describe('normalizePath', () => {
        it('should remove leading slash', () => {
            expect(normalizePath('/pages/home')).toBe('pages/home');
        });

        it('should return path unchanged if no leading slash', () => {
            expect(normalizePath('pages/home')).toBe('pages/home');
        });

        it('should handle empty string', () => {
            expect(normalizePath('')).toBe('');
        });

        it('should handle root path', () => {
            expect(normalizePath('/')).toBe('');
        });
    });
});
