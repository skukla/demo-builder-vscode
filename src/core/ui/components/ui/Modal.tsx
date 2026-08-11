import { Dialog, Heading, Content, Divider } from '@adobe/react-spectrum';
import React, { ReactNode, useCallback } from 'react';

export interface ActionButton {
    label: string;
    variant: 'primary' | 'secondary' | 'accent' | 'negative';
    onPress: () => void;
    isDisabled?: boolean;
}

export interface ModalProps {
    title: string;
    size?: 'S' | 'M' | 'L' | 'fullscreen' | 'fullscreenTakeover';
    actionButtons?: ActionButton[];
    onClose: () => void;
    /** Label for the built-in close button (default "Close"). */
    closeLabel?: string;
    /** Variant for the built-in close button (default "secondary"). */
    closeVariant?: 'primary' | 'secondary' | 'accent' | 'negative';
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
    children: ReactNode;
}

/**
 * Focusable button wrapper to ensure buttons are in the same tab order
 * as custom focusable elements (tabIndex={0}) in the modal content.
 * Spectrum's ButtonGroup is excluded from focus trap with custom elements.
 */
interface FocusableButtonProps {
    variant: 'primary' | 'secondary' | 'accent' | 'negative';
    onPress: () => void;
    isDisabled?: boolean;
    children: React.ReactNode;
}

function FocusableButton({ variant, onPress, isDisabled, children }: FocusableButtonProps) {
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
        negative: 'modal-button-secondary',
    };
    const variantClass = variantClassMap[variant];

    return (
        <div
            role="button"
            tabIndex={isDisabled ? -1 : 0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={`modal-button ${variantClass}${isDisabled ? ' modal-button-disabled' : ''}`}
            aria-disabled={isDisabled}
        >
            {children}
        </div>
    );
}

export function Modal({
    title,
    size = 'M',
    actionButtons = [],
    onClose,
    closeLabel = 'Close',
    closeVariant = 'secondary',
    fitContent = false,
    children,
}: ModalProps) {
    // Map custom sizes to Dialog-compatible sizes
    const dialogSize: 'S' | 'M' | 'L' =
        size === 'fullscreen' || size === 'fullscreenTakeover' ? 'L' : size;

    return (
        <Dialog size={dialogSize} UNSAFE_className={fitContent ? 'modal-fit-content' : undefined}>
            <Heading>{title}</Heading>
            <Divider />
            <Content UNSAFE_className="modal-content">
                {/* The body GROWS so the footer is pushed to the dialog's bottom even when
                    the content is short. `position: sticky` alone only pins against an
                    OVERFLOWING container, so a short body (a spinner, a two-row list) left
                    the footer floating mid-dialog with dead space beneath it. */}
                <div className="modal-body">{children}</div>
                <div className="modal-footer-actions">
                    {/* Close/Cancel on left, primary actions on right (per Spectrum design guidelines) */}
                    <FocusableButton variant={closeVariant} onPress={onClose}>
                        {closeLabel}
                    </FocusableButton>
                    {actionButtons.map((button, index) => (
                        <FocusableButton
                            key={index}
                            variant={button.variant}
                            onPress={button.onPress}
                            isDisabled={button.isDisabled}
                        >
                            {button.label}
                        </FocusableButton>
                    ))}
                </div>
            </Content>
        </Dialog>
    );
}
