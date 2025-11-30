/**
 * Tests for time formatting utilities
 */

import { formatDuration, formatMinutes } from '@/core/utils/timeFormatting';

describe('timeFormatting', () => {
    describe('formatDuration', () => {
        it('should format milliseconds under 1 second', () => {
            expect(formatDuration(50)).toBe('50ms');
            expect(formatDuration(500)).toBe('500ms');
            expect(formatDuration(999)).toBe('999ms');
        });

        it('should format seconds under 1 minute', () => {
            expect(formatDuration(1000)).toBe('1.0s');
            expect(formatDuration(1500)).toBe('1.5s');
            expect(formatDuration(2564)).toBe('2.6s');
            expect(formatDuration(59000)).toBe('59.0s');
        });

        it('should format minutes under 1 hour', () => {
            expect(formatDuration(60000)).toBe('1m');
            expect(formatDuration(65000)).toBe('1m 5s');
            expect(formatDuration(90000)).toBe('1m 30s');
            expect(formatDuration(3540000)).toBe('59m');
        });

        it('should format hours', () => {
            expect(formatDuration(3600000)).toBe('1h');
            expect(formatDuration(3725000)).toBe('1h 2m');
            expect(formatDuration(7200000)).toBe('2h');
            expect(formatDuration(7260000)).toBe('2h 1m');
        });

        it('should handle edge cases', () => {
            expect(formatDuration(0)).toBe('0ms');
            expect(formatDuration(1)).toBe('1ms');
        });
    });

    describe('formatMinutes', () => {
        it('should format minutes under 1 hour', () => {
            expect(formatMinutes(5)).toBe('5min');
            expect(formatMinutes(30)).toBe('30min');
            expect(formatMinutes(59)).toBe('59min');
        });

        it('should format hours under 1 day', () => {
            expect(formatMinutes(60)).toBe('1h');
            expect(formatMinutes(90)).toBe('1h 30m');
            expect(formatMinutes(120)).toBe('2h');
            expect(formatMinutes(1186)).toBe('19h 46m');
            expect(formatMinutes(1440 - 1)).toBe('23h 59m');
        });

        it('should format days', () => {
            expect(formatMinutes(1440)).toBe('1d'); // 24h = 1d
            expect(formatMinutes(1500)).toBe('1d 1h'); // 25h = 1d 1h
            expect(formatMinutes(2880)).toBe('2d');
            expect(formatMinutes(2940)).toBe('2d 1h');
        });

        it('should handle edge cases', () => {
            expect(formatMinutes(0)).toBe('0min');
            expect(formatMinutes(1)).toBe('1min');
        });

        it('should match example values from debug logs', () => {
            // From: "Token valid, expires in 1186 minutes"
            expect(formatMinutes(1186)).toBe('19h 46m');

            // From: "Token valid, expires in 1156 minutes"
            expect(formatMinutes(1156)).toBe('19h 16m');

            // From: "Token valid, expires in 939 minutes"
            expect(formatMinutes(939)).toBe('15h 39m');
        });
    });
});
