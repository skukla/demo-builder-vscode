/**
 * Above the datapack grid: which datapacks the SC is looking at, when that is not all of them.
 *
 * The house banner (`InlineNotice`), not a line of text. It replaced an orange paragraph that
 * said the SC had no access to the Data Installer while the grid under it was full of datapacks,
 * then a grey note under the grid that never said what WAS listed (owner, 2026-11-03: "doesn't
 * really explain to the end user what's actually happening on the screen"). So the title says
 * what is on screen and the one line says why.
 *
 * Blue while Demo Builder's own datapacks are listed, amber when they are not. Nothing when the
 * Data Installer is not set up: that is most SCs, and a banner on every visit would be noise.
 *
 * Only "no access" can be closed (owner, 2026-11-03): it is true on every visit and the SC cannot
 * fix it, so after one read it is noise too. The extension remembers it on this machine until the
 * Data Installer answers them. "Didn't answer" passes, and Refresh is its remedy; "Demo Builder's
 * datapacks aren't available" means the screen is mostly broken. Neither closes.
 *
 * With the store down nothing switches the list for the SC (owner, 2026-11-17, walk F215, replacing
 * the 2026-11-14 switch to the Data Installer's): the banner offers Try Again, and Show Data
 * Installer Datapacks while those are answering and not already on view.
 *
 * @module features/data-installer/ui/components/DatapackSourceNotice
 */

import { ActionButton, Button, Flex } from '@adobe/react-spectrum';
import Close from '@spectrum-icons/workflow/Close';
import React from 'react';
import type { CatalogPage } from '../../types';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';

/** The words, in one place. */
export const SOURCE_NOTICE_COPY = {
    ownOnly: "Showing Demo Builder's datapacks",
    noAccess:
        "Your Adobe account can't use the Data Installer, so its datapacks aren't listed. An admin of your Adobe org can add you to it.",
    noAnswer: "The Data Installer isn't responding, so its datapacks aren't listed.",
    storeMissing: "Demo Builder's datapacks aren't available",
    storeMissingLine: "Demo Builder's datapack store didn't answer after three tries.",
    tryAgain: 'Try Again',
    showInstaller: 'Show Data Installer Datapacks',
    dismiss: 'Dismiss',
};

/** Why the Data Installer's datapacks are missing, when that is worth saying: never for no address. */
const INSTALLER_LINES: Partial<Record<NonNullable<CatalogPage['installerMissing']>, string>> = {
    'no-access': SOURCE_NOTICE_COPY.noAccess,
    'no-answer': SOURCE_NOTICE_COPY.noAnswer,
};

interface SourceNoticeProps {
    page: CatalogPage | null;
    onDismiss: () => void;
    /** Ask the store again (the search row's Refresh, so its wait shows where the cards go). */
    onRetry: () => void;
    /** Put the Data Installer's datapacks on view; absent when they are not answering or already shown. */
    onShowInstaller?: () => void;
}

/** The store is down: say so, and offer both ways on. */
function StoreMissing({ onRetry, onShowInstaller }: Pick<SourceNoticeProps, 'onRetry' | 'onShowInstaller'>): React.ReactElement {
    const actions = (
        <Flex gap="size-100">
            {onShowInstaller && (
                <Button variant="secondary" onPress={onShowInstaller}>
                    {SOURCE_NOTICE_COPY.showInstaller}
                </Button>
            )}
            <Button variant="secondary" onPress={onRetry}>
                {SOURCE_NOTICE_COPY.tryAgain}
            </Button>
        </Flex>
    );
    return (
        <InlineNotice title={SOURCE_NOTICE_COPY.storeMissing} action={actions} actionBelow testId="datapack-source-notice">
            {SOURCE_NOTICE_COPY.storeMissingLine}
        </InlineNotice>
    );
}

/**
 * The banner, or nothing when the grid shows everything the SC asked for.
 *
 * @param props - {@link SourceNoticeProps}
 * @returns the banner, or null
 */
export function DatapackSourceNotice({ page, onDismiss, onRetry, onShowInstaller }: SourceNoticeProps): React.ReactElement | null {
    if (!page) return null;
    if (page.storeMissing) return <StoreMissing onRetry={onRetry} onShowInstaller={onShowInstaller} />;
    const line = page.installerMissing ? INSTALLER_LINES[page.installerMissing] : undefined;
    if (!line) return null;
    const noAccess = page.installerMissing === 'no-access';
    if (noAccess && page.noAccessDismissed) return null;
    const close = noAccess ? (
        <ActionButton isQuiet aria-label={SOURCE_NOTICE_COPY.dismiss} onPress={onDismiss}>
            <Close />
        </ActionButton>
    ) : undefined;
    return (
        <InlineNotice tone="info" title={SOURCE_NOTICE_COPY.ownOnly} action={close} testId="datapack-source-notice">
            {line}
        </InlineNotice>
    );
}
