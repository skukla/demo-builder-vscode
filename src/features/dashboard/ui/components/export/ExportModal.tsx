/**
 * ExportModal — hand this demo to someone else (owner, 2026-09-13). One
 * question first: HOW it travels (a link, when the colleague can reach your
 * GitHub and the shared services; a file, when they cannot). The link form is
 * the link and a Copy button, nothing else. A link carries nothing itself, so
 * the demo's name and description have to be IN the repository for a
 * colleague's card to show them; Copy link writes them there (through the same
 * handler as Save as demo package, with the prefilled draft) the first time,
 * then copies. No warning, no prerequisite, no second dialog (owner,
 * 2026-09-14: "saving as a demo package should not be required for an export").
 * The file form asks what to include: the two parts that exist. Parts not built
 * are not shown; a dialog is not a roadmap.
 *
 * @module features/dashboard/ui/components/export/ExportModal
 */

import { Button, Checkbox, DialogContainer } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { Modal } from '@/core/ui/components/ui/Modal';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import { ChoiceCard } from '@/features/project-creation/ui/components/ChoiceCard';
import type {
    DemoPackagePreview,
    ExportDemoBundleRequest,
    ExportDemoBundleResult,
    SaveDemoPackageRequest,
    SaveDemoPackageResult,
} from '@/types/webviewRequests';

export type ExportForm = 'link' | 'file';

export const EXPORT_COPY = {
    title: 'Export',
    how: 'How will you hand it over?',
    link: 'Send a link',
    linkWhy: 'For a colleague who can reach your GitHub. Keeps the history, and they get your later changes.',
    file: 'Send a file',
    fileWhy: "For a colleague who can't. One zip with the parts you tick. No history, no later changes.",
    whatFile: 'What to include',
    setup: 'Setup',
    setupWhat: 'Your Commerce, Adobe, GitHub and DA.live settings. Never a credential.',
    storefront: 'Storefront',
    storefrontWhat: "The storefront's code and content site.",
    storefrontHeadless: 'This project has no storefront of its own.',
    linkHeadless: 'This project has no storefront of its own. Send a file instead.',
    looking: 'Checking the storefront',
    lookingFor: 'Reading the repository and the published pages.',
    isPackage: 'Send this link:',
    linkHow: 'Colleagues paste it into "Add a demo". They get your storefront\'s code and content, and your later changes.',
    linkWrites: "Copying also writes the demo's name and description into your repository, so that is what their card shows.",
    copyLink: 'Copy link',
    copied: 'Copied',
    preparing: 'Preparing…',
    copyFailed: "Couldn't prepare the link",
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

/** What the dialog knows about the storefront: read once on open, before anything else shows. */
type StorefrontState =
    | { status: 'loading' }
    | { status: 'none' }
    | { status: 'failed'; error: string }
    | { status: 'ready'; preview: DemoPackagePreview };

/**
 * The one read the dialog makes. A headless project has no storefront to read,
 * so it is ready at once; an Edge Delivery project shows the house spinner
 * until the answer is in (owner, 2026-09-14: a dialog that needs to check
 * something shows the spinner first, then its UX).
 */
function useStorefrontState(isEds: boolean): StorefrontState {
    const [state, setState] = useState<StorefrontState>(isEds ? { status: 'loading' } : { status: 'none' });
    useEffect(() => {
        if (!isEds) return undefined;
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
    }, [isEds]);
    return state;
}

/**
 * The link, and the one act on it. Copy writes the description file first when
 * the storefront does not carry one yet, so the colleague's card reads the
 * demo's name rather than the repository's; a storefront that already has it
 * is only copied.
 */
function LinkCopy({ preview }: { preview: DemoPackagePreview }): React.ReactElement {
    const [saved, setSaved] = useState(preview.saved);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const copy = async (): Promise<void> => {
        setBusy(true);
        setError(undefined);
        try {
            if (!saved) {
                const request: SaveDemoPackageRequest = { name: preview.draft.name, description: preview.draft.description };
                const answer = await webviewClient.request<Answer<SaveDemoPackageResult>>('saveDemoPackage', request);
                if (!answer.success || !answer.data) {
                    setError(answer.error ?? EXPORT_COPY.copyFailed);
                    return;
                }
                setSaved(true);
            }
            await navigator.clipboard.writeText(preview.link);
            setCopied(true);
            setTimeout(() => setCopied(false), FRONTEND_TIMEOUTS.LOADING_MIN_DISPLAY);
        } catch (failure) {
            setError((failure as Error).message);
        } finally {
            setBusy(false);
        }
    };
    const label = busy ? EXPORT_COPY.preparing : copied ? EXPORT_COPY.copied : EXPORT_COPY.copyLink;
    return (
        <div className="export-link" data-testid="export-link">
            <span className="export-part-name">{EXPORT_COPY.isPackage}</span>
            <div className="export-link-row">
                <code className="export-link-text">{preview.link}</code>
                <Button variant="accent" onPress={() => void copy()} isDisabled={busy} data-testid="export-copy-link">
                    {label}
                </Button>
            </div>
            <span className="export-part-note">
                {EXPORT_COPY.linkHow}
                {saved ? '' : ` ${EXPORT_COPY.linkWrites}`}
            </span>
            {error ? (
                <InlineNotice tone="warning" title={EXPORT_COPY.copyFailed} testId="export-copy-failed">
                    {error}
                </InlineNotice>
            ) : null}
        </div>
    );
}

function LinkForm({ state }: { state: StorefrontState }): React.ReactElement {
    let body: React.ReactElement;
    if (state.status === 'ready') {
        body = <LinkCopy preview={state.preview} />;
    } else if (state.status === 'failed') {
        body = (
            <InlineNotice tone="warning" title={EXPORT_COPY.storefront} testId="export-link-failed">
                {state.error}
            </InlineNotice>
        );
    } else {
        body = <p className="export-section-text">{EXPORT_COPY.linkHeadless}</p>;
    }
    return (
        <div className="export-link-form" data-testid="export-link-form">
            {body}
        </div>
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
            <p className="intflow-section-label">{EXPORT_COPY.whatFile}</p>
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

function Journey({ isEds, onClose }: Omit<ExportModalProps, 'isOpen'>): React.ReactElement {
    const [form, setForm] = useState<ExportForm>('link');
    const storefront = useStorefrontState(isEds);
    return (
        <Modal title={EXPORT_COPY.title} size="L" fitContent onClose={onClose} closeLabel="Close">
            {storefront.status === 'loading' ? (
                <CenteredFeedbackContainer height="280px">
                    <LoadingDisplay size="L" message={EXPORT_COPY.looking} helperText={EXPORT_COPY.lookingFor} />
                </CenteredFeedbackContainer>
            ) : (
                <div className="intflow-stage-body export-body">
                    <FormChoice form={form} onChange={setForm} />
                    {form === 'link' ? <LinkForm state={storefront} /> : <FileForm isEds={isEds} />}
                </div>
            )}
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
