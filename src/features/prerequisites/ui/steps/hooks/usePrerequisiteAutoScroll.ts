import { useEffect, useRef, useCallback } from 'react';
import { useAutoScroll } from '@/core/ui/hooks/useAutoScroll';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { PrerequisiteCheck } from '@/types/webview';

interface UsePrerequisiteAutoScrollReturn {
    /** The ref setter for check `index`'s row. */
    createItemRef: (index: number) => (el: HTMLDivElement | null) => void;
    resetAutoScroll: () => void;
}

/**
 * Hook to manage auto-scroll behavior for prerequisites list
 *
 * Handles:
 * - Auto-scroll to currently checking item (the shared `useAutoScroll`, which the
 *   Updates run uses too; this hook kept its own copy of the same geometry until F290)
 * - Auto-scroll to bottom when all complete
 * - Reset scroll state when rechecking
 *
 * @param checks - Current prerequisite checks
 * @param setCanProceed - Callback to update navigation state
 * @param scrollContainerRef - Ref to the scroll container (passed from component)
 */
export function usePrerequisiteAutoScroll(
    checks: PrerequisiteCheck[],
    setCanProceed: (value: boolean) => void,
    scrollContainerRef: React.MutableRefObject<HTMLDivElement | null>,
): UsePrerequisiteAutoScrollReturn {
    const { createItemRef, scrollToItem } = useAutoScroll({ containerRef: scrollContainerRef, delay: 0 });
    const hasAutoScrolled = useRef<boolean>(false);

    // Reset auto-scroll flag (used when navigating back to step)
    const resetAutoScroll = useCallback(() => {
        hasAutoScrolled.current = false;
    }, []);

    // Auto-scroll when prerequisite status changes to 'checking' (the first is already in view)
    useEffect(() => {
        const checkingIndex = checks.findIndex(c => c.status === 'checking');
        if (checkingIndex > 0) scrollToItem(checkingIndex);
    }, [checks, scrollToItem]);

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
    }, [checks, setCanProceed, scrollContainerRef]);

    return {
        createItemRef,
        resetAutoScroll,
    };
}
