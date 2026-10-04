# Moving projects: export, import, copy

An SC moves a project three ways: sends it to someone else (**Export**), starts a project
from what someone sent (**Import from File**), or starts a second project from one already
on this machine (**Copy from Existing**). **Edit** reopens a project in the wizard and
belongs here because it reads the same file. All four go through one file, written by one
function and read by one function, so they cannot disagree about what a project is.

The file itself, field by field, is in [project-file-format.md](project-file-format.md).
Sending a storefront by link, so colleagues get later changes, is
[sharing-a-demo.md](sharing-a-demo.md).

## The doors

| Door | Where the SC finds it | What it does | Agent tool |
|---|---|---|---|
| Export | a project's More menu → **Export** | asks how to hand it over: **Send a link** (the storefront as a demo package) or **Send a file** (one zip, `<project>-demo-bundle.zip`, with the parts ticked: **Setup** and, for an Edge Delivery project, **Storefront**). Setup alone saves the plain project file | `export_project_settings` (the project file), `export_demo_bundle` (the zip) |
| Import from File | the projects list's New Project menu | reads a project file or a bundle and opens the wizard filled in from it | `create_project_from_file` (takes the file's absolute path) |
| Copy from Existing | the projects list's New Project menu | picks a project on this machine and opens the wizard filled in from it | `copy_project` (takes the source project's name) |
| Edit | a project's More menu → **Edit** | reopens the wizard on the project itself | `edit_project` |

The project file is named `<project-name>.project.demo-builder.json`. A bundle carries the
same file as `setup.demo-builder.json`. Older exports named `<name>.demo-builder.json` still
import: the file's `version` decides how it is read, not its name.

## One writer, one reader

Every export writes `createExportSettings`
(`src/features/projects-dashboard/services/settingsSerializer.ts`). Every door that opens
the wizard reads through `readProjectFile` (`src/core/state/projectFileReader.ts`):

- **Import** reads the file from disk.
- **Copy** reads `copySeedFromProject`: the file Export would write for the source project,
  read back the same way. A copy and an import of the same project open the wizard
  identically and send the same creation request.
- **Edit** reads `extractSettingsFromProject`: that same file, plus two things only Edit
  keeps, because it edits the SC's own project — the setting values as they are,
  credentials included, and the project's own storefront.

The two agent tools that create (`create_project_from_file`, `copy_project`) share their
second half, `createFromProjectFile`, and end in `runProjectCreation`, the function
`create_project` ends in. There is no second creation pipeline.

## What travels and what never does

| Travels | Never travels |
|---|---|
| title and name; the package, stack, addons and block libraries | credentials of any kind |
| every setting, store codes included | the storefront repository and DA.live site, except as a note of where the project came from |
| integrations by catalog id, custom apps by link, their API picks, the mesh | deploy state, endpoints, timestamps, paths, statuses |
| the datapack, the discovered store structure | sign-ins (GitHub, DA.live, Adobe) |
| the Adobe org, project and workspace, which import checks against the signed-in org | |

Saved AI prompts and the Commerce connection record are in the file too, but creation does
not take either as an input.

**Credentials.** They live in VS Code's secret storage on the machine that entered them and
are never written into the file. The reader also removes every key that
`SECRET_ENV_KEYS` (`src/core/config/envVarKeys.ts`) registers, whatever a file claims. After
an import or a copy the SC types them once in the Commerce area; the agent tools answer
`stillNeeded.credentials`, naming each one.

**Storefront.** A project made by import or copy gets its own repository and DA.live site.
The wizard asks for GitHub and DA.live as for a new project; the agent tools need
`repoName`, `daLiveOrg` and `daLiveSite`, and `copy_project` refuses the source's own.

## A file from an older Demo Builder

A version-1 file, written before September 2026, is migrated as it is read and the file on
disk is left alone. A file from a newer Demo Builder is read as far as this one
understands it, with a warning, never refused. Details in
[project-file-format.md](project-file-format.md#reading-an-older-file).

## Where it is pinned

- `tests/features/project-creation/ui/wizard/projectFileRoundTrip.test.tsx` — export then
  import loses nothing, and what is left out is left out on purpose.
- `tests/features/project-creation/ui/wizard/projectCopyEditRoundTrip.test.tsx` — Copy sends
  Import's creation request; Edit with nothing changed sends every field back.
- `tests/features/ai/server/createProjectFromFileTool.test.ts`,
  `tests/features/ai/server/copyProjectTool.test.ts` — the agent doors.
