/**
 * ContentColumn — the canonical single content column for wizard/app screens.
 *
 * Left-aligned, capped at the shared `--content-width` (960px), with standard padding.
 * A DEDICATED layout so a screen "chooses the standard content column" instead of
 * re-configuring `SingleColumnLayout`'s width every time — the canonical width lives in
 * exactly one place (the CSS var). For non-standard widths (e.g. narrow status screens),
 * use the lower-level `SingleColumnLayout` or the dedicated status layout instead.
 *
 * @module core/ui/components/layout/ContentColumn
 */

import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface ContentColumnProps {
    /** Column content. */
    children: React.ReactNode;
    /** Additional className for the column. */
    className?: string;
}

export const ContentColumn: React.FC<ContentColumnProps> = ({ children, className }) => (
    <div className={cn('content-column', className)}>{children}</div>
);
