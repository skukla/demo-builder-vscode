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
 * The storefront is read once on open, behind the window's wait, before step 1 shows; a
 * headless project, with no storefront, reads its datapack check alone instead (walk F230). A
 * storefront that could not be read is a note line where the link would be: the file
 * still works. A pack only the SC can see is a notice with its fix, Share Datapack
 * (`useShareDatapack`, walk F229), on both forms (walk F230): its question takes this window in
 * place of the form, and once shared the same read runs again without the wait, so the form keeps
 * what the SC set.
 *
 * A Steps window per step, as Add a Demo's stages (step-07 Win3; rule 14): each opens at its own
 * height rather than at the taller step's. The form step reserves the chosen form at its tallest
 * (`reserve`), so a note that arrives after it opens never grows it. Each form's main button,
 * Copy Link or Save File, sits in the footer beside Close, as wide as its own labels only.
 *
 * @module features/dashboard/ui/components/share/ShareModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { SHARE_COPY } from './shareCopy';
import { ShareFileForm } from './ShareFileForm';
import { buttonLabel, ShareLinkForm } from './ShareLinkForm';
import { useShareDatapack, type ShareDatapackFix } from './useShareDatapack';
import { useShareFile, type UseShareFile } from './useShareFile';
import { useShareLink, type UseShareLink } from './useShareLink';
import { ChoiceCard } from '@/core/ui/components/selection/ChoiceCard';
import { ConfirmActionWindow } from '@/core/ui/components/ui/ConfirmActionDialog';
import type { ActionButton, ModalWait } from '@/core/ui/components/ui/Modal';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import { shareConfirmCopy } from '@/features/data-installer/ui/components/packMenu';
import type { DemoPackageCheck, DemoPackagePreview, ShareDatapackChecks } from '@/types/webviewRequests';

type ShareForm = 'link' | 'file';

/** The window's two steps: how to share, then the chosen form. */
type ShareStep = 'choose' | 'form';

/** A dialog reading what it will show says nothing while it does. */
const READING: ModalWait = WAIT_STAGES.readingDemo;

/** Save File: the file form's one act, named for what it makes beside Close. */
const SAVE_FILE = 'Save File';

/**
 * Every label the link step's button can show: it holds the widest one's width, so Close never
 * moves as the label changes. Each step reserves only its own labels (walk F230): the file step's
 * Save File never changes, so it holds no other step's width.
 */
const LINK_LABELS = [SHARE_COPY.copyLink, SHARE_COPY.saveAndCopy, SHARE_COPY.copied];

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

/**
 * What the dialog knows about the storefront: read once on open, before anything else shows. A
 * project with no storefront reads its datapack check alone, for the file step (walk F230).
 */
type StorefrontState =
    | { status: 'loading' }
    | { status: 'none'; checks: DemoPackageCheck[] }
    | { status: 'failed'; error: string }
    | { status: 'ready'; preview: DemoPackagePreview };

/** Why the storefront could not be read, when the handler gave no reason or no answer came back. */
const UNREAD_REASON = 'The storefront could not be read.';

/**
 * Ask for the storefront's preview: its data, or the handler's reason it could not be read. A
 * request that threw carries transport words (the webview gave up waiting), not words for the SC.
 */
async function readPreview(): Promise<StorefrontState> {
    try {
        const answer = await webviewClient.request<Answer<DemoPackagePreview>>('getDemoPackagePreview');
        if (!answer.success || !answer.data) return { status: 'failed', error: answer.error ?? UNREAD_REASON };
        return { status: 'ready', preview: answer.data };
    } catch {
        return { status: 'failed', error: UNREAD_REASON };
    }
}

/**
 * The datapack check of a project with no storefront to preview: the same check the preview
 * carries (walk F230). A read that fails shows no notice, so the file is never held up by it.
 */
async function readDatapackCheck(): Promise<StorefrontState> {
    try {
        const answer = await webviewClient.request<Answer<ShareDatapackChecks>>('getShareDatapackCheck');
        return { status: 'none', checks: answer.success && answer.data ? answer.data.checks : [] };
    } catch {
        return { status: 'none', checks: [] };
    }
}

/** The storefront as last read, and a read again that keeps the form (Share Datapack's, walk F229). */
interface Storefront {
    state: StorefrontState;
    /** Read again; the answer replaces the preview only when it is one. Stable. */
    reread: () => void;
    rereading: boolean;
}

/**
 * The one read the dialog makes on open, behind the house wait: an Edge Delivery project's
 * storefront preview, or a headless project's datapack check (walk F230). A read again keeps what
 * is shown until an answer worth showing arrives, so the window and what the SC typed stay put.
 */
function useStorefrontState(isEds: boolean): Storefront {
    const [state, setState] = useState<StorefrontState>({ status: 'loading' });
    const [rereading, setRereading] = useState(false);
    useEffect(() => {
        let cancelled = false;
        void (isEds ? readPreview() : readDatapackCheck()).then((read) => {
            if (!cancelled) setState(read);
        });
        return () => {
            cancelled = true;
        };
    }, [isEds]);
    const reread = useCallback((): void => {
        setRereading(true);
        void (isEds ? readPreview() : readDatapackCheck()).then((read) => {
            if (read.status !== 'failed') setState(read);
            setRereading(false);
        });
    }, [isEds]);
    return { state, reread, rereading };
}

function LinkForm({ state, flow, fix }: { state: StorefrontState; flow: UseShareLink; fix: ShareDatapackFix }): React.ReactElement {
    let body: React.ReactElement;
    if (state.status === 'ready') {
        body = <ShareLinkForm preview={state.preview} flow={flow} fix={fix} />;
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
        return [{ label: SAVE_FILE, variant: 'accent', onPress: file.save, isDisabled: file.nothing, isPending: file.busy }];
    }
    if (state.status !== 'ready') return [];
    return [
        {
            label: buttonLabel(flow),
            variant: 'accent',
            onPress: flow.press,
            isDisabled: !flow.canPress && flow.busy !== 'save',
            isPending: flow.busy === 'save',
            sizeLabels: LINK_LABELS,
        },
    ];
}

/**
 * A line's length the extension's reasons run to (why the details file was left alone, why a save
 * failed): reserved at the longest local sentence, which wraps to two lines at L.
 */
const REASON_ROOM = SHARE_COPY.removedFileSkipped;

/**
 * The link form in each state a press can leave it, at its longest (rules 13 and 14): the press
 * note with the undo a save makes, or, once undone, what the undo did and no undo. Never all three
 * at once, so each is its own hidden copy and the window takes the taller (walk F232: stacked, they
 * left a gap under the form). A failed undo is one reason line with the undo, as tall as the first.
 */
function linkRooms(flow: UseShareLink): UseShareLink[] {
    return [
        { ...flow, skipped: REASON_ROOM, canRemove: true, removed: undefined },
        { ...flow, skipped: undefined, canRemove: false, removed: { file: 'skipped', removedFromList: true } },
    ];
}

/** The file form at its tallest: "Select at least one part." and what Save File wrote, two lines. */
function fileRoom(file: UseShareFile): UseShareFile {
    return { ...file, nothing: true, saved: { path: REASON_ROOM, fileCount: 1000, parts: ['setup', 'storefront'] } };
}

interface WindowProps extends Omit<ShareModalProps, 'isOpen'> {
    read: Storefront;
}

/** No checks: none until the dialog's read answers, or the storefront could not be read. */
const NO_CHECKS: DemoPackageCheck[] = [];

/** The checks the dialog read on open: the preview's, or a headless project's datapack check. */
function checksOf(state: StorefrontState): DemoPackageCheck[] {
    if (state.status === 'ready') return state.preview.checks;
    if (state.status === 'none') return state.checks;
    return NO_CHECKS;
}

/** A step's body, in the stage chrome Add a Demo's stages use. */
function StepBody({ children }: { children: React.ReactNode }): React.ReactElement {
    return <div className="intflow-stage-body export-body">{children}</div>;
}

/**
 * The window, once per storefront state: the link flow starts from what the read answered. Each
 * step is a window of its own (a key per step), so each opens at its own size.
 */
function ShareWindow({ isEds, onClose, read }: WindowProps): React.ReactElement {
    const storefront = read.state;
    const [form, setForm] = useState<ShareForm>('link');
    const [step, setStep] = useState<ShareStep>('choose');
    const flow = useShareLink(storefront.status === 'ready' ? storefront.preview : UNREAD);
    const file = useShareFile(isEds);
    const checks = checksOf(storefront);
    const fix = useShareDatapack(checks, read.reread, read.rereading);
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
    if (fix.asking && fix.offer) {
        // Share Datapack asks first, in this window, as the Datapacks screen's Share asks (walk F229).
        return (
            <ConfirmActionWindow key="share-datapack" {...shareConfirmCopy(fix.offer.displayName)} onConfirm={fix.confirm} onClose={fix.cancel} />
        );
    }
    const linkOf = (shown: UseShareLink): React.ReactElement => <LinkForm state={storefront} flow={shown} fix={fix} />;
    const formOf = (): React.ReactElement => {
        if (form === 'file') return <ShareFileForm isEds={isEds} file={file} checks={checks} fix={fix} />;
        return linkOf(flow);
    };
    const reserve =
        form === 'file'
            ? [<StepBody key="file"><ShareFileForm isEds={isEds} file={fileRoom(file)} checks={checks} fix={fix} /></StepBody>]
            : linkRooms(flow).map((room, index) => <StepBody key={`link-${index}`}>{linkOf(room)}</StepBody>);
    return (
        <StepsWindow
            key="form"
            title={SHARE_COPY.title}
            reserve={reserve}
            startButtons={[{ label: SHARE_COPY.back, variant: 'secondary', onPress: () => setStep('choose') }]}
            actionButtons={mainButton(form, storefront, flow, file)}
            onClose={onClose}
        >
            <StepBody>{formOf()}</StepBody>
        </StepsWindow>
    );
}

function Journey({ isEds, onClose }: Omit<ShareModalProps, 'isOpen'>): React.ReactElement {
    const read = useStorefrontState(isEds);
    // A new window once the read answers: the one before it was unseen, only its wait showing.
    return <ShareWindow key={read.state.status} isEds={isEds} onClose={onClose} read={read} />;
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
