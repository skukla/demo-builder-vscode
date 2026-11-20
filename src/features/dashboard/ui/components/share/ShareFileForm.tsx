/**
 * The Share dialog's "Send a file" form: what to include, then one bundle of
 * the ticked parts through the host's save dialog (Save File, in the window's footer). The two parts that exist are
 * the only ones shown; a dialog is not a roadmap.
 *
 * Fixed the link step's way (owner, 2026-11-18, walk F230): a datapack only the SC can see comes
 * first, as the link step's amber notice with Share Datapack (`ShareChecks`), since the file
 * names the pack and colleagues cannot install its data until it is shared; then the parts, each
 * a house checkbox row with its line under it. Nothing arrives under the boxes (walk F238):
 * nothing ticked greys Save File, and how a save ended, saved or not, is the result window
 * (`ShareResult`), so the window holds no room and fits the form.
 *
 * @module features/dashboard/ui/components/share/ShareFileForm
 */

import React from 'react';
import { ShareChecks } from './ShareChecks';
import type { ShareDatapackFix } from './useShareDatapack';
import type { UseShareFile } from './useShareFile';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import type { DemoPackageCheck } from '@/types/webviewRequests';

const FILE_COPY = {
    whatFile: 'What to Include',
    setup: 'Setup',
    setupWhat: 'Your Commerce, Adobe, GitHub, DA.live and integration settings.',
    storefront: 'Storefront',
    storefrontWhat: "The storefront's code and content site.",
    storefrontHeadless: 'This project has no storefront of its own.',
} as const;

/**
 * The file's own checks: the datapack's, and each custom integration's, since the file names
 * their repositories rather than carrying their code (walk F240). The repository and published
 * pages are the link's concern: the file carries the storefront's code and content.
 */
function fileChecks(checks: DemoPackageCheck[]): DemoPackageCheck[] {
    return checks.filter((check) => check.id === 'datapack' || check.id === 'custom-app');
}

export interface ShareFileFormProps {
    /** Edge Delivery project: the storefront part applies. */
    isEds: boolean;
    /** The form's state (`useShareFile`). */
    file: UseShareFile;
    /** The checks the dialog read on open; only the datapack's is shown here. */
    checks: DemoPackageCheck[];
    /** Share Datapack, the fix on a pack only the SC can see (`useShareDatapack`). */
    fix: ShareDatapackFix;
}

/**
 * The file form; its Save File is the window's footer button (step-07 Win2).
 *
 * @param props - see {@link ShareFileFormProps}
 * @returns the form
 */
export function ShareFileForm({ isEds, file, checks, fix }: ShareFileFormProps): React.ReactElement {
    return (
        <div className="export-file-form" data-testid="export-file-form">
            <ShareChecks checks={fileChecks(checks)} fix={fix} />
            {/* No heading over the boxes (walk F233): small and grey, it read fainter than the rows it headed. */}
            <div className="export-parts" role="group" aria-label={FILE_COPY.whatFile}>
                <CheckboxRow
                    label={FILE_COPY.setup}
                    help={FILE_COPY.setupWhat}
                    isSelected={file.setup}
                    onChange={() => file.setSetup(!file.setup)}
                />
                <CheckboxRow
                    label={FILE_COPY.storefront}
                    help={isEds ? FILE_COPY.storefrontWhat : FILE_COPY.storefrontHeadless}
                    isSelected={file.storefront}
                    isDisabled={!isEds}
                    onChange={() => file.setStorefront(!file.storefront)}
                />
            </div>
        </div>
    );
}
