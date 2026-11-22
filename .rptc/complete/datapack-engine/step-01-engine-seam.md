# Step 01: the engine seam, no behaviour change

Status: **done** 2026-10-27 (`41824afda`). Part of [DI-5](../../backlog/2026-10-27-demo-builder-installs-datapacks.md); overview in [overview.md](overview.md).

A `DatapackEngine` interface (`src/features/data-installer/services/datapackEngine.ts`) over what
the write side does: check credentials, dry run, start an install, start a removal, follow the
job. The service engine wraps today's clients exactly. Every caller goes through it: the Data
Installer screen's import, dry run and reset, the wizard's creation install, project reset's
removal, and the agent tools.

**Proved by** today's tests passing unchanged, with one pinned exception: turning the feature off
mid-import no longer abandons the watch of a job that runs all the same.

**Not done here, moved to step 03:** the engine setting (`demoBuilder.dataInstaller.engine`) and
the manifest's `datapack.engine`.
