/**
 * Which of a pack's kinds a request installs: what it asks for and what those need, and nothing else
 * (`IMPORT_DEPENDENCIES`, the map the import form ticks by). One answer for the install, its dry run
 * and its preview, so the three never disagree. Unticked means left alone: a kind not asked for is
 * not installed, not compared, and stays on the record if it was there.
 *
 * Store settings are the one kind a form may hold no box for, since a pack's settings layer is a
 * pack of its own (`layerStep.ts`). They are in when `store_config` is asked for by name, or when
 * every kind the pack holds is: an install of the whole pack is what its flyout's "Also sets" says.
 * Part of a pack leaves them alone, set or not.
 *
 * @module features/data-installer/services/demoBuilderEngine/askedKinds
 */

import { withDependencies } from '../../ui/importDependencies';
import { STORE_CONFIG_KIND } from '../datapackCatalog';

type Rows = Record<string, unknown>;

/** The kinds a request installs, in the pack's own rows: `dataTypes` absent means all of them. */
export function askedRows(all: Rows, dataTypes: readonly string[] | undefined): Rows {
    if (!dataTypes) return all;
    const asked = withDependencies(dataTypes, Object.keys(all));
    return Object.fromEntries(Object.entries(all).filter(([kind]) => asked.includes(kind)));
}

/** The kinds a request installs because what it asks for needs them; the form ticks these itself. */
export function kindsAddedFor(all: Rows, dataTypes: readonly string[]): string[] {
    return withDependencies(dataTypes, Object.keys(all)).filter((kind) => !dataTypes.includes(kind));
}

/** Whether a request touches store settings (see the module comment). */
export function settingsAsked(all: Rows, dataTypes: readonly string[] | undefined): boolean {
    if (!dataTypes || dataTypes.includes(STORE_CONFIG_KIND)) return true;
    return Object.keys(all).every((kind) => dataTypes.includes(kind));
}
