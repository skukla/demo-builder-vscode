/**
 * The Share dialog's "Send a file" form: what to include, then one bundle of
 * the ticked parts through the host's save dialog (Save File, in the window's footer). The two parts that exist are
 * the only ones shown; a dialog is not a roadmap. Moved unchanged from the
 * Export dialog when Export and Save as demo package became one (2026-10-22).
 *
 * @module features/dashboard/ui/components/share/ShareFileForm
 */

import { Checkbox } from '@adobe/react-spectrum';
import React from 'react';
import { FILE_FAILED, type UseShareFile } from './useShareFile';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import type { ExportDemoBundleResult } from '@/types/webviewRequests';

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

/**
 * The file form; its Save File is the window's footer button (step-07 Win2).
 *
 * @param props.isEds - Edge Delivery project: the storefront part applies
 * @param props.file - the form's state (`useShareFile`)
 * @returns the form
 */
export function ShareFileForm({ isEds, file }: { isEds: boolean; file: UseShareFile }): React.ReactElement {
    return (
        <div className="export-file-form" data-testid="export-file-form">
            <SectionLabel>{FILE_COPY.whatFile}</SectionLabel>
            <ul className="export-parts">
                <li className="export-part">
                    <Checkbox isSelected={file.setup} onChange={file.setSetup} data-testid="part-setup">
                        {FILE_COPY.setup}
                    </Checkbox>
                    <span className="export-part-note">{FILE_COPY.setupWhat}</span>
                </li>
                <li className="export-part">
                    <Checkbox isSelected={file.storefront} onChange={file.setStorefront} isDisabled={!isEds} data-testid="part-storefront">
                        {FILE_COPY.storefront}
                    </Checkbox>
                    <span className="export-part-note">{isEds ? FILE_COPY.storefrontWhat : FILE_COPY.storefrontHeadless}</span>
                </li>
            </ul>
            {file.nothing ? <p className="export-part-note">{FILE_COPY.nothingTicked}</p> : null}
            {file.saved ? <p className="dialog-note" data-testid="export-saved">{savedLine(file.saved)}</p> : null}
            {file.error ? <p className="dialog-problem text-negative" data-testid="export-error">{FILE_FAILED} {file.error}</p> : null}
        </div>
    );
}
