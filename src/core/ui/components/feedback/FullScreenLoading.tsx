/**
 * The first-load view of a full-screen surface: one large spinner, centred in the
 * whole window, before the surface has anything to draw.
 *
 * Four surfaces wrote this block by hand (Your Projects, Integrations, and the Data
 * Installer's catalog and activity), and Site Access drew its first read as a small
 * bar at the top left instead (EDS-41). Not `CenteredFeedbackContainer`: that takes
 * a FIXED height for in-panel feedback and cannot express "fill this screen".
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
}

/**
 * @param props - {@link FullScreenLoadingProps}
 * @returns the centred, window-filling loading view
 */
export function FullScreenLoading({ message, backgroundColor }: FullScreenLoadingProps): React.JSX.Element {
    return (
        <View height="100vh" backgroundColor={backgroundColor}>
            <Flex justifyContent="center" alignItems="center" height="100%">
                <LoadingDisplay size="L" message={message} />
            </Flex>
        </View>
    );
}
