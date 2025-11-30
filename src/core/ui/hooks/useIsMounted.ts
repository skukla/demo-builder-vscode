import { useRef, useEffect } from 'react';

/**
 * Returns a ref that tracks whether the component is mounted.
 * Use to prevent state updates after unmount.
 *
 * @example
 * const isMounted = useIsMounted();
 *
 * const loadData = async () => {
 *   const result = await fetchData();
 *   if (isMounted.current) {
 *     setData(result); // Safe - won't update unmounted component
 *   }
 * };
 */
export function useIsMounted(): React.RefObject<boolean> {
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    return isMountedRef;
}
