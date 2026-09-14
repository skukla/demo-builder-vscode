/**
 * ExportModal — hand this demo to someone else (owner, 2026-09-13). Two
 * questions, not one list: HOW it travels (a link, when the colleague can reach
 * your GitHub and the shared services; a file, when they cannot) and WHAT
 * leaves (the parts). Parts not built yet are shown greyed so the shape is
 * visible. Sending the storefront by link needs it to be a demo package, which
 * is the SC's own act in its own door ("Save as demo package"); Export points
 * there rather than saving silently.
 *
 * @module features/dashboard/ui/components/export/ExportModal
 */

import { Button, Checkbox, DialogContainer } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CopyableText } from '@/core/ui/components/ui/CopyableText';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import { ChoiceCard } from '@/features/project-creation/ui/components/ChoiceCard';
import type { DemoPackagePreview, ExportDemoBundleRequest, ExportDemoBundleResult } from '@/types/webviewRequests';

export type ExportForm = 'link' | 'file';

export const EXPORT_COPY = {
    title: 'Export',
    how: 'How will you hand it over?',
    link: 'Send a link',
    linkWhy: 'For a colleague who can reach your GitHub. Keeps the history, and they get your later changes.',
    file: 'Send a file',
    fileWhy: "For a colleague who can't. One zip with the parts you tick. No history, no later changes.",
    what: 'What goes',
    setup: 'Setup',
    setupWhat: 'Your Commerce, Adobe, GitHub and DA.live settings. Never a credential.',
    setupNoLink: 'Travels as a file.',
    storefront: 'Storefront',
    storefrontWhat: "The storefront's code and content site, with the demo's description.",
    storefrontHeadless: 'This project has no storefront of its own.',
    notYet: 'Not yet.',
    datapack: 'Datapack',
    content: 'Content',
    integrations: 'Integrations',
    looking: 'Checking the storefront',
    isPackage: 'Your storefront is a demo package. Send this link:',
    linkHow: 'Colleagues paste it into "Add a demo", or hand it to their agent.',
    notPackage: "Your storefront isn't a demo package yet",
    notPackageWhy: 'A colleague\'s "Add a demo" reads the description file a demo package carries. Save it as one, then the link works.',
    savePackage: 'Save as demo package…',
    saveFile: 'Save file…',
    saving: 'Saving…',
    nothingTicked: 'Tick at least one part.',
    fileFailed: "Couldn't save the file",
} as const;

/** A handler's answer: branch on `success` before reading anything else (webview-command-handler). */
interface Answer<D> {
    success: boolean;
    error?: string;
    data?: D;
}

export interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Edge Delivery project: the storefront part applies. */
    isEds: boolean;
    /** Opens "Save as demo package" (the link form's missing prerequisite). */
    onSaveDemoPackage: () => void;
}

function FormChoice({ form, onChange }: { form: ExportForm; onChange: (form: ExportForm) => void }): React.ReactElement {
    return (
        <div>
            <p className="intflow-section-label">{EXPORT_COPY.how}</p>
            <div className="intflow-kind-choices" data-testid="export-form">
                <ChoiceCard name={EXPORT_COPY.link} description={EXPORT_COPY.linkWhy} selected={form === 'link'} onSelect={() => onChange('link')} testId="export-form-link" />
                <ChoiceCard name={EXPORT_COPY.file} description={EXPORT_COPY.fileWhy} selected={form === 'file'} onSelect={() => onChange('file')} testId="export-form-file" />
            </div>
        </div>
    );
}

function GreyedPart({ name, note }: { name: string; note: string }): React.ReactElement {
    return (
        <li className="export-part export-part-off">
            <span className="export-part-name">{name}</span>
            <span className="export-part-note">{note}</span>
        </li>
    );
}

type LinkState = { status: 'loading' } | { status: 'failed'; error: string } | { status: 'ready'; preview: DemoPackagePreview };

function StorefrontByLink({ onSaveDemoPackage }: { onSaveDemoPackage: () => void }): React.ReactElement {
    const [state, setState] = useState<LinkState>({ status: 'loading' });
    useEffect(() => {
        let cancelled = false;
        webviewClient
            .request<Answer<DemoPackagePreview>>('getDemoPackagePreview')
            .then((answer) => {
                if (cancelled) return;
                if (!answer.success || !answer.data) setState({ status: 'failed', error: answer.error ?? 'The storefront could not be read.' });
                else setState({ status: 'ready', preview: answer.data });
            })
            .catch((error: Error) => {
                if (!cancelled) setState({ status: 'failed', error: error.message });
            });
        return () => {
            cancelled = true;
        };
    }, []);
    if (state.status === 'loading') return <LoadingDisplay size="S" message={EXPORT_COPY.looking} />;
    if (state.status === 'failed') {
        return (
            <InlineNotice tone="warning" title={EXPORT_COPY.storefront} testId="export-link-failed">
                {state.error}
            </InlineNotice>
        );
    }
    if (state.preview.saved) {
        return (
            <InlineNotice tone="info" title={EXPORT_COPY.isPackage} hint={EXPORT_COPY.linkHow} testId="export-link">
                <CopyableText>{state.preview.link}</CopyableText>
            </InlineNotice>
        );
    }
    return (
        <InlineNotice
            tone="warning"
            title={EXPORT_COPY.notPackage}
            testId="export-not-package"
            action={
                <Button variant="secondary" onPress={onSaveDemoPackage}>
                    {EXPORT_COPY.savePackage}
                </Button>
            }
        >
            {EXPORT_COPY.notPackageWhy}
        </InlineNotice>
    );
}

function LinkForm({ isEds, onSaveDemoPackage }: Pick<ExportModalProps, 'isEds' | 'onSaveDemoPackage'>): React.ReactElement {
    return (
        <ul className="export-parts" data-testid="export-link-form">
            <GreyedPart name={EXPORT_COPY.setup} note={EXPORT_COPY.setupNoLink} />
            <li className="export-part">
                <span className="export-part-name">{EXPORT_COPY.storefront}</span>
                <span className="export-part-note">{EXPORT_COPY.storefrontWhat}</span>
                {isEds ? <StorefrontByLink onSaveDemoPackage={onSaveDemoPackage} /> : <span className="export-part-note">{EXPORT_COPY.storefrontHeadless}</span>}
            </li>
            <GreyedPart name={EXPORT_COPY.datapack} note={EXPORT_COPY.notYet} />
            <GreyedPart name={EXPORT_COPY.content} note={EXPORT_COPY.notYet} />
            <GreyedPart name={EXPORT_COPY.integrations} note={EXPORT_COPY.notYet} />
        </ul>
    );
}

function savedLine(saved: ExportDemoBundleResult): string {
    const what = (saved.parts ?? []).join(' and ');
    return `Saved ${what} (${saved.fileCount ?? 0} files) to ${saved.path ?? ''}`;
}

function FileForm({ isEds }: Pick<ExportModalProps, 'isEds'>): React.ReactElement {
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
                    setError(answer.error ?? EXPORT_COPY.fileFailed);
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
            <ul className="export-parts">
                <li className="export-part">
                    <Checkbox isSelected={setup} onChange={setSetup} data-testid="part-setup">
                        {EXPORT_COPY.setup}
                    </Checkbox>
                    <span className="export-part-note">{EXPORT_COPY.setupWhat}</span>
                </li>
                <li className="export-part">
                    <Checkbox isSelected={storefront} onChange={setStorefront} isDisabled={!isEds} data-testid="part-storefront">
                        {EXPORT_COPY.storefront}
                    </Checkbox>
                    <span className="export-part-note">{isEds ? EXPORT_COPY.storefrontWhat : EXPORT_COPY.storefrontHeadless}</span>
                </li>
                <GreyedPart name={EXPORT_COPY.datapack} note={EXPORT_COPY.notYet} />
                <GreyedPart name={EXPORT_COPY.content} note={EXPORT_COPY.notYet} />
                <GreyedPart name={EXPORT_COPY.integrations} note={EXPORT_COPY.notYet} />
            </ul>
            <Button variant="accent" onPress={save} isDisabled={busy || nothing}>
                {busy ? EXPORT_COPY.saving : EXPORT_COPY.saveFile}
            </Button>
            {nothing ? <p className="export-part-note">{EXPORT_COPY.nothingTicked}</p> : null}
            {saved ? (
                <InlineNotice tone="info" title={savedLine(saved)} testId="export-saved">
                    {''}
                </InlineNotice>
            ) : null}
            {error ? (
                <InlineNotice tone="warning" title={EXPORT_COPY.fileFailed} testId="export-error">
                    {error}
                </InlineNotice>
            ) : null}
        </div>
    );
}

function Journey({ isEds, onSaveDemoPackage, onClose }: Omit<ExportModalProps, 'isOpen'>): React.ReactElement {
    const [form, setForm] = useState<ExportForm>('link');
    return (
        <Modal title={EXPORT_COPY.title} size="L" fitContent onClose={onClose} closeLabel="Close">
            <div className="intflow-stage-body export-body">
                <FormChoice form={form} onChange={setForm} />
                <p className="intflow-section-label">{EXPORT_COPY.what}</p>
                {form === 'link' ? <LinkForm isEds={isEds} onSaveDemoPackage={onSaveDemoPackage} /> : <FileForm isEds={isEds} />}
            </div>
        </Modal>
    );
}

/**
 * The dialog host: mounts the journey only while open.
 *
 * @param props - open state, the project kind and the callbacks
 * @returns the dialog container
 */
export function ExportModal({ isOpen, ...rest }: ExportModalProps): React.ReactElement {
    return <DialogContainer onDismiss={rest.onClose}>{isOpen ? <Journey {...rest} /> : null}</DialogContainer>;
}
