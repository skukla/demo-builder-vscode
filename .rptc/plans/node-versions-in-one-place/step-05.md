# Step 5: Prerequisites read the register

- `ComponentRegistryManager.getRequiredNodeVersions` and the two mapping functions answer from
  `nodesFor(project)` (they read frontend, backend, dependencies and infrastructure only today,
  never integrations or the AI tools).
- The `aio-cli` per-Node install covers only majors where `needsAdobeCli` holds, not every
  required major.
- Decision 3: only what the project has chosen. The wizard's prerequisites step runs before
  integrations are chosen, so it prepares the stack's needs; integrations chosen later are
  ensured at the add door (step 2), as today.
- The three different version sets (check and continue use `resolveRequiredMajors`, the install
  post-check uses all majors, `PrerequisitesManager:217` checks every installed major) become one:
  `nodesFor(project)`.
- Fix while here: `resolvePluginNodeVersions` compares component ids to display names
  (inventory item 13, unverified); test it against the real catalog first, fix if it never
  matches.
- PL-36's untested third sort gets its test (or disappears with the unified set).
- Delete `componentRequirements.nodeVersions` from `prerequisites.schema.json`.

**Agent surface:** `check_prerequisites` / `install_prerequisite` go through the same manager, so
they change with it; their descriptions name what they now cover.

**Tests:** the required set for each project shape, integrations and AI tools included; the CLI
per-Node install limited to CLI majors.
