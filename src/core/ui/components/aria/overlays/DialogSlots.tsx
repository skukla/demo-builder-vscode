/**
 * Dialog Slot Components
 *
 * Slot components for flexible Dialog content structure.
 * Used when dialogs need custom header, content, or footer layouts
 * instead of the standard Dialog props.
 *
 * @example
 * <Dialog>
 *   <DialogHeader>
 *     <Heading>Custom Title</Heading>
 *     <Text>Step 1 of 3</Text>
 *   </DialogHeader>
 *   <Divider />
 *   <DialogContent>
 *     <p>Main content here</p>
 *   </DialogContent>
 *   <DialogFooter>
 *     <Button onPress={close}>Close</Button>
 *   </DialogFooter>
 * </Dialog>
 */

import React, { forwardRef } from 'react';
import styles from './Dialog.module.css';
import { cn } from '@/core/ui/utils/classNames';

// Slot type markers for React.Children detection
const DIALOG_HEADER_SLOT = Symbol('DialogHeader');
const DIALOG_CONTENT_SLOT = Symbol('DialogContent');
const DIALOG_FOOTER_SLOT = Symbol('DialogFooter');

export interface DialogSlotProps {
    /** Slot content */
    children: React.ReactNode;
    /** Additional CSS class */
    className?: string;
}

/**
 * DialogHeader - Custom header slot for Dialog
 *
 * Use when you need complex header content beyond a simple title string.
 * Pairs with DialogContent and DialogFooter for full control.
 */
export const DialogHeader = forwardRef<HTMLDivElement, DialogSlotProps>(
    function DialogHeader({ children, className }, ref) {
        return (
            <div
                ref={ref}
                className={cn(styles.header, className)}
                data-slot="header"
            >
                {children}
            </div>
        );
    },
);

DialogHeader.displayName = 'DialogHeader';
// @ts-expect-error - Adding symbol for slot detection
DialogHeader.__slot__ = DIALOG_HEADER_SLOT;

/**
 * DialogContent - Main content area slot for Dialog
 *
 * Replaces Spectrum's <Content> slot component.
 * Contains the primary dialog content.
 */
export const DialogContent = forwardRef<HTMLDivElement, DialogSlotProps>(
    function DialogContent({ children, className }, ref) {
        return (
            <div
                ref={ref}
                className={cn(styles.content, className)}
                data-slot="content"
            >
                {children}
            </div>
        );
    },
);

DialogContent.displayName = 'DialogContent';
// @ts-expect-error - Adding symbol for slot detection
DialogContent.__slot__ = DIALOG_CONTENT_SLOT;

/**
 * DialogFooter - Footer slot for Dialog actions
 *
 * Replaces Spectrum's <Footer> slot component.
 * Typically contains action buttons (Primary, Secondary, Cancel).
 */
export const DialogFooter = forwardRef<HTMLDivElement, DialogSlotProps>(
    function DialogFooter({ children, className }, ref) {
        return (
            <div
                ref={ref}
                className={cn(styles.footer, className)}
                data-slot="footer"
            >
                {children}
            </div>
        );
    },
);

DialogFooter.displayName = 'DialogFooter';
// @ts-expect-error - Adding symbol for slot detection
DialogFooter.__slot__ = DIALOG_FOOTER_SLOT;

/**
 * Helper to check if a React element is a specific slot type
 */
export function isSlotElement(
    element: React.ReactNode,
    slotSymbol: symbol,
): boolean {
    if (!React.isValidElement(element)) return false;
    const type = element.type as { __slot__?: symbol };
    return type.__slot__ === slotSymbol;
}

/**
 * Helper to check if children contain any slot components
 */
export function hasSlotChildren(children: React.ReactNode): boolean {
    let hasSlot = false;
    React.Children.forEach(children, (child) => {
        if (React.isValidElement(child)) {
            const type = child.type as { __slot__?: symbol };
            if (type.__slot__) {
                hasSlot = true;
            }
        }
    });
    return hasSlot;
}

// Export symbols for external slot detection if needed
export {
    DIALOG_HEADER_SLOT,
    DIALOG_CONTENT_SLOT,
    DIALOG_FOOTER_SLOT,
};
