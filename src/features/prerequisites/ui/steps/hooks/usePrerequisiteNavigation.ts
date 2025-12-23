import { useEffect } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { PrerequisiteCheck } from '@/types/webview';

/**
 * Hook to manage prerequisite checking when navigating to/from the step
 *
 * Handles:
 * - Triggering recheck when navigating back to prerequisites step
 * - Resetting check-in-progress flag when all checks complete
 */
export function usePrerequisiteNavigation(
    currentStep: string | undefined,
    isChecking: boolean,
    checks: PrerequisiteCheck[],
    checkInProgressRef: React.MutableRefObject<boolean>,
    checkPrerequisites: (isRecheck?: boolean) => void,
    resetAutoScroll: () => void,
): void {
    // Trigger prerequisites check when navigating back to this step
    useEffect(() => {
        if (currentStep === 'prerequisites' && !isChecking && !checkInProgressRef.current) {
            checkInProgressRef.current = true;
            resetAutoScroll();

            const timer = setTimeout(() => {
                // When navigating back to prerequisites step, treat as recheck to clear stale cache
                checkPrerequisites(true);
            }, FRONTEND_TIMEOUTS.UI_UPDATE_DELAY);

            return () => {
                clearTimeout(timer);
            };
        }

        return () => {};
    }, [currentStep, isChecking, checkInProgressRef, checkPrerequisites, resetAutoScroll]);

    // Reset the check-in-progress flag when all checks are complete
    useEffect(() => {
        const allDone = checks.every(check =>
            check.status !== 'checking' && check.status !== 'pending',
        );

        if (allDone && checkInProgressRef.current) {
            checkInProgressRef.current = false;
        }
    }, [checks, checkInProgressRef]);
}
