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
import { DemoPackageSection } from './DemoPackageSection';
import { Modal } from '@/core/ui/components/ui/Modal';

export const DEMO_PACKAGE_TITLE = 'Save as demo package';

export interface DemoPackageModalProps {
    isOpen: boolean;
    onClose: () => void;
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
            {isOpen ? (
                <Modal title={DEMO_PACKAGE_TITLE} size="L" fitContent onClose={onClose} closeLabel="Close">
                    <div className="intflow-stage-body">
                        <DemoPackageSection />
                    </div>
                </Modal>
            ) : null}
        </DialogContainer>
    );
}
