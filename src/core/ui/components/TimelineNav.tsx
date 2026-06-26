/**
 * TimelineNav - Shared timeline navigation component
 *
 * Used by both the wizard main panel and sidebar to show step progress.
 * Supports both string-based step IDs (wizard) and index-based navigation (sidebar).
 */

import { View, Text } from '@adobe/react-spectrum';
import React from 'react';
import { TimelineChildren } from './TimelineChildren';
import {
    getTimelineLabelClasses,
    getTimelineStepDotClasses,
    renderStepIndicator,
    type TimelineStatus,
    type TimelineStep,
} from './timelineNav.helpers';
import { useEnterExit } from '@/core/ui/hooks/useEnterExit';
import { cn } from '@/core/ui/utils/classNames';

// Re-export the shared timeline types so existing importers keep their
// `from '.../TimelineNav'` path. (Helpers + types live in ./timelineNav.helpers.)
export type { TimelineStatus, TimelineStep };

export interface TimelineNavProps {
    /** Array of steps to display */
    steps: TimelineStep[];
    /** Current step index (0-based) */
    currentStepIndex: number;
    /** Array of completed step indices */
    completedStepIndices: number[];
    /** Array of confirmed step indices (in edit mode, user clicked Continue on these) */
    confirmedStepIndices?: number[];
    /** Callback when step is clicked (receives step index) */
    onStepClick?: (stepIndex: number) => void;
    /** Whether to show the header (default: true) */
    showHeader?: boolean;
    /** Custom header text (default: "Setup Progress") */
    headerText?: string;
    /** Whether to use compact mode (smaller padding, for sidebar) */
    compact?: boolean;
    /** Whether we're in edit mode (reviewing existing project) */
    isEditMode?: boolean;
    /**
     * Optional sub-steps rendered as a single indented level beneath the
     * current (active) parent step only. One level — no recursion.
     */
    childSteps?: TimelineStep[];
    /** Status per child id (defaults to `upcoming` when a child id is absent) */
    childStatusById?: Record<string, TimelineStatus>;
    /** Which child is active/highlighted (gets the `current` styling) */
    activeChildId?: string;
    /**
     * Click handler for a child. Receives the child id. Does NOT affect parent
     * navigation (`onStepClick` / `currentStepIndex` are untouched).
     */
    onChildClick?: (childId: string) => void;
}

export function TimelineNav({
    steps,
    currentStepIndex,
    completedStepIndices,
    confirmedStepIndices: _confirmedStepIndices = [],
    onStepClick,
    showHeader = true,
    headerText = 'Setup Progress',
    compact = false,
    isEditMode: _isEditMode = false,
    childSteps,
    childStatusById,
    activeChildId,
    onChildClick,
}: TimelineNavProps) {
    // Enter/exit orchestration (shared with the area sub-step strip): which steps just
    // appeared (→ timeline-step-enter) and the items to render incl. exiting ones
    // (re-inserted at their old index, → timeline-step-exit) before they're dropped.
    const { displayItems: displaySteps, isEntering: isStepEntering } = useEnterExit(steps);

    const getStepStatus = (index: number): TimelineStatus => {
        const isCompleted = completedStepIndices.includes(index);
        const isCurrent = index === currentStepIndex;

        // Current step is always shown as "current" (blue pulsing)
        // regardless of whether it has data - user is actively viewing it
        if (isCurrent) return 'current';

        // Completed steps show as completed (green checkmark)
        if (isCompleted) return 'completed';

        // Future/incomplete steps
        return 'upcoming';
    };

    const isStepClickable = (index: number) => {
        // Only allow clicking on current step or backward navigation
        // Forward navigation must use Continue button
        return index <= currentStepIndex;
    };

    const handleStepClick = (index: number) => {
        if (onStepClick && isStepClickable(index)) {
            onStepClick(index);
        }
    };

    const padding = compact ? 'size-200' : 'size-400';
    const stepSpacing = compact ? 'var(--spectrum-global-dimension-size-300)' : 'var(--spectrum-global-dimension-size-400)';

    // Add timeline-sidebar class when in compact/sidebar mode
    const containerClass = compact ? 'timeline-container timeline-sidebar' : 'timeline-container';

    return (
        <View
            padding={padding}
            height="100%"
            UNSAFE_className={containerClass}
        >
            {showHeader && (
                <View marginBottom={compact ? 'size-200' : 'size-400'}>
                    <Text UNSAFE_className={cn('text-xs', 'text-uppercase', 'letter-spacing-05', 'text-gray-600', 'font-semibold', 'timeline-header-label')}>
                        {headerText}
                    </Text>
                </View>
            )}

            <View position="relative">
                {/* Steps */}
                {displaySteps.map((step, displayIndex) => {
                    // For exiting steps, use 'upcoming' status (grayed out)
                    // For normal steps, calculate status based on position in actual steps array
                    const actualIndex = step.isExiting ? -1 : steps.findIndex(s => s.id === step.id);
                    const status = step.isExiting ? 'upcoming' : getStepStatus(actualIndex);
                    const isClickable = !step.isExiting && isStepClickable(actualIndex);
                    const isEntering = isStepEntering(step.id);
                    const isExiting = step.isExiting;
                    // When the current step shows children, its bottom spacing moves to
                    // the children block (small gap above the first child, full step-gap
                    // below the last) so the rail rhythm stays even.
                    const isCurrentWithChildren =
                        !step.isExiting && status === 'current' && (childSteps?.length ?? 0) > 0;

                    return (
                        <View
                            key={step.id}
                            position="relative"
                            paddingBottom={isCurrentWithChildren ? 'size-400' : undefined}
                            // While children show, clip the tall stretch connector at the
                            // wrapper's bottom so it ends exactly at the next step.
                            UNSAFE_className={isCurrentWithChildren ? 'timeline-step-wrap-clip' : undefined}
                        >
                            {/* Step item - role/tabIndex/keyboard conditionally applied when clickable */}
                            {/* The `data-step-name` attribute powers a CSS-only `::after` tooltip in
                                custom-spectrum.css, scoped to the rail-collapse media query — it shows
                                each step's name on hover ONLY when the rail is collapsed (labels are
                                hidden by then), and is structurally inert at wider viewports. */}
                            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- role and tabIndex are conditionally set when isClickable; non-clickable steps are inert */}
                            <div
                                data-testid={`timeline-step-${step.id}`}
                                data-step-name={step.name}
                                role={isClickable ? 'button' : undefined}
                                tabIndex={isClickable ? 0 : undefined}
                                aria-current={!step.isExiting && actualIndex === currentStepIndex ? 'step' : undefined}
                                aria-label={step.name}
                                style={{
                                    marginBottom: displayIndex < displaySteps.length - 1 && !isCurrentWithChildren ? stepSpacing : undefined,
                                    // Staggered animation delay for cascade effect
                                    animationDelay: isEntering ? `${displayIndex * 40}ms` : undefined,
                                }}
                                className={cn(
                                    'timeline-step',
                                    isClickable ? 'cursor-pointer' : 'cursor-default',
                                    status === 'upcoming' ? 'opacity-50' : 'opacity-100',
                                    'transition-opacity',
                                    isEntering && 'timeline-step-enter',
                                    isExiting && 'timeline-step-exit',
                                )}
                                onClick={() => !step.isExiting && handleStepClick(actualIndex)}
                                onKeyDown={(e) => {
                                    if ((e.key === 'Enter' || e.key === ' ') && !step.isExiting) {
                                        e.preventDefault();
                                        handleStepClick(actualIndex);
                                    }
                                }}
                            >
                                <View
                                    UNSAFE_className="nav-item-row"
                                >
                                    {/* Step indicator dot — also the positioning ANCHOR for the
                                        connector below it, so the line centers on the dot's own box
                                        (responsive at any scale; no wrapper-offset possible). */}
                                    <View
                                        width="size-300"
                                        height="size-300"
                                        UNSAFE_className={cn(getTimelineStepDotClasses(status), 'shrink-0')}
                                    >
                                        {renderStepIndicator(status)}
                                        {/* Dotted connector after each step except the last. */}
                                        {displayIndex < displaySteps.length - 1 && (
                                            <View
                                                UNSAFE_className={cn(
                                                    'timeline-connector',
                                                    status === 'completed' ? 'timeline-connector-completed' : 'timeline-connector-pending',
                                                    // Stretch past the indented children to the next dot.
                                                    isCurrentWithChildren && 'timeline-connector-stretch',
                                                )}
                                            />
                                        )}
                                    </View>

                                    {/* Step label */}
                                    <Text
                                        UNSAFE_className={cn(getTimelineLabelClasses(status), 'timeline-step-label')}
                                    >
                                        {step.name}
                                    </Text>
                                </View>
                            </div>

                            {/* Nested sub-steps: one indented level under the current parent only */}
                            {!step.isExiting && status === 'current' && (
                                <TimelineChildren
                                    parentId={step.id}
                                    childSteps={childSteps ?? []}
                                    childStatusById={childStatusById}
                                    activeChildId={activeChildId}
                                    onChildClick={onChildClick}
                                />
                            )}
                        </View>
                    );
                })}
            </View>

            <style>{`
                @keyframes pulse {
                    0% {
                        transform: scale(1);
                        opacity: 1;
                    }
                    50% {
                        transform: scale(1.5);
                        opacity: 0.5;
                    }
                    100% {
                        transform: scale(1);
                        opacity: 1;
                    }
                }
            `}</style>
        </View>
    );
}
