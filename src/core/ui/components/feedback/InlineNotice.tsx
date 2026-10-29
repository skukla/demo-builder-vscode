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
import CheckmarkCircleOutline from '@spectrum-icons/workflow/CheckmarkCircleOutline';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface InlineNoticeProps {
    /** Bold first line — name the condition, not the remedy. */
    title: string;
    /**
     * The explanation, and what the user can do about it. Omit it for a one-line
     * notice whose title says everything (the store pickers' "Guests won't see
     * any products in this store view.").
     */
    children?: React.ReactNode;
    /**
     * Amber (default) for something to act on; blue for context; green for something that
     * finished and worked. Green was added 2026-10-28 (release test row 4.19): until then a
     * finished step's "Done" and Site access's success both drew the blue info icon.
     */
    tone?: 'warning' | 'info' | 'success';
    /** Optional secondary line, rendered smaller and dimmer. */
    hint?: React.ReactNode;
    /** Optional right-hand action — a Button, typically. Never shrinks. */
    action?: React.ReactNode;
    /**
     * Put the action UNDER the text instead of beside it. For a long message
     * with several buttons, where the side column squeezes the text into a
     * narrow strip (Site access's "reinstall Code Sync" steps, 2026-10-07).
     */
    actionBelow?: boolean;
    /** Hook for tests and for callers that need to find their own banner. */
    testId?: string;
}

/** Each tone's icon: Spectrum's workflow outlines, at the banner's size. */
const ICONS = { warning: AlertCircle, info: InfoOutline, success: CheckmarkCircleOutline } as const;

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
    actionBelow = false,
    testId,
}: InlineNoticeProps): React.ReactElement {
    const Icon = ICONS[tone];
    return (
        // The modifier spelled out, not built from `tone`: the bundle-stylesheet scan reads
        // literal class names and counts a template as a blind spot in every bundle that
        // renders this. Reading it showed `inline-notice--warning` was styled nowhere —
        // warning is the base look — so only the info and success modifiers exist (ADR-017 §6, 2026-10-01).
        <div
            className={cn('inline-notice', tone === 'info' && 'inline-notice--info', tone === 'success' && 'inline-notice--success')}
            data-testid={testId}
        >
            <Icon size="S" UNSAFE_className="inline-notice-icon" />
            <div className="inline-notice-body">
                <Text UNSAFE_className="inline-notice-title">{title}</Text>
                {children && <Text UNSAFE_className="status-text">{children}</Text>}
                {hint && <Text UNSAFE_className="inline-notice-hint">{hint}</Text>}
                {action && actionBelow && <div className="inline-notice-actions">{action}</div>}
            </div>
            {action && !actionBelow && <div className="inline-notice-actions">{action}</div>}
        </div>
    );
}
