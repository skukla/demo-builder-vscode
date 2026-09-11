# Step 07 — Agent surface for adding a demo

Item: [[EDS-13a]]. Decision: D15. Depends on steps 03 and 05. Rules: `mcp-tool-authoring`.

## Tools

| Tool | Kind | Backed by |
|---|---|---|
| probe a demo link | read descriptor row (`readDescriptors.ts`), `readOnly: true`, no writes hiding in the read | the step-03 handler |
| add a demo | action row, `readOnly: false`; remembers the link in the SC's setting | the step-04 commit path's host half |
| `list_demo_packages` | existing (`discoveryTools.ts:88`); returns added demos beside shipped ones with a `source` field | the resolver + the setting |
| `create_project` | existing (`createProjectTool.ts:416`); accepts an added demo's id, or a link (probe + add inline) | steps 03–05 |

Each carries the three declarations (`readOnly`, `TOOL_NARRATION` phrase written from the
description, `AGENT_ALERT_COPY` only if a dialog is raised: adding a demo raises none;
creating a project already does). Input schemas from the handler payload TYPES, `.strict()`
on the writers. Registered in `realSdkRegistration.test.ts`; counts bumped in
`dashboardHandlers-map.test.ts` and the descriptor suites; `docs/systems/mcp-server.md`
updated.

## Verify

`mcp-live-probe`: `serverInfo` names the build; the probe tool answers for the three real
repos from step 03; `create_project` with a link creates the same project the wizard does.
