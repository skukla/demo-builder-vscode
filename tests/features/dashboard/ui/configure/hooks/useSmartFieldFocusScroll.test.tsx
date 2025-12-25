/**
 * useSmartFieldFocusScroll Hook Tests
 *
 * Tests for the smart scroll hook that scrolls to section headers
 * when fields within a section receive focus.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useSmartFieldFocusScroll } from '@/features/dashboard/ui/configure/hooks/useSmartFieldFocusScroll';

describe('useSmartFieldFocusScroll', () => {
    let mockScrollIntoView: jest.Mock;
    let containerElement: HTMLDivElement;
    let sectionHeader: HTMLDivElement;
    let fieldElement: HTMLInputElement;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock DOM structure
        containerElement = document.createElement('div');
        containerElement.setAttribute('data-testid', 'scroll-container');

        sectionHeader = document.createElement('div');
        sectionHeader.setAttribute('data-section', 'section-1');
        sectionHeader.className = 'section-header';

        fieldElement = document.createElement('input');
        fieldElement.setAttribute('data-section-id', 'section-1');
        fieldElement.setAttribute('data-field-id', 'field-1');

        sectionHeader.appendChild(fieldElement);
        containerElement.appendChild(sectionHeader);
        document.body.appendChild(containerElement);

        // Mock scrollIntoView
        mockScrollIntoView = jest.fn();
        sectionHeader.scrollIntoView = mockScrollIntoView;
    });

    afterEach(() => {
        document.body.removeChild(containerElement);
    });

    describe('Basic Scroll Behavior', () => {
        it('should scroll to section header on first field focus in section', () => {
            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: containerElement },
                })
            );

            // Simulate focus on field
            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            expect(mockScrollIntoView).toHaveBeenCalledWith({
                behavior: 'smooth',
                block: 'start',
            });
        });

        it('should not scroll when focusing second field in same section', () => {
            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: containerElement },
                })
            );

            // Focus first field
            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            mockScrollIntoView.mockClear();

            // Focus second field in same section
            act(() => {
                result.current.onFieldFocus('section-1', 'field-2');
            });

            expect(mockScrollIntoView).not.toHaveBeenCalled();
        });

        it('should scroll when moving to a different section', () => {
            // Add second section
            const sectionHeader2 = document.createElement('div');
            sectionHeader2.setAttribute('data-section', 'section-2');
            sectionHeader2.scrollIntoView = mockScrollIntoView;
            containerElement.appendChild(sectionHeader2);

            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: containerElement },
                })
            );

            // Focus field in section 1
            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            expect(mockScrollIntoView).toHaveBeenCalledTimes(1);

            mockScrollIntoView.mockClear();

            // Focus field in section 2 - should scroll
            act(() => {
                result.current.onFieldFocus('section-2', 'field-3');
            });

            expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
        });
    });

    describe('Section Header Finding', () => {
        it('should find section header by data-section attribute', () => {
            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: containerElement },
                })
            );

            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            expect(mockScrollIntoView).toHaveBeenCalled();
        });

        it('should not scroll if section header not found', () => {
            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: containerElement },
                })
            );

            act(() => {
                result.current.onFieldFocus('non-existent-section', 'field-1');
            });

            expect(mockScrollIntoView).not.toHaveBeenCalled();
        });

        it('should not scroll if container ref is null', () => {
            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: null },
                })
            );

            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            expect(mockScrollIntoView).not.toHaveBeenCalled();
        });
    });

    describe('Scroll Options', () => {
        it('should use instant scroll behavior when specified', () => {
            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: containerElement },
                    scrollBehavior: 'instant',
                })
            );

            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            expect(mockScrollIntoView).toHaveBeenCalledWith({
                behavior: 'instant',
                block: 'start',
            });
        });

        it('should use custom block position when specified', () => {
            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: containerElement },
                    blockPosition: 'center',
                })
            );

            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            expect(mockScrollIntoView).toHaveBeenCalledWith({
                behavior: 'smooth',
                block: 'center',
            });
        });
    });

    describe('Reset Functionality', () => {
        it('should reset tracked section to enable re-scroll', () => {
            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: containerElement },
                })
            );

            // First focus - should scroll
            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
            mockScrollIntoView.mockClear();

            // Second focus same section - should not scroll
            act(() => {
                result.current.onFieldFocus('section-1', 'field-2');
            });

            expect(mockScrollIntoView).not.toHaveBeenCalled();

            // Reset tracking
            act(() => {
                result.current.reset();
            });

            // Focus same section after reset - should scroll again
            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
        });
    });

    describe('Current Section Tracking', () => {
        it('should expose current section id', () => {
            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: containerElement },
                })
            );

            expect(result.current.currentSectionId).toBeNull();

            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            expect(result.current.currentSectionId).toBe('section-1');
        });
    });

    describe('Disabled Mode', () => {
        it('should not scroll when disabled', () => {
            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: containerElement },
                    enabled: false,
                })
            );

            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            expect(mockScrollIntoView).not.toHaveBeenCalled();
        });

        it('should still track section when disabled', () => {
            const { result } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: { current: containerElement },
                    enabled: false,
                })
            );

            act(() => {
                result.current.onFieldFocus('section-1', 'field-1');
            });

            expect(result.current.currentSectionId).toBe('section-1');
        });
    });

    describe('Memoization', () => {
        it('should memoize onFieldFocus callback', () => {
            // Create a stable ref object (simulates useRef behavior)
            const stableRef = { current: containerElement };

            const { result, rerender } = renderHook(() =>
                useSmartFieldFocusScroll({
                    containerRef: stableRef,
                })
            );

            const firstCallback = result.current.onFieldFocus;
            rerender();
            const secondCallback = result.current.onFieldFocus;

            expect(firstCallback).toBe(secondCallback);
        });
    });
});
