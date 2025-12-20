import { Dialog, Heading, Content, Divider, Button } from '@adobe/react-spectrum';
import React, { ReactNode, useCallback } from 'react';

export interface ActionButton {
    label: string;
    variant: 'primary' | 'secondary' | 'accent' | 'negative';
    onPress: () => void;
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
    children: React.ReactNode;
}

function FocusableButton({ variant, onPress, children }: FocusableButtonProps) {
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPress();
            }
        },
        [onPress],
    );

    // Map variant to CSS class
    const variantClass = variant === 'primary' ? 'modal-button-primary' : 'modal-button-secondary';

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onPress}
            onKeyDown={handleKeyDown}
            className={`modal-button ${variantClass}`}
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
                <div className="mt-6 pt-4 flex justify-end gap-2 border-t border-gray-200">
                    {/* Close/Cancel on left, primary actions on right (per Spectrum design guidelines) */}
                    <FocusableButton variant="secondary" onPress={onClose}>
                        Close
                    </FocusableButton>
                    {actionButtons.map((button, index) => (
                        <FocusableButton
                            key={index}
                            variant={button.variant}
                            onPress={button.onPress}
                        >
                            {button.label}
                        </FocusableButton>
                    ))}
                </div>
            </Content>
        </Dialog>
    );
}

