/**
 * useSelectedStack Hook
 *
 * Provides direct access to the selected stack from stacks.json.
 * This is the source of truth for frontend/backend/dependencies.
 *
 * Usage:
 * ```tsx
 * const stack = useSelectedStack(state.selectedStack);
 * // stack.frontend, stack.backend, stack.dependencies
 * ```
 */

import { useMemo } from 'react';
import stacksConfig from '../../config/stacks.json';
import type { Stack } from '@/types/stacks';

/**
 * Get the selected stack directly from stacks.json
 *
 * @param selectedStackId - The stack ID from wizard state
 * @returns The stack definition or undefined if not found
 */
export function useSelectedStack(selectedStackId: string | undefined): Stack | undefined {
    return useMemo(() => {
        if (!selectedStackId) return undefined;
        return (stacksConfig.stacks as Stack[]).find(s => s.id === selectedStackId);
    }, [selectedStackId]);
}

/**
 * Get stack by ID (non-hook version for use outside components)
 */
export function getStackById(stackId: string): Stack | undefined {
    return (stacksConfig.stacks as Stack[]).find(s => s.id === stackId);
}
