/**
 * InlineNotice
 *
 * A compact, horizontal, accent-bordered banner that sits ABOVE content without
 * replacing it. The house treatment for "something needs your attention, and
 * you can still work".
 *
 * **Pick this over {@link StatusDisplay} when the user is not blocked.**
 * `StatusDisplay` centres a large icon and heading in the whole pane, which
 * reads as a wall — right when the screen genuinely has nothing else to offer,
 * wrong for a warning printed above a form the user is still filling in. A
 * non-`main` default branch rendered as a full-pane `StatusDisplay` swallowed
 * the repo picker and looked fatal while Continue was one checkbox away
 * (reported 2026-08-20).
 *
 * Extracted from the dashboard's org-mismatch banner, which was the only place
 * this shape existed. Its markup was already generic; only the class names
 * (`dashboard-org-banner-*`) were parochial, and they moved with it.
 *
 * @module core/ui/components/feedback/InlineNotice
 */

import { Text } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface InlineNoticeProps {
    /** Bold first line — name the condition, not the remedy. */
    title: string;
    /** The explanation, and what the user can do about it. */
    children: React.ReactNode;
    /** Amber (default) for something to act on; blue for context. */
    tone?: 'warning' | 'info';
    /** Optional secondary line, rendered smaller and dimmer. */
    hint?: React.ReactNode;
    /** Optional right-hand action — a Button, typically. Never shrinks. */
    action?: React.ReactNode;
    /** Hook for tests and for callers that need to find their own banner. */
    testId?: string;
}

/**
 * Render an inline notice.
 *
 * @param props - See {@link InlineNoticeProps}
 * @returns The banner
 */
export function InlineNotice({
    title,
    children,
    tone = 'warning',
    hint,
    action,
    testId,
}: InlineNoticeProps): React.ReactElement {
    const Icon = tone === 'info' ? InfoOutline : AlertCircle;
    return (
        // The modifier spelled out, not built from `tone`: the bundle-stylesheet scan reads
        // literal class names and counts a template as a blind spot in every bundle that
        // renders this. Reading it showed `inline-notice--warning` was styled nowhere —
        // warning is the base look — so only the info modifier exists (ADR-017 §6, 2026-10-01).
        <div className={cn('inline-notice', tone === 'info' && 'inline-notice--info')} data-testid={testId}>
            <Icon size="S" UNSAFE_className="inline-notice-icon" />
            <div className="inline-notice-body">
                <Text UNSAFE_className="inline-notice-title">{title}</Text>
                <Text UNSAFE_className="status-text">{children}</Text>
                {hint && <Text UNSAFE_className="inline-notice-hint">{hint}</Text>}
            </div>
            {action && <div className="inline-notice-actions">{action}</div>}
        </div>
    );
}
