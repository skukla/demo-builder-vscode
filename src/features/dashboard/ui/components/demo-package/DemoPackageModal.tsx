/**
 * DemoPackageModal — "Save as demo package": turn the storefront you built into a
 * card on your own Welcome step, the way Isle5 is one, so new projects can be
 * built from it. Its own door on the More menu (owner, 2026-09-13: saving a
 * package is about you; Export is about handing an artifact to someone else).
 * The core Modal in a DialogContainer, mounted only while open.
 *
 * @module features/dashboard/ui/components/demo-package/DemoPackageModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { DemoPackageSection, PACKAGE_COPY } from './DemoPackageSection';
import { useDemoPackage, type UseDemoPackage } from './useDemoPackage';
import { Modal, type ActionButton } from '@/core/ui/components/ui/Modal';

export const DEMO_PACKAGE_TITLE = 'Save as demo package';

export interface DemoPackageModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * The dialog footer's actions: Remove for a saved package, then Save or
 * Update. None unless the form is the view (read, nothing in flight, nothing
 * just done).
 *
 * @param flow - the dialog's state
 * @returns the Modal's action buttons
 */
function packageActions(flow: UseDemoPackage): ActionButton[] {
    if (flow.load.status !== 'ready' || flow.busy || flow.outcome) return [];
    const saved = flow.load.saved;
    return [
        ...(saved ? [{ label: PACKAGE_COPY.remove, variant: 'secondary' as const, onPress: flow.remove }] : []),
        {
            label: saved ? PACKAGE_COPY.update : PACKAGE_COPY.save,
            variant: 'accent' as const,
            onPress: flow.save,
            isDisabled: !flow.canSave,
        },
    ];
}

/** The open dialog: owns the state, so the footer carries Save and Remove beside Close. */
function Journey({ onClose }: Pick<DemoPackageModalProps, 'onClose'>): React.ReactElement {
    const flow = useDemoPackage();
    return (
        <Modal
            title={DEMO_PACKAGE_TITLE}
            size="L"
            fitContent
            onClose={onClose}
            closeLabel="Close"
            actionButtons={packageActions(flow)}
        >
            <div className="intflow-stage-body">
                <DemoPackageSection flow={flow} />
            </div>
        </Modal>
    );
}

/**
 * The dialog host: mounts the body only while open.
 *
 * @param props - open state and the close callback
 * @returns the dialog container
 */
export function DemoPackageModal({ isOpen, onClose }: DemoPackageModalProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen ? <Journey onClose={onClose} /> : null}
        </DialogContainer>
    );
}
