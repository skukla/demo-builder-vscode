/**
 * menuIcons — one icon vocabulary for every card kebab menu.
 *
 * Card menus across the extension name the same concepts ("open this thing",
 * "delete this thing"), so they must draw those from ONE map or the same idea
 * ends up with two glyphs. This map lived inside `ProjectActionsMenu`, out of
 * reach of the integrations card menu, which is why that menu shipped with no
 * icons at all (2026-07-31).
 *
 * Keys are CONCEPTS, not components: `globe` means "open something live"
 * wherever it appears, so a project's "Open in Browser" and an integration's
 * "Open ↗" are the same glyph by construction.
 *
 * @module core/ui/components/ui/menuIcons
 */

import Add from '@spectrum-icons/workflow/Add';
import Beaker from '@spectrum-icons/workflow/Beaker';
import Clock from '@spectrum-icons/workflow/Clock';
import Copy from '@spectrum-icons/workflow/Copy';
import DataAdd from '@spectrum-icons/workflow/DataAdd';
import DataUpload from '@spectrum-icons/workflow/DataUpload';
import Delete from '@spectrum-icons/workflow/Delete';
import Deselect from '@spectrum-icons/workflow/Deselect';
import Duplicate from '@spectrum-icons/workflow/Duplicate';
import Edit from '@spectrum-icons/workflow/Edit';
import Export from '@spectrum-icons/workflow/Export';
import FolderOpen from '@spectrum-icons/workflow/FolderOpen';
import Globe from '@spectrum-icons/workflow/Globe';
import Key from '@spectrum-icons/workflow/Key';
import MagicWand from '@spectrum-icons/workflow/MagicWand';
import More from '@spectrum-icons/workflow/More';
import PinOff from '@spectrum-icons/workflow/PinOff';
import PinOn from '@spectrum-icons/workflow/PinOn';
import Play from '@spectrum-icons/workflow/Play';
import Refresh from '@spectrum-icons/workflow/Refresh';
import Revert from '@spectrum-icons/workflow/Revert';
import SaveFloppy from '@spectrum-icons/workflow/SaveFloppy';
import SelectBoxAll from '@spectrum-icons/workflow/SelectBoxAll';
import Settings from '@spectrum-icons/workflow/Settings';
import Share from '@spectrum-icons/workflow/Share';
import Stop from '@spectrum-icons/workflow/Stop';
import UserAdmin from '@spectrum-icons/workflow/UserAdmin';
import React from 'react';

/** Concept → glyph. Add a concept here, never a second glyph for one concept. */
const MENU_ICONS: Record<string, React.ReactElement> = {
    play: <Play size="S" />,
    stop: <Stop size="S" />,
    globe: <Globe size="S" />,
    dalive: <Edit size="S" />,
    edit: <Edit size="S" />,
    copy: <Copy size="S" />,
    duplicate: <Duplicate size="S" />,
    reset: <Revert size="S" />,
    republish: <Globe size="S" />,
    export: <Export size="S" />,
    ai: <MagicWand size="S" />,
    admin: <UserAdmin size="S" />,
    redeploy: <Refresh size="S" />,
    more: <More size="S" />,
    pinOn: <PinOn size="S" />,
    pinOff: <PinOff size="S" />,
    delete: <Delete size="S" />,
    /** API access/entitlements — a key reads as "what this is allowed to reach". */
    apiAccess: <Key size="S" />,
    /** Values a person sets on a thing (an integration's Settings). */
    settings: <Settings size="S" />,
    /** Try something out without it taking effect — the workbench's whole job. */
    measure: <Beaker size="S" />,
    /** Fill something with records from elsewhere (an ERP from Commerce). */
    loadData: <DataAdd size="S" />,
    /** Add another of something beside what is there (another ERP for an integration). */
    add: <Add size="S" />,
    /** Something unavailable for a while (a demo ERP's simulated downtime). */
    downtime: <Clock size="S" />,
    /** Keep a copy as a file the SC chooses where to put (a datapack's Save as file). */
    saveFile: <SaveFloppy size="S" />,
    /** Open a file the SC picks (a datapack's Load from file). */
    openFile: <FolderOpen size="S" />,
    /** Take what is in a store into something kept (Save store changes to this pack). */
    capture: <DataUpload size="S" />,
    /** Let others see and use it (a library pack's Share and Stop sharing). */
    share: <Share size="S" />,
    /** Tick every box in a list (a datapack form's Select all). */
    selectAll: <SelectBoxAll size="S" />,
    /** Untick every box in a list (the same button's Clear all). */
    clearAll: <Deselect size="S" />,
};

/**
 * The glyph for a menu concept.
 *
 * @param concept - a key of the shared vocabulary
 * @returns the icon, or null for an unknown concept (the row still renders)
 */
export function renderMenuIcon(concept: string | undefined): React.ReactElement | null {
    return concept ? (MENU_ICONS[concept] ?? null) : null;
}
