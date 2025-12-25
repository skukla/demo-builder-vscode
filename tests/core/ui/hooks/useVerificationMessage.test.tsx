/**
 * useVerificationMessage Hook Tests
 *
 * Tests for the verification message formatting hook.
 * Maps status values to formatted messages with type indicators.
 *
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { useVerificationMessage } from '@/core/ui/hooks/useVerificationMessage';

describe('useVerificationMessage', () => {
    describe('Status to Message Mapping', () => {
        it('should return info message for checking status', () => {
            const { result } = renderHook(() =>
                useVerificationMessage('checking')
            );

            expect(result.current).toEqual({
                text: 'Verifying...',
                type: 'info',
            });
        });

        it('should return success message for success status', () => {
            const { result } = renderHook(() =>
                useVerificationMessage('success')
            );

            expect(result.current).toEqual({
                text: 'Verified',
                type: 'success',
            });
        });

        it('should return error message for error status', () => {
            const { result } = renderHook(() =>
                useVerificationMessage('error')
            );

            expect(result.current).toEqual({
                text: 'Verification failed',
                type: 'error',
            });
        });

        it('should return warning message for warning status', () => {
            const { result } = renderHook(() =>
                useVerificationMessage('warning')
            );

            expect(result.current).toEqual({
                text: 'Warning',
                type: 'warning',
            });
        });

        it('should return info type for unknown status', () => {
            const { result } = renderHook(() =>
                useVerificationMessage('unknown-status')
            );

            expect(result.current).toEqual({
                text: 'Unknown',
                type: 'info',
            });
        });
    });

    describe('Custom Message Override', () => {
        it('should use custom message when provided for error status', () => {
            const { result } = renderHook(() =>
                useVerificationMessage('error', 'Auth failed')
            );

            expect(result.current).toEqual({
                text: 'Auth failed',
                type: 'error',
            });
        });

        it('should use custom message when provided for checking status', () => {
            const { result } = renderHook(() =>
                useVerificationMessage('checking', 'Loading data...')
            );

            expect(result.current).toEqual({
                text: 'Loading data...',
                type: 'info',
            });
        });

        it('should use custom message when provided for success status', () => {
            const { result } = renderHook(() =>
                useVerificationMessage('success', 'All checks passed!')
            );

            expect(result.current).toEqual({
                text: 'All checks passed!',
                type: 'success',
            });
        });

        it('should use custom message for unknown status', () => {
            const { result } = renderHook(() =>
                useVerificationMessage('custom', 'Custom message')
            );

            expect(result.current).toEqual({
                text: 'Custom message',
                type: 'info',
            });
        });
    });

    describe('Memoization', () => {
        it('should return same object reference when inputs unchanged', () => {
            const { result, rerender } = renderHook(
                ({ status, message }) => useVerificationMessage(status, message),
                { initialProps: { status: 'checking', message: undefined } }
            );

            const firstResult = result.current;
            rerender({ status: 'checking', message: undefined });
            const secondResult = result.current;

            expect(firstResult).toBe(secondResult);
        });

        it('should return new object when status changes', () => {
            const { result, rerender } = renderHook(
                ({ status }) => useVerificationMessage(status),
                { initialProps: { status: 'checking' } }
            );

            const firstResult = result.current;
            rerender({ status: 'success' });
            const secondResult = result.current;

            expect(firstResult).not.toBe(secondResult);
            expect(secondResult.type).toBe('success');
        });

        it('should return new object when message changes', () => {
            const { result, rerender } = renderHook(
                ({ status, message }) => useVerificationMessage(status, message),
                { initialProps: { status: 'error', message: 'First error' } }
            );

            const firstResult = result.current;
            rerender({ status: 'error', message: 'Second error' });
            const secondResult = result.current;

            expect(firstResult).not.toBe(secondResult);
            expect(secondResult.text).toBe('Second error');
        });
    });
});
