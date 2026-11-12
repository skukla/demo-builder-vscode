/**
 * J8's flyout action bar and More menu, as overview.md Phase 7 settles them and as the product's
 * `PackActions.tsx` draws them (`CardActionsMenu` with a label, `Section`s, `renderMenuIcon`):
 *
 *   upper section: Save as File; Undo Last Save, on the datapack
 *   the demo uses (J3-3); Share Datapack or Stop Sharing Datapack, on the SC's own datapack
 *   lower section: Uninstall, on the datapack the demo uses; Delete Datapack, on the SC's own (never
 *   on a Demo Builder datapack). Delete Store Configuration is removed.
 *
 * In a project's Datapacks the main button is Install, or Restore My Luma on the datapack the demo
 * uses. The Datapack Library has no store, so its bar is More alone (Phase 7b: one pinned bar, the
 * same buttons in the same order, everywhere).
 */

import { Button, Item, Section, Text } from '@adobe/react-spectrum';
import React from 'react';
import { DEMO_PACK, OTHER_PACK, type PackName } from './scenarioInstall';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';

/** A More menu row's key: what it opens. */
export type MenuKey = 'save-file' | 'undo' | 'share' | 'uninstall' | 'delete';

/** Which screen the flyout is on: a project's Datapacks, or the Datapack Library. */
export type J8View = 'project' | 'library';

/** Where each datapack comes from: My Luma is the SC's own, Bodea the extension's. */
export const TAGS: Record<PackName, string> = { [DEMO_PACK]: 'Mine', [OTHER_PACK]: 'Demo Builder' };

/** The SC's own datapack: it has saves to look back over, and it can be shared and deleted. */
const own = (pack: PackName): boolean => TAGS[pack] === 'Mine';

interface Row {
    key: MenuKey;
    label: string;
    icon: string;
}

/** The upper section: what any datapack offers, then what the demo's own and the SC's own add. */
function packRows(pack: PackName, inDemo: boolean, view: J8View): Row[] {
    const rows: Row[] = [{ key: 'save-file', label: 'Save as File', icon: 'saveFile' }];
    if (inDemo) rows.push({ key: 'undo', label: 'Undo Last Save', icon: 'reset' });
    if (own(pack)) rows.push({ key: 'share', label: 'Share', icon: 'share' });
    return rows;
}

/** The lower section: what takes data out of Commerce, then what leaves the library. */
function removeRows(pack: PackName, inDemo: boolean): Row[] {
    return [
        ...(inDemo ? [{ key: 'uninstall' as const, label: 'Uninstall', icon: 'delete' }] : []),
        ...(own(pack) ? [{ key: 'delete' as const, label: 'Delete', icon: 'delete' }] : []),
    ];
}

const renderRow = (row: Row) => (
    <Item key={row.key} textValue={row.label}>
        {renderMenuIcon(row.icon)}
        <Text>{row.label}</Text>
    </Item>
);

/** The main button: Restore on the demo's datapack, Switch to when another is installed, else Install. */
function mainLabel(pack: PackName, demo: boolean, switching: boolean): string {
    if (demo) return `Restore ${pack}`;
    return switching ? `Switch to ${pack}` : 'Install';
}

export interface J8ActionsProps {
    pack: PackName;
    view: J8View;
    /** The datapack the demo uses: its main button is Restore, and its menu adds Undo and Uninstall. */
    inDemo: boolean;
    /** Another datapack is installed: the main button reads Switch to <pack> (owner, 2026-11-12). */
    switching?: boolean;
    onMain: () => void;
    onMenu: (key: MenuKey) => void;
}

export function J8Actions({ pack, view, inDemo, switching, onMain, onMenu }: J8ActionsProps): React.ReactElement {
    const demo = view === 'project' && inDemo;
    const removing = removeRows(pack, demo);
    return (
        <>
            <div className="proto-note">Prototype: Save as File opens VS Code&apos;s save dialog, not drawn.</div>
            <div className="db-drawer-actions">
                {view === 'project' ? <Button variant="accent" onPress={onMain}>{mainLabel(pack, demo, switching === true)}</Button> : null}
                <CardActionsMenu label="More" ariaLabel={`More actions for ${pack}`} onAction={(key) => onMenu(key as MenuKey)}>
                    <Section key="pack">{packRows(pack, demo, view).map(renderRow)}</Section>
                    {removing.length > 0 ? <Section key="remove">{removing.map(renderRow)}</Section> : null}
                </CardActionsMenu>
            </div>
        </>
    );
}
