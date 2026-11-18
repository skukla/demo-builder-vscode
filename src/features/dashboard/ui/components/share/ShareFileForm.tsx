/**
 * The Share dialog's "Send a file" form: what to include, then one bundle of
 * the ticked parts through the host's save dialog (Save File, in the window's footer). The two parts that exist are
 * the only ones shown; a dialog is not a roadmap.
 *
 * Fixed the link step's way (owner, 2026-11-18, walk F230): a datapack only the SC can see comes
 * first, as the link step's amber notice with Share Datapack (`ShareChecks`), since the file
 * names the pack and colleagues cannot install its data until it is shared; then the parts, each
 * a house checkbox row with its line as the row's quieter detail.
 *
 * @module features/dashboard/ui/components/share/ShareFileForm
 */

import React from 'react';
import { ShareChecks } from './ShareChecks';
import type { ShareDatapackFix } from './useShareDatapack';
import { FILE_FAILED, type UseShareFile } from './useShareFile';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import type { DemoPackageCheck, ExportDemoBundleResult } from '@/types/webviewRequests';

const FILE_COPY = {
    whatFile: 'What to Include',
    setup: 'Setup',
    setupWhat: 'Your Commerce, Adobe, GitHub and DA.live settings. Never a credential.',
    storefront: 'Storefront',
    storefrontWhat: "The storefront's code and content site.",
    storefrontHeadless: 'This project has no storefront of its own.',
    nothingTicked: 'Select at least one part.',
} as const;

function savedLine(saved: ExportDemoBundleResult): string {
    const what = (saved.parts ?? []).join(' and ');
    const count = saved.fileCount ?? 0;
    return `Saved ${what} (${count.toLocaleString('en-US')} ${count === 1 ? 'file' : 'files'}) to ${saved.path ?? ''}`;
}

/** The file's own check: the datapack's. The repository and published pages are the link's concern. */
function datapackOnly(checks: DemoPackageCheck[]): DemoPackageCheck[] {
    return checks.filter((check) => check.id === 'datapack');
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
            <ShareChecks checks={datapackOnly(checks)} fix={fix} />
            <SectionLabel>{FILE_COPY.whatFile}</SectionLabel>
            <div className="export-parts">
                <CheckboxRow
                    label={FILE_COPY.setup}
                    detail={FILE_COPY.setupWhat}
                    isSelected={file.setup}
                    onChange={() => file.setSetup(!file.setup)}
                />
                <CheckboxRow
                    label={FILE_COPY.storefront}
                    detail={isEds ? FILE_COPY.storefrontWhat : FILE_COPY.storefrontHeadless}
                    isSelected={file.storefront}
                    isDisabled={!isEds}
                    onChange={() => file.setStorefront(!file.storefront)}
                />
            </div>
            {file.nothing ? <p className="export-part-note">{FILE_COPY.nothingTicked}</p> : null}
            {file.saved ? <p className="dialog-note" data-testid="export-saved">{savedLine(file.saved)}</p> : null}
            {file.error ? <p className="dialog-problem text-negative" data-testid="export-error">{FILE_FAILED} {file.error}</p> : null}
        </div>
    );
}
