/**
 * ExportModal — the dashboard's Export dialog: everything that can leave this
 * project for someone else to use, one section per part (owner, 2026-09-13:
 * Export is the umbrella; parts arrive as they are built). Today two parts:
 * the setup file, and the storefront as a demo package (Edge Delivery only).
 * The core Modal in a DialogContainer, mounted only while open.
 *
 * @module features/dashboard/ui/components/export/ExportModal
 */

import { Button, DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { DemoPackageSection } from '../demo-package/DemoPackageSection';
import { Modal } from '@/core/ui/components/ui/Modal';

export const EXPORT_COPY = {
    title: 'Export',
    intro: 'What can leave this project for someone else to use. Each part is separate.',
    setup: 'Setup file',
    setupText:
        'Your Commerce, Adobe, GitHub and DA.live settings in one file. A colleague imports it to build a project with the same setup.',
    setupButton: 'Save setup file…',
    storefront: 'Storefront as demo package',
} as const;

export interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Edge Delivery project: the storefront part is offered. */
    isEds: boolean;
    /** Opens the host's save dialog for the setup file. */
    onExportSetup: () => void;
}

function Journey({ isEds, onExportSetup, onClose }: Omit<ExportModalProps, 'isOpen'>): React.ReactElement {
    return (
        <Modal title={EXPORT_COPY.title} size="L" fitContent onClose={onClose} closeLabel="Close">
            <div className="intflow-stage-body export-body">
                <p className="export-section-text">{EXPORT_COPY.intro}</p>
                <section className="export-section" data-testid="export-setup">
                    <p className="intflow-section-label">{EXPORT_COPY.setup}</p>
                    <p className="export-section-text">{EXPORT_COPY.setupText}</p>
                    <Button variant="secondary" onPress={onExportSetup}>
                        {EXPORT_COPY.setupButton}
                    </Button>
                </section>
                {isEds ? (
                    <section className="export-section" data-testid="export-storefront">
                        <p className="intflow-section-label">{EXPORT_COPY.storefront}</p>
                        <DemoPackageSection />
                    </section>
                ) : null}
            </div>
        </Modal>
    );
}

/**
 * The dialog host: mounts the journey only while open.
 *
 * @param props - open state, the project kind and the callbacks
 * @returns the dialog container
 */
export function ExportModal({ isOpen, ...rest }: ExportModalProps): React.ReactElement {
    return <DialogContainer onDismiss={rest.onClose}>{isOpen ? <Journey {...rest} /> : null}</DialogContainer>;
}
