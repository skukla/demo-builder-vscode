/**
 * Shapes the settings layer's suites share, typed to the real interfaces so `typecheck:tests`
 * reads them (datapack-engine step 09): a library row, a found layer, and the file's section.
 * No answer of the library is captured for a layer; the row's fields are `DatapackSummary`'s.
 */

import type { PackSettingsLayer } from '@/features/data-installer/services/datapackZip';
import type { SettingsLayer } from '@/features/data-installer/services/settingsLayer';
import type { DatapackSummary } from '@/features/data-installer/types';

export const GRID = 'catalog/frontend/grid_per_page';
export const LIST = 'catalog/frontend/list_per_page';

/** A store_config row, as a pack holds it. */
export const settingRow = (path: string, value: string, scope = 'default') => ({ path, value, scope });

/** A library pack's catalog row. */
export const libraryRow = (name: string, version: string, overrides: Partial<DatapackSummary> = {}): DatapackSummary => ({
    id: { name, version },
    displayName: name,
    shared: false,
    dataTypes: ['store_config'],
    art: {},
    store: 'library',
    mine: true,
    ...overrides,
});

/** What `findSettingsLayer` answers for a pack named `bodea-main`. */
export const foundLayer = (records: unknown = [settingRow(GRID, '24')], overrides: Partial<SettingsLayer> = {}): SettingsLayer => ({
    id: { name: 'bodea-main-settings', version: '2' },
    displayName: 'Bodea settings',
    shared: false,
    mine: true,
    records,
    ...overrides,
});

/** The second section of a pack's file. */
export const fileLayer = (records: unknown = [settingRow(GRID, '24')], overrides: Partial<PackSettingsLayer> = {}): PackSettingsLayer => ({
    id: { name: 'justrite-settings', version: '3' },
    displayName: 'Justrite settings',
    records,
    ...overrides,
});
