# Step 8: Live verification (owner-gated where it writes)

On the owner's machine, current build:

1. Diagnostics: every `aio` call reports the Node the register names (24).
2. A scratch project with a mesh: deploy, then status. Passes on Node 24 with `aio` under it.
3. Add an integration on a machine-state where Node 24 lacks `aio` (the owner's 24.21.0 today):
   the add door installs the CLI under 24 once, then deploys.
4. Regenerate AI files: Node 24, no EBADENGINE (AI-13 regression check).
5. The prerequisites screen for an EDS project lists 24 with the CLI.
6. Start an existing project whose record predates the change: it still starts; its next update
   moves it.

Record each result on PR-1a.
