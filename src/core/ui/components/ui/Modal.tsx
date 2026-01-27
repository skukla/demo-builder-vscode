import { Dialog, Heading, Content, Divider, Button } from '@adobe/react-spectrum';
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
    children,
}: ModalProps) {
    // Map custom sizes to Dialog-compatible sizes
    const dialogSize: 'S' | 'M' | 'L' =
        size === 'fullscreen' || size === 'fullscreenTakeover' ? 'L' : size;

    return (
        <Dialog size={dialogSize}>
            <Heading>{title}</Heading>
            <Divider />
            <Content>
                {children}
                <div className="modal-footer-actions">
                    {/* Close/Cancel on left, primary actions on right (per Spectrum design guidelines) */}
                    <FocusableButton variant="secondary" onPress={onClose}>
                        Close
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

