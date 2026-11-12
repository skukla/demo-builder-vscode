/**
 * The Steps layout: one window that goes Form, Running, Result without changing size
 * (`docs/development/sop/dialog-design.md`; owner, 2026-11-11). Large, so a list of rows and a form
 * of fields both fit; its title says the step it is on, with the status icon once it ends.
 *
 * A window never changes height once on screen. The caller passes the step it shows and, as
 * `reserve`, the steps it may show next; they are drawn hidden in the same grid cell, so the
 * tallest sets the box, which `useFixedHeight` then holds for every step. The window stays unseen
 * until that height is known (`ready`), so the SC never sees a height it will not keep. The
 * buttons stay at the bottom and only the middle scrolls.
 *
 * While a step waits (`WAIT_STAGES`) only its wait and the way out appear, centred in the box it
 * keeps. The caller passes words, steps and actions, never a size or a class
 * (`tests/sop/modal-layouts.test.ts`); `wide` is the one content-derived exception, for a step
 * whose items cannot be broken across three columns at L.
 *
 * @module core/ui/components/ui/StepsDialog
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { StageWait } from '@/core/ui/components/feedback/StageWait';
import {
    Modal,
    type ActionButton,
    type ModalStatus,
    type ModalWait,
} from '@/core/ui/components/ui/Modal';
import { useFixedHeight } from '@/core/ui/components/ui/useFixedHeight';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

export interface StepsDialogProps {
    isOpen: boolean;
    /** The step it is on: "Install My Luma", "Installing My Luma", "My Luma Installed". */
    title: string;
    /** How the run ended; absent until it does. */
    status?: ModalStatus;
    /** The step shown. */
    children?: React.ReactNode;
    /**
     * The steps it may show next, drawn hidden beside the one shown until the height is held, so
     * the tallest sets it. Each child is one step.
     */
    reserve?: React.ReactNode;
    /**
     * What the steps hold is known, so the box is at its tallest and can be held. Until then the
     * window is drawn but unseen, for at most `DIALOG_MEASURE_LIMIT`.
     */
    ready?: boolean;
    /** The step is waiting (`WAIT_STAGES`): only the wait and the way out appear. */
    waiting?: ModalWait | false;
    /** The buttons beside the way out, main last. Hidden while it waits. */
    actionButtons?: ActionButton[];
    /** Buttons at the start of the row: Back, Fix with AI. Hidden while it waits. */
    startButtons?: ActionButton[];
    /** What dismissing says: Cancel on a step that commits, Close once it ends. */
    closeLabel?: string;
    hideClose?: boolean;
    /** Wider than L, for a step whose items cannot be broken (an 18-name type list). */
    wide?: boolean;
    onClose: () => void;
}

/**
 * The window itself, for a host that already holds the dialog container: a window shown in place
 * of another in that host's own container (`tests/sop/modal-hosting.test.ts`). Inside the
 * container, so it measures only while it is on screen.
 */
export function StepsWindow({
    title,
    status,
    children,
    reserve,
    ready = true,
    waiting = false,
    actionButtons = [],
    startButtons = [],
    closeLabel = 'Close',
    hideClose = false,
    wide = false,
    onClose,
}: Omit<StepsDialogProps, 'isOpen'>): React.ReactElement {
    const [late, setLate] = useState(false);
    const [pending, setPending] = useState(false);
    useEffect(() => {
        if (ready) return undefined;
        const limit = setTimeout(() => setLate(true), FRONTEND_TIMEOUTS.DIALOG_MEASURE_LIMIT);
        const spin = setTimeout(() => setPending(true), FRONTEND_TIMEOUTS.DIALOG_PENDING_DELAY);
        return () => {
            clearTimeout(limit);
            clearTimeout(spin);
        };
    }, [ready]);
    const { ref, locked } = useFixedHeight(ready || late);

    return (
        <Modal
            title={title}
            status={status}
            size="L"
            wide={wide}
            lockHeight={locked}
            measuring={!locked}
            onClose={onClose}
            closeLabel={closeLabel}
            hideClose={hideClose}
            startButtons={waiting ? [] : startButtons}
            actionButtons={waiting ? [] : actionButtons}
        >
            <div className="modal-steps" ref={ref}>
                {/* While what the steps hold is read, the window stays unseen and only its wait shows,
                    where it will open: a window that appears and then grows is what the SC must
                    never see (owner, 2026-11-12). The wait says what it is doing (walk F72). */}
                {!locked && pending && (
                    <div className="modal-steps-pending" role="status">
                        <StageWait lines={waiting || { label: `Opening ${title}` }} />
                    </div>
                )}
                {waiting ? (
                    <div className="modal-wait">
                        <StageWait lines={waiting} />
                    </div>
                ) : (
                    <div>{children}</div>
                )}
                {/* Each reserved step in the same cell, hidden (`visibility` takes it out of the tab
                    order and the accessibility tree too), so the tallest sets the box. */}
                {locked
                    ? null
                    : React.Children.toArray(reserve).map((step, index) => (
                          <div key={index} className="modal-steps-ghost" aria-hidden="true">
                              {step}
                          </div>
                      ))}
            </div>
        </Modal>
    );
}

/**
 * Host a window with steps; present it when open.
 *
 * @param props - open state, the title and status, the step shown and the steps reserved, whether
 *   they are known, the wait, the buttons and the way out
 * @returns the dialog container
 */
export function StepsDialog({ isOpen, onClose, ...rest }: StepsDialogProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && <StepsWindow onClose={onClose} {...rest} />}
        </DialogContainer>
    );
}
