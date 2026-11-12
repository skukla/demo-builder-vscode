import { Dialog, Heading, Content, Divider } from '@adobe/react-spectrum';
import React, { ReactNode, useCallback } from 'react';
import { Spinner } from './Spinner';
import { useDialogViewChange } from './useDialogViewChange';
import { StageWait, type WaitLines } from '@/core/ui/components/feedback/StageWait';
import { StatusIcon } from '@/core/ui/components/feedback/StatusIcon';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { cn } from '@/core/ui/utils/classNames';

/**
 * How the thing the dialog is about stands, said by an icon before its title (the dialog design
 * rules, `docs/development/sop/dialog-design.md`): green done, amber needs the SC, red failed.
 */
export type ModalStatus = 'success' | 'warning' | 'error';

export interface ActionButton {
    label: string;
    /** `quiet` is a borderless button, for the actions beside the main one; `negative` is solid red. */
    variant: 'primary' | 'secondary' | 'accent' | 'negative' | 'quiet';
    onPress: () => void;
    isDisabled?: boolean;
    /**
     * The button's work is running: a small spinner takes the label's place, at the same width,
     * and presses are ignored. Not a "-ing" label: that changed the button's width and read as a
     * new label rather than as waiting (owner, 2026-10-31).
     */
    isPending?: boolean;
    /**
     * Every other label this button can show while the dialog is open. The button holds the
     * widest one's width from the start, so the buttons beside it never move when its label
     * changes (owner, 2026-11-04: ticking a row in Updates moved Close).
     */
    sizeLabels?: string[];
    /** What the button does, shown on hover, for a label that does not say it (Fix with AI). */
    hint?: string;
}

export interface ModalProps {
    title: string;
    /** An icon before the title saying how things stand; none for a question or a form. */
    status?: ModalStatus;
    size?: 'S' | 'M' | 'L' | 'fullscreen' | 'fullscreenTakeover';
    actionButtons?: ActionButton[];
    /**
     * Buttons at the footer's START, apart from the dialog's own answers on the right. For what
     * acts on a list in the body as a whole (the setup guide's Check All Steps, under its step
     * list): below the body they cannot be scrolled out of sight or clipped (owner, 2026-11-03).
     */
    startButtons?: ActionButton[];
    onClose: () => void;
    /** Label for the built-in close button (default "Close"). */
    closeLabel?: string;
    /** Variant for the built-in close button (default "secondary"). */
    closeVariant?: 'primary' | 'secondary' | 'accent' | 'negative';
    /**
     * Leave the built-in close button out, when the action buttons are every way on.
     * The Updates modal asks a question this way: dismissing it would only repeat one
     * of the answers. Escape still calls `onClose`.
     */
    hideClose?: boolean;
    /**
     * Let the dialog collapse to its CONTENT's height instead of claiming a fixed
     * one. Spectrum's modal Dialog takes a height independent of what is inside it
     * — which is why `.modal-body` has to grow to push the footer down (below). On
     * a short body that leaves a tall dialog with dead space under the footer.
     *
     * Opt-in so existing modals keep their current proportions; the max-height and
     * the sticky footer still apply, so a LONG body scrolls exactly as before.
     */
    fitContent?: boolean;
    /**
     * Let the dialog claim more WIDTH than Spectrum's `size` allows.
     *
     * `size="L"` is the widest non-fullscreen Dialog, and it is not enough for
     * content whose items cannot be broken — the Data Installer's export type
     * list offers 18 names, the longest 38 characters, which at L either wrap
     * mid-name or scroll. Fullscreen is far too much (it sizes to the viewport
     * and reads as a different kind of surface).
     *
     * Same mechanism as {@link fitContent}: the constraint is not on the
     * dialog's own box but on Spectrum's wrapper, so the override has to be
     * `!important` on the element the wrapper sizes.
     *
     * Opt-in — every existing modal keeps its proportions.
     */
    wide?: boolean;
    /**
     * The dialog is waiting for what it will show. Only the title, the wait and the way out
     * appear: no fields and no action buttons (dialog design rules, owner 2026-11-01). The wait
     * says what it is doing in the progress window's three rows (`StageWait`, owner 2026-11-08),
     * its words from `WAIT_STAGES`. A button doing its own work uses `isPending` instead. `false`
     * or absent shows the content. The end of a wait is a change of view: see
     * `useDialogViewChange`.
     */
    waiting?: ModalWait | false;
    /**
     * The body is a wait of its own that keeps its buttons (a running job with Close), so it
     * keeps the box it found, as `waiting` does.
     */
    holdSize?: boolean;
    /**
     * The window keeps the height it opened at for every step (owner, 2026-11-11): the body fills
     * it and scrolls, and the buttons stay at the bottom. Set by `StepsDialog` once
     * `useFixedHeight` holds the box.
     */
    lockHeight?: boolean;
    /**
     * The window is measuring its tallest step before it is seen (`StepsDialog`): drawn, so it can
     * be measured, but hidden, so the SC never sees a height it will not keep.
     */
    measuring?: boolean;
    children: ReactNode;
}

/** What a wait says: always what it is doing, then on what and how long (`WAIT_STAGES`). */
export type ModalWait = WaitLines;

/**
 * Focusable button wrapper to ensure buttons are in the same tab order
 * as custom focusable elements (tabIndex={0}) in the modal content.
 * Spectrum's ButtonGroup is excluded from focus trap with custom elements.
 */
interface FocusableButtonProps {
    variant: ActionButton['variant'];
    onPress: () => void;
    isDisabled?: boolean;
    isPending?: boolean;
    /** The button's name while pending, when the label it shows is hidden behind the spinner. */
    pendingName?: string;
    hint?: string;
    children: React.ReactNode;
}

/** The label, or while pending a spinner over the hidden label, which keeps the button's width. */
function ButtonFace({ children, isPending, onColour }: { children: React.ReactNode; isPending?: boolean; onColour: boolean }) {
    if (!isPending) return <>{children}</>;
    return (
        <span className="modal-button-pending">
            <span className="modal-button-pending-label">{children}</span>
            <span className="modal-button-pending-spinner">
                <Spinner size="S" aria-label="Working" staticColor={onColour ? 'white' : undefined} />
            </span>
        </span>
    );
}

function FocusableButton({ variant, onPress, isDisabled: disabled, isPending, pendingName, hint, children }: FocusableButtonProps) {
    // Pending ignores presses like disabled does, without dimming: the button is busy, not unavailable.
    const isDisabled = disabled === true || isPending === true;
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (isDisabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPress();
            }
        },
        [onPress, isDisabled],
    );

    const handleClick = useCallback(() => {
        if (!isDisabled) onPress();
    }, [onPress, isDisabled]);

    // Map variant to CSS class
    const variantClassMap: Record<FocusableButtonProps['variant'], string> = {
        primary: 'modal-button-primary',
        accent: 'modal-button-primary',
        secondary: 'modal-button-secondary',
        negative: 'modal-button-negative',
        quiet: 'modal-button-quiet',
    };
    const variantClass = variantClassMap[variant];

    return (
        <div
            role="button"
            tabIndex={isDisabled ? -1 : 0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={cn('modal-button', variantClass, disabled && 'modal-button-disabled', isPending && 'modal-button-busy')}
            aria-disabled={isDisabled}
            aria-busy={isPending || undefined}
            aria-label={isPending ? pendingName : undefined}
            title={hint}
        >
            <ButtonFace isPending={isPending} onColour={variant === 'primary' || variant === 'accent' || variant === 'negative'}>
                {children}
            </ButtonFace>
        </div>
    );
}

/** The label over every label it may become, drawn hidden in one cell: the widest sets the width. */
function SizedLabel({ label, sizeLabels }: { label: string; sizeLabels?: string[] }): React.JSX.Element {
    if (!sizeLabels?.length) return <>{label}</>;
    return (
        <span className="modal-button-sized">
            {sizeLabels.map((other) => (
                <span key={other} className="modal-button-sizer" aria-hidden="true">
                    {other}
                </span>
            ))}
            <span>{label}</span>
        </span>
    );
}

/**
 * One dialog button, drawn as the footer draws it: for a button that belongs to a row in the body
 * (a guide step's Open Admin and Check), so it looks and waits like the footer's.
 *
 * @param props - the button
 * @returns the button
 */
export function DialogButton({ button }: { button: ActionButton }): React.JSX.Element {
    return renderButton(button, 0);
}

/** The button row: Close or Cancel on the left, the actions on the right (Spectrum). A wait shows no actions. */
type FooterProps = Required<Pick<ModalProps, 'startButtons' | 'actionButtons' | 'hideClose'>> & {
    waiting: boolean;
    close: React.JSX.Element;
};

function ModalFooter({ waiting, startButtons, actionButtons, hideClose, close }: FooterProps): React.JSX.Element {
    return (
        <div className="modal-footer-actions">
            {!waiting && startButtons.length > 0 && (
                <div className="modal-footer-start">{startButtons.map(renderButton)}</div>
            )}
            {!hideClose && close}
            {(waiting ? [] : actionButtons).map(renderButton)}
        </div>
    );
}

/** One footer button, keyed by its place in its group. */
function renderButton(button: ActionButton, index: number): React.JSX.Element {
    return (
        <FocusableButton
            key={index}
            variant={button.variant}
            onPress={button.onPress}
            isDisabled={button.isDisabled}
            isPending={button.isPending}
            pendingName={button.label}
            hint={button.hint}
        >
            <SizedLabel label={button.label} sizeLabels={button.sizeLabels} />
        </FocusableButton>
    );
}

export function Modal({
    title,
    status,
    size = 'M',
    actionButtons = [],
    startButtons = [],
    onClose,
    closeLabel = 'Close',
    closeVariant = 'secondary',
    hideClose = false,
    fitContent = false,
    wide = false,
    waiting = false,
    holdSize = false,
    lockHeight = false,
    measuring = false,
    children,
}: ModalProps) {
    // Map custom sizes to Dialog-compatible sizes
    const dialogSize: 'S' | 'M' | 'L' =
        size === 'fullscreen' || size === 'fullscreenTakeover' ? 'L' : size;
    const { bodyRef, holding } = useDialogViewChange({
        widthStep: wide ? 'XL' : dialogSize,
        holding: Boolean(waiting) || holdSize,
        waiting: Boolean(waiting),
        title,
    });

    return (
        // Every class a literal, so the stylesheet scan can read them in every bundle that
        // renders a modal. (A helper built this string until 2026-10-15, which the scan counted
        // unreadable once per bundle.) `modal-dialog` pins the dialog near the top; `is-holding`
        // centres a wait in the box it kept.
        <Dialog
            size={dialogSize}
            UNSAFE_className={cn(
                'modal-dialog',
                fitContent && 'modal-fit-content',
                wide && 'modal-wide',
                holding && 'is-holding',
                lockHeight && 'is-locked',
                measuring && 'is-measuring',
            )}
        >
            <Heading>
                <span className="modal-title">
                    {status ? (
                        <span className="modal-status-icon">
                            <StatusIcon status={status} />
                        </span>
                    ) : null}
                    <span>{title}</span>
                </span>
            </Heading>
            <Divider />
            <Content UNSAFE_className="modal-content">
                {/* The body GROWS so the footer is pushed to the dialog's bottom even when
                    the content is short. `position: sticky` alone only pins against an
                    OVERFLOWING container, so a short body (a spinner, a two-row list) left
                    the footer floating mid-dialog with dead space beneath it. */}
                <div className="modal-body" ref={bodyRef}>
                    <SteadyHeight>
                        {waiting ? (
                            <div className="modal-wait">
                                <StageWait lines={waiting} />
                            </div>
                        ) : (
                            children
                        )}
                    </SteadyHeight>
                </div>
                <ModalFooter
                    waiting={Boolean(waiting)}
                    startButtons={startButtons}
                    actionButtons={actionButtons}
                    hideClose={hideClose}
                    close={
                        <FocusableButton variant={closeVariant} onPress={onClose}>
                            {closeLabel}
                        </FocusableButton>
                    }
                />
            </Content>
        </Dialog>
    );
}
