/**
 * Data Installer Feature — public API.
 *
 * The feature browses the Data Installer service's datapack catalog and installs
 * packs into a project's Commerce backend. Almost all of it is internal: the
 * panel, the clients, the parsers and the UI are reached through the command and
 * the handler maps, not by importing them.
 *
 * **This barrel is WEBVIEW-SAFE, and that constrains it.** A wizard step imports
 * from here, and webview code is bundled by a separate esbuild entry that cannot
 * resolve extension-host modules. Re-exporting `ShowDataInstallerCommand` or the
 * handler maps drags `vscode`, the command factory and the whole host graph into
 * that bundle — which broke three `WizardContainer` suites with "Cannot find
 * module '@/commands/handlerContextFactory'" the moment it was tried.
 *
 * So the host-side entry points are imported by path, by the host-side modules
 * that register them (`commandManager` for the command, the descriptor modules
 * for the handler maps). Those are registrations, not cross-feature dependencies.
 *
 * What IS exported: catalog shaping and the types it speaks, because the
 * wizard's Sample Data area renders the same 40-rows-for-25-names catalog and
 * must fold it the same way. A second grouping rule would be a second source of
 * truth.
 *
 * Everything else stays internal on purpose. Adding an export here is a decision
 * that another feature may depend on that module — and, given the above, a
 * decision that it is safe to bundle into a webview.
 *
 * @module features/data-installer
 */

export {
    groupDatapacks,
    pickDefaultVersion,
    orderVersions,
    type DatapackGroup,
} from './services/datapackCatalog';

export type {
    DatapackId,
    DatapackSummary,
    DatapackDetail,
    ImportJobRecord,
    Page,
} from './types';
