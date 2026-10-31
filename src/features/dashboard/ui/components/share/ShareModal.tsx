/**
 * ShareModal — the dashboard's ONE way to hand a demo on (owner, 2026-10-22:
 * "I do want the merged share dialog"). It replaced two dialogs that did the
 * same job: Export's "Send a link" and Save as demo package both ended in the
 * same handler, which writes the details file into the repository and puts the
 * card on the SC's Welcome step (`.rptc/research/share-dialogs-overlap/`).
 *
 * One question first: HOW it travels, as two plain options with one line on
 * the chosen one (owner, 2026-10-22: two described cards, an eyebrow and a
 * green checklist read as "too busy"). A link (`ShareLinkForm`), when the
 * colleague can reach your GitHub; a file (`ShareFileForm`), when they cannot.
 * The storefront is read once on open, behind the house spinner, before either
 * form shows.
 *
 * @module features/dashboard/ui/components/share/ShareModal
 */

import { DialogContainer, Radio, RadioGroup } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { SHARE_COPY } from './shareCopy';
import { ShareFileForm } from './ShareFileForm';
import { ShareLinkForm } from './ShareLinkForm';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { DemoPackagePreview } from '@/types/webviewRequests';

type ShareForm = 'link' | 'file';

/** A handler's answer: branch on `success` before reading anything else (webview-command-handler). */
interface Answer<D> {
    success: boolean;
    error?: string;
    data?: D;
}

export interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Edge Delivery project: it has a storefront of its own to link to. */
    isEds: boolean;
}

/** Two plain options and one line on the chosen one: the dialog is the link, not the choice. */
function FormChoice({ form, onChange }: { form: ShareForm; onChange: (form: ShareForm) => void }): React.ReactElement {
    return (
        <RadioGroup
            aria-label={SHARE_COPY.how}
            orientation="horizontal"
            value={form}
            onChange={(value) => onChange(value as ShareForm)}
            description={form === 'link' ? SHARE_COPY.linkWhy : SHARE_COPY.fileWhy}
            data-testid="share-form"
        >
            <Radio value="link" data-testid="share-form-link">
                {SHARE_COPY.link}
            </Radio>
            <Radio value="file" data-testid="share-form-file">
                {SHARE_COPY.file}
            </Radio>
        </RadioGroup>
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
 * until the answer is in.
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

function LinkForm({ state }: { state: StorefrontState }): React.ReactElement {
    let body: React.ReactElement;
    if (state.status === 'ready') {
        body = <ShareLinkForm preview={state.preview} />;
    } else if (state.status === 'failed') {
        body = (
            <InlineNotice tone="warning" title={SHARE_COPY.storefront} testId="share-link-failed">
                {state.error}
            </InlineNotice>
        );
    } else {
        body = <p className="export-section-text">{SHARE_COPY.linkHeadless}</p>;
    }
    return (
        <div className="export-link-form" data-testid="share-link-form">
            {body}
        </div>
    );
}

function Journey({ isEds, onClose }: Omit<ShareModalProps, 'isOpen'>): React.ReactElement {
    const [form, setForm] = useState<ShareForm>('link');
    const storefront = useStorefrontState(isEds);
    return (
        <Modal title={SHARE_COPY.title} size="L" fitContent onClose={onClose} closeLabel="Close">
            {storefront.status === 'loading' ? (
                <CenteredFeedbackContainer height="280px">
                    <LoadingDisplay size="M" centered message={SHARE_COPY.looking} helperText={SHARE_COPY.lookingFor} />
                </CenteredFeedbackContainer>
            ) : (
                <div className="intflow-stage-body export-body">
                    <FormChoice form={form} onChange={setForm} />
                    {form === 'link' ? <LinkForm state={storefront} /> : <ShareFileForm isEds={isEds} />}
                </div>
            )}
        </Modal>
    );
}

/**
 * The dialog host: mounts the journey only while open.
 *
 * @param props - open state, the project kind and the close callback
 * @returns the dialog container
 */
export function ShareModal({ isOpen, ...rest }: ShareModalProps): React.ReactElement {
    return <DialogContainer onDismiss={rest.onClose}>{isOpen ? <Journey {...rest} /> : null}</DialogContainer>;
}
