import { Dialog, Heading, Content, Divider } from '@adobe/react-spectrum';
import Alert from '@spectrum-icons/workflow/Alert';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Spinner } from './Spinner';
import { cn } from '@/core/ui/utils/classNames';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

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
}

export interface ModalProps {
    title: string;
    /** An icon before the title saying how things stand; none for a question or a form. */
    status?: ModalStatus;
    size?: 'S' | 'M' | 'L' | 'fullscreen' | 'fullscreenTakeover';
    actionButtons?: ActionButton[];
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
    children: ReactNode;
}

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

function FocusableButton({ variant, onPress, isDisabled: disabled, isPending, pendingName, children }: FocusableButtonProps) {
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
        >
            <ButtonFace isPending={isPending} onColour={variant === 'primary' || variant === 'accent' || variant === 'negative'}>
                {children}
            </ButtonFace>
        </div>
    );
}

const STATUS_ICONS: Record<ModalStatus, React.ReactElement> = {
    success: <CheckmarkCircle size="S" UNSAFE_className="modal-status-icon modal-status-success" />,
    warning: <Alert size="S" UNSAFE_className="modal-status-icon modal-status-warning" />,
    error: <AlertCircle size="S" UNSAFE_className="modal-status-icon modal-status-error" />,
};

/**
 * True for a moment after the dialog's width step changes: long enough for the box to ease to its
 * new width with its content hidden, so text never visibly rewraps (dialog design rules). A layout
 * effect, so the content is hidden before the new view is first painted.
 */
function useWidthStepChange(step: string): boolean {
    const previous = useRef(step);
    const [resizing, setResizing] = useState(false);
    useLayoutEffect(() => {
        if (previous.current === step) return undefined;
        previous.current = step;
        setResizing(true);
        const timer = setTimeout(() => setResizing(false), FRONTEND_TIMEOUTS.GROWTH_SETTLE);
        return () => clearTimeout(timer);
    }, [step]);
    return resizing;
}

export function Modal({
    title,
    status,
    size = 'M',
    actionButtons = [],
    onClose,
    closeLabel = 'Close',
    closeVariant = 'secondary',
    hideClose = false,
    fitContent = false,
    wide = false,
    children,
}: ModalProps) {
    // Map custom sizes to Dialog-compatible sizes
    const dialogSize: 'S' | 'M' | 'L' =
        size === 'fullscreen' || size === 'fullscreenTakeover' ? 'L' : size;
    const resizing = useWidthStepChange(wide ? 'XL' : dialogSize);

    return (
        // Every class a literal, so the stylesheet scan can read them in every bundle that
        // renders a modal. (A helper built this string until 2026-10-15, which the scan counted
        // unreadable once per bundle.) `modal-dialog` pins the dialog near the top and eases
        // its width; `is-resizing` hides the content while it does.
        <Dialog
            size={dialogSize}
            UNSAFE_className={cn(
                'modal-dialog',
                fitContent && 'modal-fit-content',
                wide && 'modal-wide',
                resizing && 'is-resizing',
            )}
        >
            <Heading>
                <span className="modal-title">
                    {status ? STATUS_ICONS[status] : null}
                    <span>{title}</span>
                </span>
            </Heading>
            <Divider />
            <Content UNSAFE_className="modal-content">
                {/* The body GROWS so the footer is pushed to the dialog's bottom even when
                    the content is short. `position: sticky` alone only pins against an
                    OVERFLOWING container, so a short body (a spinner, a two-row list) left
                    the footer floating mid-dialog with dead space beneath it. */}
                <div className="modal-body">{children}</div>
                <div className="modal-footer-actions">
                    {/* Close/Cancel on left, primary actions on right (per Spectrum design guidelines) */}
                    {!hideClose && (
                        <FocusableButton variant={closeVariant} onPress={onClose}>
                            {closeLabel}
                        </FocusableButton>
                    )}
                    {actionButtons.map((button, index) => (
                        <FocusableButton
                            key={index}
                            variant={button.variant}
                            onPress={button.onPress}
                            isDisabled={button.isDisabled}
                            isPending={button.isPending}
                            pendingName={button.label}
                        >
                            {button.label}
                        </FocusableButton>
                    ))}
                </div>
            </Content>
        </Dialog>
    );
}
