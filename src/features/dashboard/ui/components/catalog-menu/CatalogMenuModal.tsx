/**
 * CatalogMenuModal — build the storefront's menu from the Commerce category tree, or
 * take it back out (EDS-24). Opened from the Catalog Menu tile in the dashboard's
 * storefront zone; Build and Remove send the messages the agent's `build_catalog_menu`
 * and `remove_catalog_menu` dispatch into, so the two surfaces do the same thing.
 *
 * One view at a time in the house vocabulary (the DemoPackageModal shape): what it does
 * and the two actions; a confirm before Build and before Remove (each changes a live
 * site); the spinner alone while a run works;
 * then the handler's own summary or refusal. Every view sits on the same reserved
 * height, so the dialog does not jump while it works.
 *
 * @module features/dashboard/ui/components/catalog-menu/CatalogMenuModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import { useCatalogMenu, type CatalogMenuStage, type UseCatalogMenu } from './useCatalogMenu';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { Modal, type ActionButton } from '@/core/ui/components/ui/Modal';

export const CATALOG_MENU_COPY = {
    title: 'Catalog Menu',
    intro:
        "Builds your storefront's menu from the Commerce category tree: one page per category set " +
        "to Include in Menu, and a 'Shop the catalog' line in your nav. Items you typed into the nav " +
        'stay, and pages you edit are never overwritten.',
    needs: 'Needs the Demo Builder Blocks library in the storefront.',
    build: 'Build the menu from the Commerce catalog',
    remove: 'Remove the catalog menu',
    confirmBuild:
        'This writes and publishes one page per category to your live storefront and adds the ' +
        'menu to your nav. Visitors see it at once. Remove the catalog menu takes it back out.',
    confirmBuildAction: 'Build',
    confirmRemove:
        'This unpublishes and deletes the category pages Demo Builder wrote and takes the menu out of ' +
        'your nav. Visitors stop seeing them at once. Pages you edited stay.',
    confirm: 'Remove',
    back: 'Back',
    building: 'Building the catalog menu',
    buildingFor: 'Writing and publishing a page per category. This can take a few minutes.',
    removing: 'Removing the catalog menu',
    built: 'Catalog menu built',
    removed: 'Catalog menu removed',
    buildFailed: "Couldn't build the catalog menu",
    removeFailed: "Couldn't remove the catalog menu",
} as const;

const HEIGHT = '280px';

export interface CatalogMenuModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * The footer's actions for the view on screen: Remove and Build to choose, Back and the
 * verb to confirm (both change a live site), none while working or after.
 */
function footer(flow: UseCatalogMenu): ActionButton[] {
    if (flow.stage.kind === 'choose') {
        return [
            { label: CATALOG_MENU_COPY.remove, variant: 'secondary', onPress: flow.askRemove },
            { label: CATALOG_MENU_COPY.build, variant: 'accent', onPress: flow.askBuild },
        ];
    }
    if (flow.stage.kind === 'confirm-build') {
        return [
            { label: CATALOG_MENU_COPY.back, variant: 'secondary', onPress: flow.back },
            { label: CATALOG_MENU_COPY.confirmBuildAction, variant: 'accent', onPress: flow.build },
        ];
    }
    if (flow.stage.kind === 'confirm-remove') {
        return [
            { label: CATALOG_MENU_COPY.back, variant: 'secondary', onPress: flow.back },
            { label: CATALOG_MENU_COPY.confirm, variant: 'negative', onPress: flow.remove },
        ];
    }
    return [];
}

function Outcome({ stage }: { stage: Extract<CatalogMenuStage, { kind: 'done' | 'failed' }> }): React.ReactElement {
    const building = stage.action === 'build';
    if (stage.kind === 'done') {
        return (
            <StatusDisplay
                variant="success"
                title={building ? CATALOG_MENU_COPY.built : CATALOG_MENU_COPY.removed}
                message={stage.summary}
                centerMessage
                height={HEIGHT}
            />
        );
    }
    return (
        <StatusDisplay
            variant="error"
            title={building ? CATALOG_MENU_COPY.buildFailed : CATALOG_MENU_COPY.removeFailed}
            message={stage.error}
            centerMessage
            height={HEIGHT}
        />
    );
}

/** The words for the choose and confirm views. */
function promptFor(kind: 'choose' | 'confirm-build' | 'confirm-remove'): string {
    if (kind === 'confirm-build') return CATALOG_MENU_COPY.confirmBuild;
    if (kind === 'confirm-remove') return CATALOG_MENU_COPY.confirmRemove;
    return `${CATALOG_MENU_COPY.intro} ${CATALOG_MENU_COPY.needs}`;
}

function Body({ stage }: { stage: CatalogMenuStage }): React.ReactElement {
    if (stage.kind === 'busy') {
        const building = stage.action === 'build';
        return (
            <CenteredFeedbackContainer height={HEIGHT}>
                <LoadingDisplay
                    size="L"
                    message={building ? CATALOG_MENU_COPY.building : CATALOG_MENU_COPY.removing}
                    helperText={building ? CATALOG_MENU_COPY.buildingFor : undefined}
                />
            </CenteredFeedbackContainer>
        );
    }
    if (stage.kind === 'done' || stage.kind === 'failed') return <Outcome stage={stage} />;
    return (
        <CenteredFeedbackContainer height={HEIGHT}>
            <p className="export-section-text">{promptFor(stage.kind)}</p>
        </CenteredFeedbackContainer>
    );
}

/** The open dialog: owns the state, so the footer carries the actions beside Close. */
function Journey({ onClose }: Pick<CatalogMenuModalProps, 'onClose'>): React.ReactElement {
    const flow = useCatalogMenu();
    return (
        <Modal
            title={CATALOG_MENU_COPY.title}
            size="M"
            onClose={onClose}
            closeLabel="Close"
            actionButtons={footer(flow)}
        >
            <div data-testid="catalog-menu-body">
                <Body stage={flow.stage} />
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
export function CatalogMenuModal({ isOpen, onClose }: CatalogMenuModalProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen ? <Journey onClose={onClose} /> : null}
        </DialogContainer>
    );
}
