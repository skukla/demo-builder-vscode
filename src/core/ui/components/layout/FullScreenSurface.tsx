/**
 * The house shell for a full-screen webview surface: a sticky header band over a
 * width-constrained body.
 *
 * Four surfaces rendered this identically — `ProjectsDashboard`,
 * `IntegrationsScreen`, `DatapackCatalogView` and `DatapackActivityView` — down to
 * the same three class names in the same nesting and the same `pb-6` on the body.
 * The newest two got it by copying the oldest, which their own docstrings admit;
 * that is one shell rendered four times, not one utility reused four ways
 * (measured by the 2026-08-17 codebase sweep).
 *
 * **Not `PageLayout` + `PageHeader`.** Those are the WIZARD's page shell — a title,
 * subtitle and back affordance in the header’s inner row — and render neither the
 * sticky band nor the padded content column. Different job, checked before this
 * was written.
 *
 * **The class names are load-bearing and stay literal.** `pageContentAlignment`
 * and `DashboardStatusHeader-layout` parse `utilities.css` as TEXT for these
 * selectors and their px values, because jsdom resolves no layout and a rendering
 * test would pass either way. Renaming them here would not fail those suites — it
 * would silently leave the surfaces unstyled.
 *
 * Both bands constrain to `--content-width` (960px). Without them a surface spans
 * the whole panel and its card grid reflows to the wrong column width — the cards
 * are not too big, the band is missing.
 *
 * @module core/ui/components/layout/FullScreenSurface
 */

import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';

export interface FullScreenSurfaceProps {
    /**
     * The sticky band's contents — typically a `SearchHeader`, sometimes wrapped in
     * a `Flex` when the surface has trailing buttons to place. That wrapper stays
     * the caller's: two of the four need one and two do not, and moving it in here
     * would force an empty one on the surfaces that have nothing to place.
     */
    header: React.ReactNode;
    /** The scrolling body. This component supplies its width constraint. */
    children: React.ReactNode;
    /**
     * A pressed Refresh's wait, in the first load's words ("Loading datapacks"): the body gives way
     * to one large spinner where the answer will land, and the band stays (owner, 2026-11-17, walk
     * F214). A re-read nobody pressed passes nothing and keeps the body.
     */
    waiting?: string;
}

/** Room the wait holds, so the band does not jump up while the body is out. */
const WAIT_HEIGHT = 'size-6000';

/**
 * @param props - {@link FullScreenSurfaceProps}
 * @returns the sticky header band followed by the padded content column
 */
export function FullScreenSurface({ header, children, waiting }: FullScreenSurfaceProps): React.JSX.Element {
    return (
        <>
            <div className="projects-sticky-header">
                <div className="page-container-padded page-header-section">{header}</div>
            </div>
            <div className="page-container-padded pb-6">
                {waiting ? (
                    <CenteredFeedbackContainer height={WAIT_HEIGHT}>
                        <LoadingDisplay size="L" message={waiting} />
                    </CenteredFeedbackContainer>
                ) : (
                    children
                )}
            </div>
        </>
    );
}
