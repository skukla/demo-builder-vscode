/**
 * The filter's note when its matches sit under another Show choice (Clarity 1.13, step-04 S10):
 * "No matches in Recommended. 2 in All Datapacks." and a "Show All Datapacks" button that switches
 * the list there. The Datapacks screen and the wizard's Datapacks step both have the Show list and
 * the filter box (`useCatalogShow`), so both draw it, each inside its own quiet note's element.
 *
 * Considered `feedback/EmptyState`: it is a block with a title for a list with nothing in it at
 * all, and this is one line under a filter that found its packs elsewhere.
 *
 * @module features/data-installer/ui/components/ShowElsewhereNote
 */

import { ActionButton } from '@adobe/react-spectrum';
import React from 'react';
import { elsewhereWords, type CatalogShow, type ShowElsewhere } from '../catalogShow';

/**
 * The way to each choice, written out so the Title Case scan reads every label (a label built at
 * run time is one it cannot check). Each is "Show" and the choice's name in `SHOW_OPTIONS`.
 */
const SHOW_LINK: Readonly<Record<CatalogShow, string>> = {
    recommended: 'Show Recommended',
    yours: 'Show My Datapacks',
    team: 'Show Demo Builder Datapacks',
    installer: 'Show Data Installer Datapacks',
    community: 'Show Community Datapacks',
    all: 'Show All Datapacks',
};

export interface ShowElsewhereNoteProps {
    /** The choice on view. */
    show: CatalogShow;
    /** Where the filter's matches are. */
    elsewhere: ShowElsewhere;
    /** Switch the Show list. */
    onShow: (show: CatalogShow) => void;
}

/** The sentence, then the way there. */
export function ShowElsewhereNote({
    show,
    elsewhere,
    onShow,
}: ShowElsewhereNoteProps): React.JSX.Element {
    return (
        <>
            {elsewhereWords(show, elsewhere)}{' '}
            <ActionButton isQuiet onPress={() => onShow(elsewhere.show)}>
                {SHOW_LINK[elsewhere.show]}
            </ActionButton>
        </>
    );
}
