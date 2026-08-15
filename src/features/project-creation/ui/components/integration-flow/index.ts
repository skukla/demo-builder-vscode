/**
 * integration-flow — the Integrations area's deep module.
 *
 * Public API (OUTSIDE consumers — IntegrationsStep, buildSummary,
 * useProjectCreationPhases — import ONLY from here; the module's own unit
 * tests may reach internals): the {@link AddIntegrationFlowModal} journey shell,
 * the pure {@link resolveIntegrationRows} resolver and its
 * {@link toIntegrationCards} / {@link sublineFor} card producer, the
 * {@link isApiEditable} rule (ONE home for "which cards may edit their APIs",
 * which is also "which cards are pressable" — the host must not re-derive it),
 * the {@link ApiEditTarget} picker-seed type, the
 * {@link EnsureResult} mesh-enable result contract, the
 * {@link buildReservedIds} collision-domain builder (the host composes the
 * blank-naming reserved set with it), the {@link RESERVED_EXISTING_KEY}
 * edit-mode serialization key (useWizardState seeds `selectedConsoleApis` with
 * it), and the {@link IntegrationRow}, {@link FlowMode},
 * {@link IntegrationKind}, {@link BlankInstance} types.
 * Everything else (the stage machine, the hook, the stage bodies) is internal.
 *
 * The center-column ROW component is gone: the area now renders the shared
 * `IntegrationCard` (`core/ui/components/integrations`), so the wizard and the
 * dashboard show one card family. Rename went with it — the card's inline pencil
 * replaced `RenameIntegrationModal`.
 *
 * @module features/project-creation/ui/components/integration-flow
 */

export { AddIntegrationFlowModal } from './AddIntegrationFlowModal';
export { isApiEditable, sublineFor, toIntegrationCards } from './integrationCards';
export type { EnsureResult } from './meshApiSubscription';
export { buildReservedIds } from './instanceId';
export { resolveIntegrationRows } from './integrationRows';
export type { IntegrationRow } from './integrationRows';
export { RESERVED_EXISTING_KEY } from './flowStages';
export type { BlankInstance, FlowMode, IntegrationKind } from './flowStages';
export type { ApiEditTarget } from './useIntegrationFlow';
