/**
 * The Share dialog's "Send a file" form: what to include, then one bundle of
 * the ticked parts through the host's save dialog. The two parts that exist are
 * the only ones shown; a dialog is not a roadmap. Moved unchanged from the
 * Export dialog when Export and Save as demo package became one (2026-10-22).
 *
 * @module features/dashboard/ui/components/share/ShareFileForm
 */

import { Button, Checkbox } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { ExportDemoBundleRequest, ExportDemoBundleResult } from '@/types/webviewRequests';

const FILE_COPY = {
    whatFile: 'What to include',
    setup: 'Setup',
    setupWhat: 'Your Commerce, Adobe, GitHub and DA.live settings. Never a credential.',
    storefront: 'Storefront',
    storefrontWhat: "The storefront's code and content site.",
    storefrontHeadless: 'This project has no storefront of its own.',
    saveFile: 'Save file',
    nothingTicked: 'Tick at least one part.',
    fileFailed: "Couldn't save the file.",
} as const;

/** A handler's answer: branch on `success` before reading anything else (webview-command-handler). */
interface Answer<D> {
    success: boolean;
    error?: string;
    data?: D;
}

function savedLine(saved: ExportDemoBundleResult): string {
    const what = (saved.parts ?? []).join(' and ');
    const count = saved.fileCount ?? 0;
    return `Saved ${what} (${count.toLocaleString('en-US')} ${count === 1 ? 'file' : 'files'}) to ${saved.path ?? ''}`;
}

/**
 * The file form.
 *
 * @param props.isEds - Edge Delivery project: the storefront part applies
 * @returns the form
 */
export function ShareFileForm({ isEds }: { isEds: boolean }): React.ReactElement {
    const [setup, setSetup] = useState(true);
    const [storefront, setStorefront] = useState(isEds);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState<ExportDemoBundleResult | undefined>();
    const [error, setError] = useState<string | undefined>();
    const save = (): void => {
        setBusy(true);
        setError(undefined);
        webviewClient
            .request<Answer<ExportDemoBundleResult>>('exportDemoBundle', { setup, storefront } satisfies ExportDemoBundleRequest)
            .then((answer) => {
                if (!answer.success || !answer.data) {
                    setError(answer.error ?? FILE_COPY.fileFailed);
                    return;
                }
                if (!answer.data.cancelled) setSaved(answer.data);
            })
            .catch((failure: Error) => setError(failure.message))
            .finally(() => setBusy(false));
    };
    const nothing = !setup && !storefront;
    return (
        <div className="export-file-form" data-testid="export-file-form">
            <SectionLabel>{FILE_COPY.whatFile}</SectionLabel>
            <ul className="export-parts">
                <li className="export-part">
                    <Checkbox isSelected={setup} onChange={setSetup} data-testid="part-setup">
                        {FILE_COPY.setup}
                    </Checkbox>
                    <span className="export-part-note">{FILE_COPY.setupWhat}</span>
                </li>
                <li className="export-part">
                    <Checkbox isSelected={storefront} onChange={setStorefront} isDisabled={!isEds} data-testid="part-storefront">
                        {FILE_COPY.storefront}
                    </Checkbox>
                    <span className="export-part-note">{isEds ? FILE_COPY.storefrontWhat : FILE_COPY.storefrontHeadless}</span>
                </li>
            </ul>
            <Button variant="accent" onPress={save} isDisabled={nothing} isPending={busy}>
                {FILE_COPY.saveFile}
            </Button>
            {nothing ? <p className="export-part-note">{FILE_COPY.nothingTicked}</p> : null}
            {saved ? <p className="dialog-note" data-testid="export-saved">{savedLine(saved)}</p> : null}
            {error ? <p className="dialog-problem text-negative" data-testid="export-error">{FILE_COPY.fileFailed} {error}</p> : null}
        </div>
    );
}
