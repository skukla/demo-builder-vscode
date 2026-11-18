/**
 * ShareModal — the dashboard's ONE way to hand a demo on (owner, 2026-10-22:
 * "I do want the merged share dialog"). It replaced two dialogs that did the
 * same job: Export's "Send a link" and Save as demo package both ended in the
 * same handler, which writes the details file into the repository and puts the
 * card on the SC's Welcome step (`.rptc/research/share-dialogs-overlap/`).
 *
 * Two steps in one window, the house flow Add a Demo and Add Integration use (owner,
 * 2026-11-18, walk F228). Step 1 asks HOW it travels, as two choice cards with a line on
 * each, the same way its inverse, Add a Demo, asks link or zip; Next goes on. Step 2 is the
 * chosen form, with Back at the footer's start: a link (`ShareLinkForm`), when the
 * colleague can reach your GitHub; a file (`ShareFileForm`), when they cannot. Both forms'
 * state lives above the windows, so Back and Next keep what the SC set.
 * The storefront is read once on open, behind the window's wait, before step 1 shows. A
 * storefront that could not be read is a note line where the link would be: the file
 * still works.
 *
 * A Steps window per step, as Add a Demo's stages (step-07 Win3; rule 14): each opens at its own
 * height rather than at the taller step's. The form step reserves the chosen form at its tallest
 * (`reserve`), so a note that arrives after it opens never grows it. Each form's main button,
 * Copy Link or Save File, sits in the footer beside Close.
 *
 * @module features/dashboard/ui/components/share/ShareModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { SHARE_COPY } from './shareCopy';
import { ShareFileForm } from './ShareFileForm';
import { buttonLabel, ShareLinkForm } from './ShareLinkForm';
import { useShareFile, type UseShareFile } from './useShareFile';
import { useShareLink, type UseShareLink } from './useShareLink';
import { ChoiceCard } from '@/core/ui/components/selection/ChoiceCard';
import type { ActionButton, ModalWait } from '@/core/ui/components/ui/Modal';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { DemoPackagePreview } from '@/types/webviewRequests';

type ShareForm = 'link' | 'file';

/** The window's two steps: how to share, then the chosen form. */
type ShareStep = 'choose' | 'form';

/** A dialog reading what it will show says nothing while it does. */
const READING: ModalWait = WAIT_STAGES.readingDemo;

/** Save File: the file form's one act, named for what it makes beside Close. */
const SAVE_FILE = 'Save File';

/**
 * Every label the footer button can show, on either form: it holds the widest one's width, so
 * Close never moves as the label or the form changes.
 */
const BUTTON_LABELS = [SHARE_COPY.copyLink, SHARE_COPY.saveAndCopy, SHARE_COPY.copied, SAVE_FILE];

/** What the link flow is handed before the storefront is read: never shown, never pressed. */
const UNREAD: DemoPackagePreview = { draft: { name: '', description: '' }, checks: [], link: '', saved: false, onList: false };

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

/** How it travels: two choice cards, each saying who it is for, as Add a Demo's link or zip. */
function FormChoice({ form, onChange }: { form: ShareForm; onChange: (form: ShareForm) => void }): React.ReactElement {
    return (
        <div data-testid="share-form">
            <SectionLabel>{SHARE_COPY.how}</SectionLabel>
            <div className="intflow-kind-choices">
                <ChoiceCard
                    name={SHARE_COPY.link}
                    description={SHARE_COPY.linkWhy}
                    selected={form === 'link'}
                    onSelect={() => onChange('link')}
                    testId="share-form-link"
                />
                <ChoiceCard
                    name={SHARE_COPY.file}
                    description={SHARE_COPY.fileWhy}
                    selected={form === 'file'}
                    onSelect={() => onChange('file')}
                    testId="share-form-file"
                />
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

function LinkForm({ state, flow }: { state: StorefrontState; flow: UseShareLink }): React.ReactElement {
    let body: React.ReactElement;
    if (state.status === 'ready') {
        body = <ShareLinkForm preview={state.preview} flow={flow} />;
    } else if (state.status === 'failed') {
        body = <p className="dialog-problem text-negative" data-testid="share-link-failed">{SHARE_COPY.storefrontFailed} {state.error}</p>;
    } else {
        body = <p className="export-section-text">{SHARE_COPY.linkHeadless}</p>;
    }
    return (
        <div className="export-link-form" data-testid="share-link-form">
            {body}
        </div>
    );
}

/** The footer's button for the chosen form: the link's only once there is one. */
function mainButton(form: ShareForm, state: StorefrontState, flow: UseShareLink, file: UseShareFile): ActionButton[] {
    if (form === 'file') {
        return [{ label: SAVE_FILE, variant: 'accent', onPress: file.save, isDisabled: file.nothing, isPending: file.busy, sizeLabels: BUTTON_LABELS }];
    }
    if (state.status !== 'ready') return [];
    return [
        {
            label: buttonLabel(flow),
            variant: 'accent',
            onPress: flow.press,
            isDisabled: !flow.canPress && flow.busy !== 'save',
            isPending: flow.busy === 'save',
            sizeLabels: BUTTON_LABELS,
        },
    ];
}

/**
 * A line's length the extension's reasons run to (why the details file was left alone, why a save
 * failed): reserved at the longest local sentence, which wraps to two lines at L.
 */
const REASON_ROOM = SHARE_COPY.removedFileSkipped;

/**
 * The link form as tall as it can get after it opens (rules 13 and 14): the press note, the undo a
 * save makes, and what the undo did, each at its longest. Never shown: drawn hidden as the window
 * opens, so the held height already has their room.
 */
function linkRoom(flow: UseShareLink): UseShareLink {
    return { ...flow, skipped: REASON_ROOM, canRemove: true, removed: { file: 'skipped', removedFromList: true } };
}

/** The file form at its tallest: "Select at least one part." and what Save File wrote, two lines. */
function fileRoom(file: UseShareFile): UseShareFile {
    return { ...file, nothing: true, saved: { path: REASON_ROOM, fileCount: 1000, parts: ['setup', 'storefront'] } };
}

interface WindowProps extends Omit<ShareModalProps, 'isOpen'> {
    storefront: StorefrontState;
}

/** A step's body, in the stage chrome Add a Demo's stages use. */
function StepBody({ children }: { children: React.ReactNode }): React.ReactElement {
    return <div className="intflow-stage-body export-body">{children}</div>;
}

/**
 * The window, once per storefront state: the link flow starts from what the read answered. Each
 * step is a window of its own (a key per step), so each opens at its own size.
 */
function ShareWindow({ isEds, onClose, storefront }: WindowProps): React.ReactElement {
    const [form, setForm] = useState<ShareForm>('link');
    const [step, setStep] = useState<ShareStep>('choose');
    const flow = useShareLink(storefront.status === 'ready' ? storefront.preview : UNREAD);
    const file = useShareFile(isEds);
    const loading = storefront.status === 'loading';
    if (step === 'choose') {
        return (
            <StepsWindow
                key="choose"
                title={SHARE_COPY.title}
                ready={!loading}
                waiting={loading ? READING : false}
                actionButtons={[{ label: SHARE_COPY.next, variant: 'accent', onPress: () => setStep('form') }]}
                onClose={onClose}
            >
                <StepBody>
                    <FormChoice form={form} onChange={setForm} />
                </StepBody>
            </StepsWindow>
        );
    }
    const formOf = (withRoom: boolean): React.ReactElement => {
        if (form === 'file') return <ShareFileForm isEds={isEds} file={withRoom ? fileRoom(file) : file} />;
        return <LinkForm state={storefront} flow={withRoom ? linkRoom(flow) : flow} />;
    };
    return (
        <StepsWindow
            key="form"
            title={SHARE_COPY.title}
            reserve={<StepBody>{formOf(true)}</StepBody>}
            startButtons={[{ label: SHARE_COPY.back, variant: 'secondary', onPress: () => setStep('choose') }]}
            actionButtons={mainButton(form, storefront, flow, file)}
            onClose={onClose}
        >
            <StepBody>{formOf(false)}</StepBody>
        </StepsWindow>
    );
}

function Journey({ isEds, onClose }: Omit<ShareModalProps, 'isOpen'>): React.ReactElement {
    const storefront = useStorefrontState(isEds);
    // A new window once the read answers: the one before it was unseen, only its wait showing.
    return <ShareWindow key={storefront.status} isEds={isEds} onClose={onClose} storefront={storefront} />;
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
