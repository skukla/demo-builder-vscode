/**
 * ControlPanelLayout — a masthead over a two-column control body.
 *
 * A full-width MASTHEAD (status header, alert banners) sits above a two-column
 * body:
 *  - PRIMARY column (left): the action surface. It HUGS its content (the action
 *    tiles are intrinsically small and don't fill a wide column), so the detail
 *    column sits right beside it instead of across a gap.
 *  - SECONDARY column (right): the detail surface (integrations / details). Unlike
 *    {@link ContentWithSidebar}'s gray edge-reaching summary panel, this column is
 *    TRANSPARENT with a quiet divider and its inner content capped — the secondary
 *    is primary content, not a summary, so a gray fill to the editor edge would
 *    read as a sea of empty gray. When no `secondary` is provided the primary spans
 *    full width (single column).
 *
 * This BAKES IN the masthead + hug-left + transparent-detail-column combination so
 * the project dashboard "chooses" this layout instead of wiring it by hand — the
 * dedicated counterpart to ContentColumn (single column) and ContentWithSidebar
 * (filled content + gray sidebar). Composed entirely from the existing
 * TwoColumnLayout primitive.
 *
 * @module core/ui/components/layout/ControlPanelLayout
 */

import React from 'react';
import { TwoColumnLayout } from './TwoColumnLayout';
import { cn } from '@/core/ui/utils/classNames';
import { DimensionValue } from '@/core/ui/utils/spectrumTokens';

export interface ControlPanelLayoutProps {
    /** Full-width rows above the columns (status header, alert banners). */
    masthead?: React.ReactNode;
    /** Primary column — the action surface (left, hugs its content). */
    primary: React.ReactNode;
    /** Secondary column — the edge-reaching detail panel. Absent → single column. */
    secondary?: React.ReactNode;
    /** Max width of the secondary panel's INNER content (default '400px'). */
    secondaryContentWidth?: string;
    /** Additional className for the layout root. */
    className?: string;
}

export function ControlPanelLayout({
    masthead,
    primary,
    secondary,
    secondaryContentWidth = '400px',
    className,
}: ControlPanelLayoutProps) {
    return (
        <div className={cn('control-panel', className)}>
            {masthead}
            {secondary ? (
                <TwoColumnLayout
                    // Two left-anchored columns, NOT a gray edge-sidebar. The left
                    // column hugs its content (fit-content) so the detail column sits
                    // right beside the action tiles; the detail column is TRANSPARENT
                    // (the secondary is primary content, not a summary panel — a gray
                    // fill reaching the editor edge reads as a sea of empty gray), with
                    // a quiet divider separating it and its inner content capped.
                    // size-400 left padding aligns the tiles under the masthead content.
                    maxWidth="none"
                    leftMaxWidth={'fit-content' as DimensionValue}
                    leftPadding="size-400"
                    rightBackgroundColor="transparent"
                    leftContent={primary}
                    rightContent={
                        <div
                            className="control-panel-secondary-inner"
                            style={{ maxWidth: secondaryContentWidth, width: '100%' }}
                        >
                            {secondary}
                        </div>
                    }
                    className="control-panel-body"
                />
            ) : (
                // Single-column fallback (no detail panel): match the two-column left
                // padding so the action tiles still align under the masthead content.
                <div className="control-panel-single">{primary}</div>
            )}
        </div>
    );
}
