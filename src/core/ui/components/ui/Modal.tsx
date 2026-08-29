import { Dialog, Heading, Content, Divider } from '@adobe/react-spectrum';
import React, { ReactNode, useCallback } from 'react';

import { cn } from '@/core/ui/utils/classNames';
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
 * The dialog's opt-in size overrides, as one class string.
 *
 * A helper rather than two ternaries inline: chained ternaries are on the
 * project's avoid list and the SOP scan fails on them. Returns undefined when
 * neither applies, so the default Dialog keeps a clean class list.
 */
function dialogClassName(fitContent: boolean, wide: boolean): string | undefined {
    const classes: string[] = [];
    if (fitContent) {
        classes.push('modal-fit-content');
    }
    if (wide) {
        classes.push('modal-wide');
    }
    return classes.length > 0 ? classes.join(' ') : undefined;
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
            className={cn('modal-button', variantClass, isDisabled && 'modal-button-disabled')}
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
    wide = false,
    children,
}: ModalProps) {
    // Map custom sizes to Dialog-compatible sizes
    const dialogSize: 'S' | 'M' | 'L' =
        size === 'fullscreen' || size === 'fullscreenTakeover' ? 'L' : size;

    return (
        <Dialog size={dialogSize} UNSAFE_className={dialogClassName(fitContent, wide)}>
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
