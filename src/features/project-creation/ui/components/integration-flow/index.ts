/**
 * integration-flow — the Integrations area's deep module.
 *
 * Public API (OUTSIDE consumers — IntegrationsStep, buildSummary,
 * useProjectCreationPhases — import ONLY from here; the module's own unit
 * tests may reach internals): the {@link AddIntegrationFlowModal} journey shell, the
 * {@link IntegrationResultRow} center-column row, the pure
 * {@link resolveIntegrationRows} resolver, the {@link EnsureResult} mesh-enable
 * result contract, and the {@link IntegrationRow}, {@link FlowMode},
 * {@link IntegrationKind} types. Everything else (the stage machine, the hook,
 * the stage bodies) is internal.
 *
 * @module features/project-creation/ui/components/integration-flow
 */

export { AddIntegrationFlowModal } from './AddIntegrationFlowModal';
export { IntegrationResultRow } from './IntegrationResultRow';
export type { EnsureResult } from './meshApiSubscription';
export { resolveIntegrationRows } from './integrationRows';
export type { IntegrationRow } from './integrationRows';
export type { FlowMode, IntegrationKind } from './flowStages';
export type { ApiEditTarget } from './useIntegrationFlow';
