/**
 * The settings an open wizard follows: an SC can change one in the Settings tab with the wizard still
 * open, and it should show without restarting the wizard. Split out of `createProject.ts` when the
 * Datapacks step's settings joined them.
 *
 * @module features/project-creation/commands/wizardSettingsWatch
 */

import * as vscode from 'vscode';
import { affectsDatapackList } from '@/features/data-installer/services/dataInstallerConfig';
import { onDatapacksChanged } from '@/features/data-installer/services/datapackChanges';
import { DATAPACK_LIST_CHANGED_MESSAGE } from '@/features/data-installer/types';
import { ADDED_DEMOS_SETTING, readAddedDemos } from '@/features/project-creation/services/addedDemoSettings';
import { parseCustomBlockLibrarySettings } from '@/features/project-creation/services/customBlockLibraryUtils';
import type {
    AddedDemosUpdatedPayload,
    BlockLibraryDefaultsUpdatedPayload,
    CustomBlockLibraryDefaultsUpdatedPayload,
} from '@/types/webviewPayloads';

/**
 * Tell the wizard when a setting it shows changes.
 *
 * @param send - pushes a message to the wizard's webview
 * @returns the subscription
 */
export function watchWizardSettings(send: (type: string, payload?: unknown) => Promise<void>): vscode.Disposable {
    // The Datapacks step's list also follows the packs themselves: a change in a Datapacks screen or by an agent.
    const packs = onDatapacksChanged(() => void send(DATAPACK_LIST_CHANGED_MESSAGE));
    const settings = vscode.workspace.onDidChangeConfiguration((e) => {
        const config = vscode.workspace.getConfiguration('demoBuilder');
        if (e.affectsConfiguration('demoBuilder.blockLibraries.custom')) {
            const updated = parseCustomBlockLibrarySettings(config.get<string[]>('blockLibraries.custom', []));
            void send('customBlockLibraryDefaultsUpdated', {
                customBlockLibraryDefaults: updated,
            } satisfies CustomBlockLibraryDefaultsUpdatedPayload);
        }
        if (e.affectsConfiguration(`demoBuilder.${ADDED_DEMOS_SETTING}`)) {
            void send('addedDemosUpdated', { addedDemos: readAddedDemos() } satisfies AddedDemosUpdatedPayload);
        }
        if (e.affectsConfiguration('demoBuilder.blockLibraries.defaults')) {
            const blockLibraryDefaults = config.get<string[]>('blockLibraries.defaults', []);
            void send('blockLibraryDefaultsUpdated', { blockLibraryDefaults } satisfies BlockLibraryDefaultsUpdatedPayload);
        }
        if (affectsDatapackList(e)) void send(DATAPACK_LIST_CHANGED_MESSAGE);
    });
    return {
        dispose: () => {
            settings.dispose();
            packs.dispose();
        },
    };
}
