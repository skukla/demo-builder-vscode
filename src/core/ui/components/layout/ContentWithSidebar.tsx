/**
 * ContentWithSidebar — the canonical "content + edge sidebar" layout.
 *
 * The main content sits in a left-aligned column capped at `--content-width`; the
 * sidebar column GROWS so its panel reaches the screen's right edge, while the sidebar's
 * CONTENT is held to a fixed width (so label↔value stays tight inside the wide panel).
 * Stacks at the shared ≤1180 breakpoint (inherited from TwoColumnLayout).
 *
 * This BAKES IN the magic-prop combo that Commerce/Configure assembled by hand
 * (`TwoColumnLayout maxWidth="none"` + a left-zone cap + a summary-content cap), so a
 * screen "chooses" the layout instead of wiring four props. (Commerce itself stays
 * bespoke — it additionally has a left sub-nav.)
 *
 * @module core/ui/components/layout/ContentWithSidebar
 */

import React from 'react';
import { TwoColumnLayout } from './TwoColumnLayout';
import { cn } from '@/core/ui/utils/classNames';

export interface ContentWithSidebarProps {
    /** Main content (the left column). */
    children: React.ReactNode;
    /** Sidebar / summary content (the edge-reaching right panel). */
    sidebar: React.ReactNode;
    /** Max width of the sidebar's INNER content (default 280px) — keeps it tight. */
    sidebarContentWidth?: string;
    /** Additional className for the layout root. */
    className?: string;
}

export const ContentWithSidebar: React.FC<ContentWithSidebarProps> = ({
    children,
    sidebar,
    sidebarContentWidth = '280px',
    className,
}) => (
    <TwoColumnLayout
        // Left-aligned, full-width: the left column is capped at --content-width via CSS
        // (.content-with-sidebar), and the right column flex-grows so its panel reaches
        // the screen edge. The sidebar CONTENT is capped (inner div) so it stays tight.
        maxWidth="none"
        className={cn('content-with-sidebar', className)}
        leftContent={children}
        rightContent={
            <div className="content-sidebar-inner" style={{ maxWidth: sidebarContentWidth }}>
                {sidebar}
            </div>
        }
    />
);
