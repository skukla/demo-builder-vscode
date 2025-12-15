import { useEffect, useRef, useCallback } from 'react';
import { PrerequisiteCheck } from '@/types/webview';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

interface UsePrerequisiteAutoScrollReturn {
    itemRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
    scrollContainerRef: React.MutableRefObject<HTMLDivElement | null>;
    scrollToTop: () => void;
    resetAutoScroll: () => void;
}

/**
 * Hook to manage auto-scroll behavior for prerequisites list
 *
 * Handles:
 * - Auto-scroll to currently checking item
 * - Auto-scroll to bottom when all complete
 * - Reset scroll state when rechecking
 */
export function usePrerequisiteAutoScroll(
    checks: PrerequisiteCheck[],
    setCanProceed: (value: boolean) => void
): UsePrerequisiteAutoScrollReturn {
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const hasAutoScrolled = useRef<boolean>(false);

    // Scroll to top (used when starting a check)
    const scrollToTop = useCallback(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        }
    }, []);

    // Reset auto-scroll flag (used when navigating back to step)
    const resetAutoScroll = useCallback(() => {
        hasAutoScrolled.current = false;
    }, []);

    // Auto-scroll when prerequisite status changes to 'checking'
    useEffect(() => {
        const checkingIndex = checks.findIndex(c => c.status === 'checking');

        if (checkingIndex > 0 && itemRefs.current[checkingIndex] && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const item = itemRefs.current[checkingIndex];

            const itemTop = item.offsetTop;
            const itemHeight = item.offsetHeight;
            const containerHeight = container.clientHeight;
            const containerScrollTop = container.scrollTop;

            const isVisible = itemTop >= containerScrollTop &&
                            (itemTop + itemHeight) <= (containerScrollTop + containerHeight);

            if (!isVisible) {
                if (itemTop + itemHeight > containerScrollTop + containerHeight) {
                    const scrollTo = itemTop + itemHeight - containerHeight + 10;
                    container.scrollTo({
                        top: Math.max(0, scrollTo),
                        behavior: 'smooth',
                    });
                } else if (itemTop < containerScrollTop) {
                    container.scrollTo({
                        top: Math.max(0, itemTop - 10),
                        behavior: 'smooth',
                    });
                }
            }
        }
    }, [checks]);

    // Update canProceed and auto-scroll to bottom when all complete
    useEffect(() => {
        const allRequired = checks
            .filter(check => !check.isOptional)
            .every(check => check.status === 'success' || check.status === 'warning');
        setCanProceed(allRequired);

        const allSuccess = checks.length > 0 && checks.every(check => check.status === 'success');
        if (allSuccess && !hasAutoScrolled.current && scrollContainerRef.current) {
            hasAutoScrolled.current = true;
            setTimeout(() => {
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTo({
                        top: scrollContainerRef.current.scrollHeight,
                        behavior: 'auto',
                    });
                }
            }, FRONTEND_TIMEOUTS.SCROLL_SETTLE);
        }
    }, [checks, setCanProceed]);

    return {
        itemRefs,
        scrollContainerRef,
        scrollToTop,
        resetAutoScroll,
    };
}
