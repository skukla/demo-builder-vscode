# Step 13: Live verification (owner-gated where it writes)

On the owner's machine, current build:

1. `npm run node:resolve -- --check` agrees with the generated file (24).
2. Diagnostics: every `aio` call reports Node 24 from the folder.
3. A scratch mesh deploy and status on the folder's Node (throwaway workspace, deleted after).
4. Add an outside integration whose range is `>=18`: it reuses 24, installs nothing new.
5. Regenerate AI files: the launch lines use the folder; no EBADENGINE.
6. Start an existing project installed under an older Node: it starts, and offers a reinstall.
7. Cleanup: an unused Node in the folder is removed; the one-time shared-fnm offer lists the
   expected versions with the default unticked; the terminal's `node -v` is unchanged after.

Record each result on PR-1a.
