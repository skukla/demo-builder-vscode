# Step 4: One runner and one validator

- **Runner.** `CommandExecutor.wrapCommandWithFnm` is the one form, and it always carries
  Demo Builder's store: `FNM_DIR=<store> fnm exec --using=N cmd` (env on the child, so the
  user's shell is untouched).
  `ProgressUnifier` (`progressUnifier/ProgressUnifier.ts:588-591`) builds its own
  `fnm exec --using N` with a bare `fnm`; it calls a shared `fnmExec(major, command)` helper
  instead, using the located fnm path.
- **Start a demo.** `startDemo.ts` sends `eval "$(fnm env)" && fnm use <v> && npm run dev` to a
  terminal. It builds the same `fnmExec` form, so the terminal and every executor call agree.
- **MCP launch lines.** AI-13's `launchUnderNode` uses the same helper.
- **Validator.** `ensureNodeVersion.ts`'s `/^\d+$/` and `startDemo`'s `typeof` check use
  `validateNodeVersion` (which, after step 3, accepts a major, `x.y.z` or `current`).
- **`fnm list` parsing** (five places: MultiVersionDetector x2, VersionSatisfactionChecker,
  perNodeVersionStatus, continueHandler) goes through one `listInstalledMajors()`; continueHandler's
  copy of the per-node check is deleted for perNodeVersionStatus's.

**Tests:** the helper's composed command; each moved caller asserts the helper's output; the
existing prerequisites suites stay green unchanged (behaviour-preserving).
