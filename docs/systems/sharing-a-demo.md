# Sharing a demo

You built a storefront and a colleague wants to build their own demo on it. This page says
what they need from you, what Demo Builder reads from your repository, what it will never
change in it, and what happens to their projects when your demo changes.

The same page, read the other way, is what you need from a colleague whose demo you want
to add.

## What "Add a demo package" needs

Send the link. Either one works:

- the GitHub link, `https://github.com/<owner>/<repo>`, or
- the site address, `https://main--<repo>--<owner>.aem.live`, which Demo Builder reads back
  to the repository.

Three things have to be true of the repository:

1. **The people you share with can read it.** A private repository answers "we couldn't
   find this repository, or you don't have access to it" to anyone who is not a
   collaborator. Add them, or make it public. Everything else on this page reads from
   GitHub with the SC's own sign-in.
2. **The content site is named and its pages are indexed.** `fstab.yaml` names the DA.live
   site the storefront serves; both spellings are read, the one-line mount and the nested
   one with a `url:` line. The site must publish a list of its pages, under
   `/full-index.json`, `/sitemap.json` or `/query-index.json`. That list is what creation
   and reset copy from; a site without one reads as "no published pages", and a project
   built on it starts empty.
3. **The default branch is the demo.** Projects are created from the repository's default
   branch and reset to it. Whatever is on it is what your colleagues get.

Send the link, not a zip. A zip loses the history and your later changes can never reach
the projects built on it.

If a zip is what you were given anyway, the Add a demo package dialog asks **Where is the demo?** and
offers **From a zip file** beside **From a link**. Pick it, then **Choose a zip file**, and
Demo Builder unpacks it, leaves out what a repository
would not keep (`node_modules`, caches, whatever its `.gitignore` says), refuses it if it is
not an Edge Delivery storefront, creates a repository in your own GitHub account named after
the zip (public unless you clear the box), pushes the files as one commit, and adds the demo
from there. From then on it is your repository: reset and updates read from it, and Forget
offers to delete it.

## The description file, and when you want one

Optionally, put `demo.demo-builder.json` at the root of the repository. Without it, Demo
Builder reads what the repository already holds (next section) and names the demo after
the repository. With it, you choose the name and say the things a repository cannot:

| Field | What it says |
|---|---|
| `kind` | Always `"demo"`, so a reader knows which Demo Builder file it holds |
| `version` | The file format's version; `2` today. A version-1 file is still read, as before |
| `name` | The name on the Welcome grid |
| `description` | The line under the name |
| `configDefaults` | Store codes and other config values the project starts with |
| `configFlags` | Storefront `config.json` flags, such as `commerce-b2b-enabled` |
| `requiresMesh` | Whether the demo needs an API Mesh: `true`, `false`, or `"optional"` |
| `datapack` | The sample-data pack the demo expects; the Sample Data step starts with it selected |
| `integrations` | The integrations the demo depends on: catalog ids, and custom apps by repository |
| `blockLibraries` | Shipped block libraries to pre-tick |
| `contentSource` | The content site, when it is not the one `fstab.yaml` names, or to name its index path |
| `builtWith` | Written by Share Demo's link save, never by hand: the shipped package, template, pin, fix list and boilerplate the storefront was built from, and the Demo Builder version that saved it |

A file that names a content site names its index path; the `indexPath` field is required
inside `contentSource`. Only the SC's own actions guess a path, and only for a repository
that names no site of its own.

Only these fields. The file is validated against `src/core/state/config/shared-demo.schema.json`,
which is the same shape a shipped brand's catalog entry has, so a colleague's demo and a
shipped one are read the same way. A field the schema does not know is a warning in the
dialog, never a refusal, so a file written for a newer Demo Builder still adds on an older
one. The rest of the format, and how it relates to the project file, is in
[project-file-format.md](project-file-format.md).

A complete example:

```json
{
  "kind": "demo",
  "version": 2,
  "name": "Isle5 by Robin",
  "description": "A B2B outdoor-equipment demo with company accounts and quotes",
  "configDefaults": {
    "ADOBE_COMMERCE_WEBSITE_CODE": "isle5",
    "ADOBE_COMMERCE_STORE_CODE": "isle5_store",
    "ADOBE_COMMERCE_STORE_VIEW_CODE": "isle5_us"
  },
  "configFlags": {
    "commerce-b2b-enabled": true,
    "commerce-companies-enabled": true
  },
  "requiresMesh": false,
  "datapack": { "name": "isle5" },
  "blockLibraries": ["isle5"],
  "contentSource": { "org": "your-github-owner", "site": "isle5-content", "indexPath": "/sitemap.json" }
}
```

## What is read when there is no file

Demo Builder reads four files from the repository's default branch:

- **`package.json`.** A `next` dependency makes it a headless (Next.js) demo. Otherwise it
  is an Edge Delivery demo when `head.html`, `scripts/scripts.js` and `404.html`
  are present (not `scripts/delayed.js`, which Adobe's B2B template does not have); a repository with none of them is not a storefront and is refused, naming
  what is missing.
- **`fstab.yaml`.** The DA.live site, as above.
- **`config.json`.** The store codes from the `headers.cs` block, and whether company (B2B)
  features are on from the `commerce-b2b-enabled` flag.
- **`package.json` again,** when `config.json` does not say: the company drop-ins
  (`@dropins/storefront-company-management` and the other 4) mean B2B is on.

When neither file says whether the demo uses company features, the dialog asks the SC, and
says what an empty account menu would mean if they answer wrong. The agent's tools do not
ask; they treat it as off and say so.

## What Demo Builder writes, and what it never touches

Into every project built from your demo, Demo Builder writes what connects it to that
project: `fstab.yaml` pointing at the project's own content site, `config.json` and
`demo-config.json` with the project's own store and endpoint, the product-page fallback
(the smart-404 snippet in `404.html`), the block library, the inspector tagging,
the quick-edit hooks and the description file. Your files are the starting point; those are
the ones the project owns afterwards.

Every write goes to the SC's own copy, never to your repository.

## Demo Builder's fixes reach the SC's copy of your code

The shipped brands carry a handful of fixes to Adobe's boilerplate (code patches, ADR-006),
listed in Demo Builder's patch ledgers and tested against Adobe's template every day. A
storefront built from your demo gets every one of them that fits, on creation and on every
reset (owner, 2026-10-23, EDS-64): the same list, not a second one kept for colleagues
(`knownPatches.ts`, run by the build step in `storefrontUpToDate.ts`).

A fix fits only where the code it fixes is in the file exactly once. A fix already there is
left as it is, and the fixes to one file go in together or not at all, so a link never goes in
without the import it calls. Code you changed no longer matches, so it is never written over.
The writes go to the SC's copy; your repository is never touched. If a patch list cannot be
downloaded, what was read still goes in, and the project shows Needs reset until a reset reads
them all.

Measured on Tailspin, 2026-10-23: of the six fixes, two were already in its code and the other
four fit (the AEM Assets image name, and the product teaser's link, import and image address).

## Boilerplate versions

Demo Builder records what every storefront it touches was built on: the `name` and `version`
in its `package.json` (both Adobe Commerce boilerplates call themselves
`@adobe/aem-boilerplate-commerce`) and, from GitHub, the template it was generated from or the
repository it is a fork of. The add dialog shows it as one row, **Built on**; the storefront
report compares it with Demo Builder's current boilerplate, the template at the patches
repository's last-known-good commit. An older storefront is still added: age alone never
refuses one.

## Where a colleague's projects read from

When an SC adds your demo, their card reads from your repository and your content site, the
same way a demo package Demo Builder ships reads from its own. Nothing is copied into their
GitHub account. Each project they build gets its own repository and its own pages at
creation, so a project already built keeps working whatever happens to yours. Reset and
updates go back to your repository.

**Keeping a demo nobody can take away.** An SC who wants to keep building on your demo even
if you remove it builds one project from it and saves it with **Share Demo**, **Also show it
on my Welcome step** ticked, on that project. The card that makes reads that project's own repository and pages, so it needs
nothing of yours.

Your repository's history is readable by anyone who can read the repository. **Do not share a
repository whose history ever held a secret.**

## After you change your demo

- **Your later changes** reach a colleague's projects through the update check, and a
  project reset goes straight to your default branch.
- **If you rename the repository,** GitHub answers the old name with the new one, and each
  project follows the rename the next time it resets or opens.
- **If you delete it,** projects built on it keep working. Their reset refuses with one
  sentence, and their dashboard says the demo's repository can't be reached. "Change
  source" points a project at another copy of the same kind, for a demo that moved; on an
  Edge Delivery project "Keep as my own demo" opens Share Demo to keep it as the SC's own,
  for one that is gone.

## The words

On the Welcome grid and in the dialog it is a **demo**: the thing you share and the thing
they build on. Inside a project it is a **storefront**: that project's own code and site,
which the Storefront area configures. One demo, many storefronts.

## Share Demo

**Share Demo**, in the dashboard's Share row, is the one way to hand this demo on. It replaced
two dialogs on 2026-10-22 (Export, and Save as demo package), which did the same job: both
wrote the description file into your repository and put the card on your Welcome step. It
is two steps in one window, the way Add a Demo is (walk F228, 2026-11-18). Step 1, **How to
Share**, is two cards, **Send a Link** and **Send a File**, with **Next**. Step 2 is the
chosen form, with **Back** (which keeps the choice and what you set), **Close**, and the
form's own button.

### Send a link

For a colleague who can reach your GitHub and the shared services. Keeps the history, and
they get your later changes. Edge Delivery projects only. Top to bottom, the form shows:

- What colleagues cannot use yet, first, one amber notice each: a private repository (they
  need access, or make it public), a site with no published page list (points at Republish),
  sample data only you can see, and custom integration code they cannot read. Only the
  checks that need you show; nothing in them stops you saving. Nothing is uploaded.
  Sample data only you can see comes with its fix, **Share Datapack**: it asks first
  ("Share <name>?", the same question the Datapacks screen's Share asks), then shares the
  datapack with the same handler (`share-library-datapack`, which the `share_datapack` tool
  also runs). The button shows it is busy while it runs; once shared, the storefront is read
  again and the notice goes. If the share fails, the notice's line says why.
- **Repository**, the address of your storefront's repository, as a read-only field.
- **Name** (required) and **Description**, always shown. They are
  prefilled from the description file when it is the one Demo Builder wrote, otherwise from
  the brand or demo the project was built on (the project's own title for a Starter build).
- **Add to My Welcome Step**, ticked by default (it was always on before the merge), with
  the line "So you can start new projects from it." under it. Ticked, the save also puts the card on your own Welcome step, the way Isle5 is one, so you
  can build new projects from it. Unticked, the save writes the file only, and takes your
  card off the list if it was there. For a demo already shared, the box shows where its
  card is now.
- **Remove the Details from My Repository**, once there is something of yours to undo. It
  takes the file out (only when it is ours) and the card off your list. The storefront is
  untouched.

The footer button copies the link. A link carries nothing itself, so while your repository
lacks the description file the button reads **Save and Copy Link**: it writes the
file from what the project already holds, then copies. Once the file is there it reads
**Copy Link** and only copies. It reads **Save and Copy Link** again after you change
the name, the description or the box, because the next press will write.

Nothing else about the repository changes: it is not marked as a GitHub template. A project
created from the card still works, because creation copies a repository that is not a
template into a new empty one.

Resetting the project keeps the file: a reset replaces the storefront's code with the
template's, and the description file rides along with `fstab.yaml` and `config.json`, so the
card and its link keep working.

Demo Builder rewrites only a description file it wrote itself, and knows it by the file's
recorded revision. A file you wrote or edited by hand is left alone and the dialog says so;
the link is still copied. The card's own menu on the Welcome step, always visible, has
**Edit** (rename the card and change its description) and **Remove** too: it takes the card
off the list and nothing else, and never offers to delete a repository that is one of your
projects' storefronts. Colleagues who already added the demo keep it.

### Send a file

For a colleague who can't reach your GitHub. One zip, `<project>-demo-bundle.zip`. Top to
bottom, the form shows (walk F230, 2026-11-18, laid out the way the link form is):

- Sample data only you can see, first, as the link form's amber notice with the same
  **Share Datapack** fix: the file names the datapack, and colleagues cannot install its data
  until it is shared. It is the link form's own check (`datapackCheckFor`): an Edge Delivery
  project reads it with the storefront, a headless one reads it alone
  (`getShareDatapackCheck`), both behind the window's opening wait. The link form's other
  checks are not shown here: the file carries the code itself. A check that cannot be read
  shows nothing, and never holds the file up.
- The two parts, as checkbox rows with no heading over them, each with its line under it:
  **Setup** ("Your Commerce, Adobe, GitHub, DA.live and integration settings.": the integrations the project uses and their settings, and a custom integration's repository, never its code) and
  **Storefront** ("The storefront's code and content site.", the repository's code with the
  demo's description file inside). On a headless project the storefront row is off and
  locked, and says the project has none.

**Save File** in the footer saves the ticked parts; with nothing ticked it is greyed out, with no
line about it, and nothing else arrives under the boxes, so the window fits them (walk F238). A
save that fails becomes a result too: the red mark, **Couldn't Save File**, the reason, and
**Try Again**. Once the file is written the window becomes the result (walk F236): a large green check, **File Saved**,
the file and the folder it is in, and **Reveal in Finder** (Reveal in File Explorer on Windows),
which shows the file through VS Code's own `revealFileInOS` (the `revealFile` handler). Dismissing
the save dialog leaves the form as it was. It asks
nothing more: before 2026-11-18 it asked a VS Code pop-up ("Your teammates can't use this
datapack's data. Share it?") whose other answer saved the same file anyway, so with the notice
already on screen a second question would only repeat it. A file saved without the share still
works for the colleague: the settings and storefront arrive, and the wizard says it cannot read
your datapack, offering the one it was made from when there is one, else building without
sample data (`checkRecordedPack` in `recordedPack.ts`). The projects list's Export, which has no
notice, still asks that question. An agent's `export_demo_bundle` never asked: its answer
carries the same sentence as `packNote`.

A colleague adds the storefront with Add a demo package's **From a zip file**, which reads the
bundle. Setup alone writes the plain settings file the projects list imports today. Your setup
travels only as a file.

Parts that do not exist yet are not listed. When one is built, it is added to the file form.

**Receiving a file.** A colleague has two doors, and both read a bundle as well as a bare
storefront zip. On the projects list, **Import** takes the bundle: the storefront becomes a
repository in their account and a card on their Welcome step, and the setup part opens the
wizard pre-filled on that card, with your repository and site names dropped so they name
theirs. Inside the wizard, Add a demo package's **From a zip file** does the same for the storefront and,
when the bundle carries setup, offers **Start a project with it**, which adds the card and
reopens the wizard pre-filled. The setup never carries a credential; the colleague signs in
to their own accounts as the wizard asks.

## Headless demos

A Next.js demo adds the same way; its pages live in the app, so there is no content site
to index. Share Demo offers no link and no storefront part for a headless project, because a headless project
is a local clone with no repository of the SC's own: share one by pushing your clone to a
repository and sending the link.

## For agents

`get_storefront_report` answers the storefront report for the open project, as data and in
the SC's words, including `brokenLinks`: links in the copied content to pages the colleague's
site does not have either, each with the pages it is on. People read the same report in
Diagnostics; a reset names the broken links on its last view, and `reset_project` answers
them as `brokenLinks`. The dashboard's Storefront Report tile and window were removed on
2026-10-23 (EDS-64): what they showed is in those places.

The same doors exist as tools, in [mcp-tools.md](mcp-tools.md): `probe_shared_demo` reads
a demo from a link, `add_shared_demo` adds it, `create_project` takes an added demo's id or
a link, `change_demo_source` repoints a project, `edit_added_demo` renames a card and changes
its description, and `forget_added_demo` takes a demo off the list. The demos an SC has added live in the `demoBuilder.demos.added` setting.
`add_shared_demo` also takes `zipPath` for a storefront that arrived as a zip file or a demo
bundle: the repository it creates in the SC's account needs `confirm:true`. When
the bundle carries setup, the answer says so and points at the projects list's Import, which
is the door that opens the wizard pre-filled.

Share Demo has the same doors: `get_demo_package_preview` reads what a project built from
the card would get, `save_demo_package` writes the file, puts the card on the list (or, with
`addToWelcome:false`, keeps it off, as the unticked box does) and answers the link, and
`remove_demo_package` undoes it. Both writes need `confirm:true`. The file form is
`export_demo_bundle`, which writes the bundle inside the project directory. Copying a link
to the clipboard is a person's act and has no tool.

## Related

- [project-file-format.md](project-file-format.md) — the file formats, and where a project's storefront is looked up
- [custom-block-libraries.md](custom-block-libraries.md) — bringing your own blocks
- [mcp-tools.md](mcp-tools.md) — the tool catalogue
