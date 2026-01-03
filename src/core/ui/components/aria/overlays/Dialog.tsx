/**
 * Dialog Component
 *
 * An accessible modal dialog component built with React Aria for focus trapping,
 * keyboard interactions, and proper ARIA semantics. Uses CSS Modules for styling
 * with zero !important declarations.
 *
 * Supports three usage patterns:
 *
 * 1. Simple props-based (title, children, actionButtons):
 * @example
 * <Dialog isOpen={true} title="Confirm Action" onClose={() => setIsOpen(false)}>
 *   <p>Are you sure you want to proceed?</p>
 * </Dialog>
 *
 * 2. Slot-based (DialogHeader, DialogContent, DialogFooter):
 * @example
 * <Dialog isOpen={true} onClose={() => setIsOpen(false)}>
 *   <DialogHeader><Heading>Custom Title</Heading></DialogHeader>
 *   <Divider />
 *   <DialogContent><p>Content here</p></DialogContent>
 *   <DialogFooter><Button>Close</Button></DialogFooter>
 * </Dialog>
 *
 * 3. Render function (for close access):
 * @example
 * <DialogTrigger>
 *   <Button>Open</Button>
 *   {(close) => (
 *     <Dialog title="Settings">
 *       <p>Content</p>
 *       <Button onPress={close}>Done</Button>
 *     </Dialog>
 *   )}
 * </DialogTrigger>
 */

import React, { createContext, useContext } from 'react';
import {
    Dialog as AriaDialog,
    DialogTrigger as AriaDialogTrigger,
    Modal,
    ModalOverlay,
    Heading,
} from 'react-aria-components';
import { cn } from '@/core/ui/utils/classNames';
import { Button } from '../interactive/Button';
import { Divider } from '../primitives/Divider';
import { hasSlotChildren } from './DialogSlots';
import styles from './Dialog.module.css';

/**
 * Context to pass close function to children
 */
export interface DialogContextValue {
    close: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

/**
 * Hook to access dialog close function from within Dialog children
 */
export function useDialogContext(): DialogContextValue {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error('useDialogContext must be used within a Dialog');
    }
    return context;
}

export interface DialogAction {
    /** Button label */
    label: string;
    /** Button variant */
    variant?: 'accent' | 'secondary' | 'cta' | 'negative';
    /** Click handler */
    onPress: () => void;
}

export type DialogSize = 'S' | 'M' | 'L';

/**
 * Size to CSS class mapping
 */
const sizeClasses: Record<DialogSize, string> = {
    S: styles.sizeS,
    M: styles.sizeM,
    L: styles.sizeL,
};

export interface DialogProps {
    /** Dialog title */
    title?: string;
    /** Whether dialog is open (controlled) - only for standalone usage */
    isOpen?: boolean;
    /** Close handler */
    onClose?: () => void;
    /** Whether clicking backdrop closes dialog */
    isDismissable?: boolean;
    /** Dialog size */
    size?: DialogSize;
    /** Action buttons in footer */
    actionButtons?: DialogAction[];
    /** Show X close button in header */
    showCloseButton?: boolean;
    /** Dialog description for accessibility */
    description?: string;
    /** Dialog content */
    children: React.ReactNode;
    /** Additional CSS class */
    className?: string;
}

/**
 * Inner dialog content component (used by both standalone and DialogTrigger modes)
 */
interface DialogInnerContentProps {
    title?: string;
    onClose?: () => void;
    actionButtons?: DialogAction[];
    showCloseButton?: boolean;
    description?: string;
    children: React.ReactNode;
    /** Use slot-based children instead of structured content */
    useSlotMode?: boolean;
}

function DialogInnerContent({
    title,
    onClose,
    actionButtons = [],
    showCloseButton = false,
    description,
    children,
    useSlotMode = false,
}: DialogInnerContentProps) {
    return (
        <AriaDialog className={styles.dialog} aria-modal="true">
            {({ close }) => (
                <DialogContext.Provider value={{ close }}>
                    {useSlotMode ? (
                        // Slot mode: children contain DialogHeader, DialogContent, DialogFooter
                        <>{children}</>
                    ) : (
                        // Structured mode: use props to build dialog structure
                        <>
                            {/* Header */}
                            {(title || showCloseButton) && (
                                <div className={styles.header}>
                                    {title && (
                                        <Heading slot="title" className={styles.title}>
                                            {title}
                                        </Heading>
                                    )}
                                    {showCloseButton && (
                                        <button
                                            className={styles.closeButton}
                                            onClick={() => {
                                                // Just call close() - onClose is called via ModalOverlay's onOpenChange
                                                close();
                                            }}
                                            aria-label="Close dialog"
                                            type="button"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                                <path d="M6 4.586L9.293 1.293l1.414 1.414L7.414 6l3.293 3.293-1.414 1.414L6 7.414l-3.293 3.293-1.414-1.414L4.586 6 1.293 2.707l1.414-1.414L6 4.586z" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            )}

                            {title && <Divider />}

                            {/* Description (for accessibility) */}
                            {description && (
                                <p className={styles.description}>{description}</p>
                            )}

                            {/* Content */}
                            <div className={styles.content}>
                                {children}
                            </div>

                            {/* Footer with actions */}
                            {(actionButtons.length > 0 || onClose) && (
                                <div className={styles.footer}>
                                    <Button
                                        variant="secondary"
                                        onPress={() => {
                                            // Just call close() - onClose is called via ModalOverlay's onOpenChange
                                            close();
                                        }}
                                    >
                                        Close
                                    </Button>
                                    {actionButtons.map((action, index) => (
                                        <Button
                                            key={index}
                                            variant={action.variant || 'accent'}
                                            onPress={action.onPress}
                                        >
                                            {action.label}
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </DialogContext.Provider>
            )}
        </AriaDialog>
    );
}

/**
 * Dialog - Accessible modal dialog with focus trapping
 * Replaces @adobe/react-spectrum Dialog component
 *
 * Provides:
 * - Focus trapping within modal
 * - Escape key closes dialog
 * - Click outside closes (if isDismissable)
 * - Returns focus to trigger on close
 * - Proper ARIA semantics
 *
 * Supports two content modes:
 * 1. Structured props: title, children (as content), actionButtons
 * 2. Slot-based: children contain DialogHeader, DialogContent, DialogFooter
 */
export function Dialog({
    title,
    isOpen,
    onClose,
    isDismissable = true,
    size = 'M',
    actionButtons = [],
    showCloseButton = false,
    description,
    children,
    className,
}: DialogProps) {
    // Check if we're inside a DialogTrigger (isOpen is undefined)
    // When used with DialogTrigger, isOpen is managed by the trigger
    const isStandalone = isOpen !== undefined;

    // For standalone usage, don't render if not open
    if (isStandalone && !isOpen) {
        return null;
    }

    // Detect if children contain slot components (DialogHeader, DialogContent, DialogFooter)
    const useSlotMode = hasSlotChildren(children);

    const sizeClass = sizeClasses[size];

    const modalContent = (
        <Modal
            className={cn(
                styles.modal,
                sizeClass,
                className
            )}
            data-size={size}
        >
            <DialogInnerContent
                title={title}
                onClose={onClose}
                actionButtons={actionButtons}
                showCloseButton={showCloseButton}
                description={description}
                useSlotMode={useSlotMode}
            >
                {children}
            </DialogInnerContent>
        </Modal>
    );

    // For standalone usage, wrap with ModalOverlay
    if (isStandalone) {
        return (
            <ModalOverlay
                className={styles.overlay}
                isDismissable={isDismissable}
                isOpen={isOpen}
                onOpenChange={(open) => !open && onClose?.()}
            >
                {modalContent}
            </ModalOverlay>
        );
    }

    // For DialogTrigger usage, just return ModalOverlay with Modal
    return (
        <ModalOverlay
            className={styles.overlay}
            isDismissable={isDismissable}
        >
            {modalContent}
        </ModalOverlay>
    );
}

Dialog.displayName = 'Dialog';

/**
 * DialogTrigger - Manages dialog open/close state
 * Wraps a trigger element and Dialog
 *
 * Supports two patterns:
 * 1. Two React elements: [trigger, dialog]
 * 2. Trigger + render function: [trigger, (close) => dialog]
 *
 * Spectrum compatibility: type="modal"|"popover" is accepted but only modal is implemented
 */
export interface DialogTriggerProps {
    /** Trigger element (must accept onPress) and Dialog or render function */
    children: [React.ReactElement, React.ReactElement | ((close: () => void) => React.ReactElement)];
    /** Controlled open state */
    isOpen?: boolean;
    /** Open state change handler */
    onOpenChange?: (isOpen: boolean) => void;
    /** Dialog type (Spectrum compatibility - only 'modal' is supported) */
    type?: 'modal' | 'popover';
}

export function DialogTrigger({ children, isOpen, onOpenChange, type: _type }: DialogTriggerProps) {
    const [trigger, dialogOrRenderFn] = children;

    // If second child is a function, we need to render it within a wrapper that provides close
    if (typeof dialogOrRenderFn === 'function') {
        return (
            <AriaDialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
                {trigger}
                <RenderFunctionWrapper renderDialog={dialogOrRenderFn} onOpenChange={onOpenChange} />
            </AriaDialogTrigger>
        );
    }

    // Standard two-element pattern
    return (
        <AriaDialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
            {children as [React.ReactElement, React.ReactElement]}
        </AriaDialogTrigger>
    );
}

DialogTrigger.displayName = 'DialogTrigger';

/**
 * Wrapper component that renders a function child with close prop
 */
interface RenderFunctionWrapperProps {
    renderDialog: (close: () => void) => React.ReactElement;
    onOpenChange?: (isOpen: boolean) => void;
}

function RenderFunctionWrapper({ renderDialog, onOpenChange }: RenderFunctionWrapperProps) {
    // Create a close function that triggers onOpenChange
    const close = () => onOpenChange?.(false);

    // Render the dialog with the close function
    const dialogElement = renderDialog(close);

    // Return the rendered dialog element
    return dialogElement;
}

RenderFunctionWrapper.displayName = 'RenderFunctionWrapper';
