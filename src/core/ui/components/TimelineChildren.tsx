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
import {
    getTimelineLabelClasses,
    getTimelineStepDotClasses,
    renderStepIndicator,
    type TimelineStatus,
    type TimelineStep,
} from './timelineNav.helpers';
import { cn } from '@/core/ui/utils/classNames';

/** Child sub-step spacing — tighter than the parent rhythm to read as a sub-level. */
const CHILD_SPACING = 'var(--spectrum-global-dimension-size-200)';
/** Small gap from the parent label down to the first child. */
const CHILD_TOP_GAP = 'size-150';
const CHILD_INDENT = 'size-300';

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
            marginTop={CHILD_TOP_GAP}
            marginStart={CHILD_INDENT}
            position="relative"
        >
            {childSteps.map((child, childIndex) => {
                const childStatus: TimelineStatus = child.id === activeChildId
                    ? 'current'
                    : (childStatusById?.[child.id] ?? 'upcoming');
                const isLastChild = childIndex === childSteps.length - 1;

                return (
                    <View key={child.id} position="relative">
                        <div
                            data-testid={`timeline-child-${child.id}`}
                            role="button"
                            tabIndex={0}
                            aria-current={child.id === activeChildId ? 'step' : undefined}
                            aria-label={child.name}
                            style={{ marginBottom: isLastChild ? undefined : CHILD_SPACING }}
                            className={cn(
                                'timeline-step',
                                'timeline-child',
                                'cursor-pointer',
                                childStatus === 'upcoming' ? 'opacity-50' : 'opacity-100',
                                'transition-opacity',
                            )}
                            onClick={() => handleChildClick(child.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleChildClick(child.id);
                                }
                            }}
                        >
                            <View UNSAFE_className="nav-item-row">
                                {/* Child indicator dot (smaller scale via timeline-child-dot) */}
                                <View
                                    width="size-200"
                                    height="size-200"
                                    UNSAFE_className={cn(
                                        getTimelineStepDotClasses(childStatus),
                                        'timeline-child-dot',
                                        'shrink-0',
                                    )}
                                >
                                    {renderStepIndicator(childStatus)}
                                </View>

                                <Text
                                    UNSAFE_className={cn(
                                        getTimelineLabelClasses(childStatus),
                                        'timeline-step-label',
                                    )}
                                >
                                    {child.name}
                                </Text>
                            </View>
                        </div>
                    </View>
                );
            })}
        </View>
    );
}
