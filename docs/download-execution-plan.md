# Demo Builder Download & Deployment Roadmap

## Context
- Components selected and API Mesh verified.
- Remaining scope covers settings collection, code download, deployments, and frontend start.
- Future requirement: management UI for deployments and runtime controls.

## Phase 1 – Settings Collection Refresh (current)
- Align layout with modern wizard steps (content + summary).
- Provide per-component navigation with completion indicators.
- Normalize env var handling (required vs deferred fields like `MESH_ENDPOINT`).
- Persist values to `componentConfigs` for later serialization into `.env` files.
- Document shared-value auto-fill rules (e.g., Commerce URL propagation).
- Outcomes: users can confidently complete settings and understand missing fields.

## Phase 2 – Code Download Workflow
- Decide default directory structure (`<workspace>/projects/<project-slug>/<component>/`).
- Trigger download after settings completeness (pre-review or during review).
- Provide progress feedback inside wizard (reuse `CreatingStep` overlay).
- Record download metadata (path, timestamp, status) in persisted state.
- Decide user access approach:
  - Primary: VS Code explorer (default experience).
  - Secondary: extend “Focus on Current Project View” to show components, open-folder actions, and download status badges.

## Phase 3 – Environment File Generation
- For each component, generate `.env` from collected settings once download finishes.
- Handle secrets carefully (mask in UI, never log).
- Support re-generation if user revisits settings.

## Phase 4 – Deployment Automation
- Identify deployable components (Mesh, integration services, etc.).
- Sequence operations: ensure env files exist → run CLI deploy commands.
- Provide real-time feedback and error recovery in wizard.
- Persist deployment status for management UI.

## Phase 5 – Frontend Startup
- Install dependencies and start the selected frontend with correct envs.
- Stream logs/health status to UI; allow user to stop or restart.

## Phase 6 – Management Interface
- New view for ongoing control:
  - View deployment status per component.
  - Restart/stop frontend.
  - Re-run deployments or download updates.
- Integrate with download metadata and deployment records.

## Open Questions / Follow-ups
- Should downloads happen step-by-step or all at once after review?
- How to handle components added/removed after initial download?
- Do we need lightweight diffing or checksum to detect outdated local code?
- Define storage location for persistent metadata (workspace file? global state?).


