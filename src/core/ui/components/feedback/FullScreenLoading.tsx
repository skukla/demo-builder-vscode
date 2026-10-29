/**
 * The first-load view of a full-screen surface: one large spinner, centred in the
 * whole window, before the surface has anything to draw.
 *
 * Four surfaces wrote this block by hand (Your Projects, Integrations, and the Data
 * Installer's catalog and activity), and Site Access drew its first read as a small
 * bar at the top left instead (EDS-41). Not `CenteredFeedbackContainer`: that takes
 * a FIXED height for in-panel feedback and cannot express "fill this screen".
 *
 * A surface that has already drawn its header and tabs in the left-aligned content
 * column (`.page-container-padded`, 960px) passes `withinContentColumn`, so the
 * spinner is centred under them rather than across the whole window (the Data
 * Installer, 2026-10-29).
 *
 * @module core/ui/components/feedback/FullScreenLoading
 */

import { Flex, View } from '@adobe/react-spectrum';
import React from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';

export interface FullScreenLoadingProps {
    /** What is loading, e.g. "Loading projects". */
    message: string;
    /** The surface's own page colour, when it sets one, so the gate does not flash. */
    backgroundColor?: 'gray-50';
    /**
     * Centre in the page's content column, in the space left under a header and tabs
     * already drawn there. The parent must be a filling column (`flex flex-column h-full`).
     */
    withinContentColumn?: boolean;
}

/**
 * @param props - {@link FullScreenLoadingProps}
 * @returns the centred, window-filling loading view
 */
export function FullScreenLoading({
    message,
    backgroundColor,
    withinContentColumn,
}: FullScreenLoadingProps): React.JSX.Element {
    const spinner = (
        <Flex justifyContent="center" alignItems="center" height="100%">
            <LoadingDisplay size="L" message={message} />
        </Flex>
    );
    if (withinContentColumn) {
        // Takes the space left under the surface's header and tabs (its parent is a
        // filling column), rather than a window's height that starts below them.
        return <div className="page-container-padded flex-1">{spinner}</div>;
    }
    return (
        <View height="100vh" backgroundColor={backgroundColor}>
            {spinner}
        </View>
    );
}
