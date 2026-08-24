/**
 * The mesh-delete primitive — ONE spelling for a destructive command.
 *
 * Three different actions legitimately delete a mesh (the dashboard's
 * explicit delete, project-creation's cancel rollback, and component
 * removal's teardown), each with its own org targeting and execution
 * context — those stay with the callers. What must NOT vary is the command
 * itself: before this constant existed the three sites spelled it two ways
 * (`api-mesh delete` / `api-mesh:delete`) with independently chosen flags,
 * which is exactly how a destructive invocation drifts. Found by the
 * 2026-08-22 spine sweep; `tests/templates/spine-chokepoints.test.ts` pins
 * the literal to this file.
 *
 * `--autoConfirmAction` is deliberate at every site: all three flows run
 * after their own confirmation (or as cleanup of something this session
 * created), so the CLI prompt would only hang a non-interactive execution.
 *
 * @module core/shell/meshDeleteCommand
 */

export const MESH_DELETE_COMMAND = 'aio api-mesh:delete --autoConfirmAction';
