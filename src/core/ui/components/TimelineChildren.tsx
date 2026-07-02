/**
 * TimelineChildren - the one nested sub-step level rendered beneath the current
 * parent step in TimelineNav. Kept as a sibling component so TimelineNav stays
 * within the file-size limit and the sub-step rail is isolated.
 *
 * Independent of parent navigation: a child click calls `onChildClick` only —
 * it never touches the parent `onStepClick` / `currentStepIndex`.
 */

import { View, Text } from '@adobe/react-spectrum';
import React from 'react';
import { type TimelineStatus, type TimelineStep } from './timelineNav.helpers';
import { cn } from '@/core/ui/utils/classNames';

/** Small gap from the parent label down to the first child. */
const CHILD_TOP_GAP = 'size-150';
/** Indent the sub-rail well clear of the parent's dotted spine so the active
 *  child's accent bar reads as a sub-level marker, not a second rail. */
const CHILD_INDENT = 'size-500';

export interface TimelineChildrenProps {
    /** Parent step id (used for the container test id). */
    parentId: string;
    /** Sub-steps to render under the current parent. */
    childSteps: TimelineStep[];
    /** Status per child id (defaults to `upcoming` when absent). */
    childStatusById?: Record<string, TimelineStatus>;
    /** Active/highlighted child id (gets `current` styling). */
    activeChildId?: string;
    /** Child click handler — receives the child id. Does NOT affect parent nav. */
    onChildClick?: (childId: string) => void;
}

/**
 * The indented nested sub-step rail. Renders nothing when there are no children.
 *
 * @param props - {@link TimelineChildrenProps}
 * @returns The child rail, or null when empty
 */
export function TimelineChildren({
    parentId,
    childSteps,
    childStatusById,
    activeChildId,
    onChildClick,
}: TimelineChildrenProps) {
    if (!childSteps || childSteps.length === 0) {
        return null;
    }

    const handleChildClick = (childId: string) => {
        // Independent of parent nav: never touches onStepClick / currentStepIndex.
        onChildClick?.(childId);
    };

    return (
        <View
            data-testid={`timeline-children-${parentId}`}
            UNSAFE_className="timeline-children"
            marginTop={CHILD_TOP_GAP}
            marginStart={CHILD_INDENT}
            position="relative"
        >
            {childSteps.map((child) => {
                const isActive = child.id === activeChildId;
                // Status only tiers the quiet label (done a touch darker than upcoming);
                // there are no per-child dots or checkmarks now (the active accent bar +
                // weight carry "where you are", mirroring the in-body VerticalStepList nav).
                const status: TimelineStatus = isActive
                    ? 'current'
                    : (childStatusById?.[child.id] ?? 'upcoming');
                const isDone = status === 'completed' || status === 'completed-current';

                return (
                    <div
                        key={child.id}
                        data-testid={`timeline-child-${child.id}`}
                        role="button"
                        tabIndex={0}
                        aria-current={isActive ? 'step' : undefined}
                        aria-label={child.name}
                        className={cn(
                            'timeline-child',
                            'cursor-pointer',
                            isActive && 'timeline-child--active',
                            !isActive && isDone && 'timeline-child--done',
                        )}
                        onClick={() => handleChildClick(child.id)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleChildClick(child.id);
                            }
                        }}
                    >
                        <Text UNSAFE_className="timeline-child-label">{child.name}</Text>
                    </div>
                );
            })}
        </View>
    );
}
