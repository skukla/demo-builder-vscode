import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusOnMount } from '@/core/ui/hooks/useFocusOnMount';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

describe('useFocusOnMount', () => {
    let originalRAF: typeof global.requestAnimationFrame;
    let mockRAF: jest.Mock;

    beforeEach(() => {
        jest.useFakeTimers();
        originalRAF = global.requestAnimationFrame;
        mockRAF = jest.fn((cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        });
        global.requestAnimationFrame = mockRAF;
    });

    afterEach(() => {
        jest.useRealTimers();
        global.requestAnimationFrame = originalRAF;
    });

    describe('immediate focus', () => {
        it('should focus element immediately when available', () => {
            const focusSpy = jest.fn();
            const container = document.createElement('div');
            const button = document.createElement('button');
            button.focus = focusSpy;
            container.appendChild(button);

            const { result } = renderHook(() => {
                const ref = useRef<HTMLDivElement>(container);
                useFocusOnMount(ref, { selector: 'button' });
                return ref;
            });

            expect(focusSpy).toHaveBeenCalledTimes(1);
            expect(result.current.current).toBe(container);
        });

        it('should focus container directly when no selector provided', () => {
            const focusSpy = jest.fn();
            const container = document.createElement('div');
            container.focus = focusSpy;

            renderHook(() => {
                const ref = useRef<HTMLDivElement>(container);
                useFocusOnMount(ref);
                return ref;
            });

            expect(focusSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('RAF fallback', () => {
        it('should use RAF when element not immediately available', () => {
            const container = document.createElement('div');
            const button = document.createElement('button');
            const focusSpy = jest.fn();
            button.focus = focusSpy;

            // Initially no button, then add it
            let queryCount = 0;
            jest.spyOn(container, 'querySelector').mockImplementation((selector) => {
                queryCount++;
                if (queryCount === 1) return null; // First call returns null
                return button; // RAF call finds button
            });

            renderHook(() => {
                const ref = useRef<HTMLDivElement>(container);
                useFocusOnMount(ref, { selector: 'button' });
                return ref;
            });

            // RAF should have been called
            expect(mockRAF).toHaveBeenCalled();
        });
    });

    describe('timeout fallback', () => {
        it('should use timeout fallback when RAF fails', () => {
            const container = document.createElement('div');
            const button = document.createElement('button');
            const focusSpy = jest.fn();
            button.focus = focusSpy;

            // Never find button until timeout
            let callCount = 0;
            jest.spyOn(container, 'querySelector').mockImplementation(() => {
                callCount++;
                if (callCount <= 2) return null; // Immediate + RAF fail
                return button; // Timeout succeeds
            });

            renderHook(() => {
                const ref = useRef<HTMLDivElement>(container);
                useFocusOnMount(ref, { selector: 'button' });
                return ref;
            });

            // Advance to timeout
            jest.advanceTimersByTime(TIMEOUTS.FOCUS_FALLBACK);

            expect(focusSpy).toHaveBeenCalled();
        });

        it('should respect custom delay option', () => {
            const container = document.createElement('div');
            const button = document.createElement('button');
            const focusSpy = jest.fn();
            button.focus = focusSpy;

            jest.spyOn(container, 'querySelector').mockReturnValue(null);

            const customDelay = 500;
            renderHook(() => {
                const ref = useRef<HTMLDivElement>(container);
                useFocusOnMount(ref, { selector: 'button', delay: customDelay });
                return ref;
            });

            // Advance to custom delay
            jest.advanceTimersByTime(customDelay);

            // querySelector was called but didn't find element
            expect(container.querySelector).toHaveBeenCalled();
        });
    });

    describe('disabled option', () => {
        it('should not focus when disabled', () => {
            const focusSpy = jest.fn();
            const container = document.createElement('div');
            const button = document.createElement('button');
            button.focus = focusSpy;
            container.appendChild(button);

            renderHook(() => {
                const ref = useRef<HTMLDivElement>(container);
                useFocusOnMount(ref, { selector: 'button', disabled: true });
                return ref;
            });

            expect(focusSpy).not.toHaveBeenCalled();
        });

        it('should focus when disabled is false', () => {
            const focusSpy = jest.fn();
            const container = document.createElement('div');
            const button = document.createElement('button');
            button.focus = focusSpy;
            container.appendChild(button);

            renderHook(() => {
                const ref = useRef<HTMLDivElement>(container);
                useFocusOnMount(ref, { selector: 'button', disabled: false });
                return ref;
            });

            expect(focusSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('cleanup', () => {
        it('should cancel RAF and timeout on unmount', () => {
            const cancelAnimationFrameSpy = jest.spyOn(global, 'cancelAnimationFrame');
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

            const container = document.createElement('div');
            jest.spyOn(container, 'querySelector').mockReturnValue(null);

            const { unmount } = renderHook(() => {
                const ref = useRef<HTMLDivElement>(container);
                useFocusOnMount(ref, { selector: 'button' });
                return ref;
            });

            unmount();

            expect(cancelAnimationFrameSpy).toHaveBeenCalled();
            expect(clearTimeoutSpy).toHaveBeenCalled();

            cancelAnimationFrameSpy.mockRestore();
            clearTimeoutSpy.mockRestore();
        });

        it('should not clean up if immediate focus succeeded', () => {
            const cancelAnimationFrameSpy = jest.spyOn(global, 'cancelAnimationFrame');
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

            const container = document.createElement('div');
            const button = document.createElement('button');
            container.appendChild(button);

            const { unmount } = renderHook(() => {
                const ref = useRef<HTMLDivElement>(container);
                useFocusOnMount(ref, { selector: 'button' });
                return ref;
            });

            // Reset spy counts before unmount
            cancelAnimationFrameSpy.mockClear();
            clearTimeoutSpy.mockClear();

            unmount();

            // No timers to clean up since immediate focus succeeded
            expect(cancelAnimationFrameSpy).not.toHaveBeenCalled();
            expect(clearTimeoutSpy).not.toHaveBeenCalled();

            cancelAnimationFrameSpy.mockRestore();
            clearTimeoutSpy.mockRestore();
        });
    });

    describe('null ref handling', () => {
        it('should handle null ref gracefully', () => {
            expect(() => {
                renderHook(() => {
                    const ref = useRef<HTMLDivElement>(null);
                    useFocusOnMount(ref, { selector: 'button' });
                    return ref;
                });

                jest.advanceTimersByTime(TIMEOUTS.FOCUS_FALLBACK);
            }).not.toThrow();
        });
    });
});
