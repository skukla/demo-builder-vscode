/**
 * integration-flow — the Integrations area's deep module.
 *
 * Public API (OUTSIDE consumers — IntegrationsStep, buildSummary,
 * useProjectCreationPhases — import ONLY from here; the module's own unit
 * tests may reach internals): the {@link AddIntegrationFlowModal} journey shell, the
 * {@link RenameIntegrationModal} instance-rename surface, the
 * {@link IntegrationResultRow} center-column row, the pure
 * {@link resolveIntegrationRows} resolver, the {@link EnsureResult} mesh-enable
 * result contract, the {@link buildReservedIds} collision-domain builder (the
 * host composes the blank-naming reserved set with it), the
 * {@link RESERVED_EXISTING_KEY} edit-mode serialization key (useWizardState
 * seeds `selectedConsoleApis` with it), and the {@link IntegrationRow},
 * {@link FlowMode}, {@link IntegrationKind}, {@link BlankInstance} types.
 * Everything else (the stage machine, the hook, the stage bodies) is internal.
 *
 * @module features/project-creation/ui/components/integration-flow
 */

export { AddIntegrationFlowModal } from './AddIntegrationFlowModal';
export { RenameIntegrationModal } from './RenameIntegrationModal';
export { IntegrationResultRow } from './IntegrationResultRow';
export type { EnsureResult } from './meshApiSubscription';
export { buildReservedIds } from './instanceId';
export { resolveIntegrationRows } from './integrationRows';
export type { IntegrationRow } from './integrationRows';
export { RESERVED_EXISTING_KEY } from './flowStages';
export type { BlankInstance, FlowMode, IntegrationKind } from './flowStages';
export type { ApiEditTarget } from './useIntegrationFlow';
