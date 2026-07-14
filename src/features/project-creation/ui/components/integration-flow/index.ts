/**
 * integration-flow — the Integrations area's deep module.
 *
 * Public API (OUTSIDE consumers — IntegrationsStep, buildSummary,
 * useProjectCreationPhases — import ONLY from here; the module's own unit
 * tests may reach internals): the {@link AddIntegrationFlowModal} journey shell, the
 * {@link IntegrationResultRow} center-column row, the {@link MeshApiEnableRow}
 * a consumer embeds in the mesh row's `meshEnableSlot`, the pure
 * {@link resolveIntegrationRows} resolver, and the {@link IntegrationRow},
 * {@link FlowMode}, {@link IntegrationKind} types. Everything else (the stage
 * machine, the hook, the stage bodies) is internal.
 *
 * MeshApiEnableRow joined the public interface deliberately (Step 9): the mesh
 * result row's API-enablement slot is the CALLER's composition seam, so the
 * component the caller mounts there must be importable from the index.
 *
 * @module features/project-creation/ui/components/integration-flow
 */

export { AddIntegrationFlowModal } from './AddIntegrationFlowModal';
export { IntegrationResultRow } from './IntegrationResultRow';
export { MeshApiEnableRow } from './MeshApiEnableRow';
export type { EnsureResult } from './MeshApiEnableRow';
export { resolveIntegrationRows } from './integrationRows';
export type { IntegrationRow } from './integrationRows';
export type { FlowMode, IntegrationKind } from './flowStages';
export type { ApiEditTarget } from './useIntegrationFlow';
