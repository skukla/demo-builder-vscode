# Sharing a demo

You built a storefront and a colleague wants to build their own demo on it. This page says
what they need from you, what Demo Builder reads from your repository, what it will never
change in it, and what happens to their projects when your demo changes.

The same page, read the other way, is what you need from a colleague whose demo you want
to add.

## What "Add a demo" needs

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

## The description file, and when you want one

Optionally, put `demo.demo-builder.json` at the root of the repository. Without it, Demo
Builder reads what the repository already holds (next section) and names the demo after
the repository. With it, you choose the name and say the things a repository cannot:

| Field | What it says |
|---|---|
| `kind` | Always `"demo"`, so a reader knows which Demo Builder file it holds |
| `version` | The file format's version; `1` today |
| `name` | The name on the Welcome grid |
| `description` | The line under the name |
| `configDefaults` | Store codes and other config values the project starts with |
| `configFlags` | Storefront `config.json` flags, such as `commerce-b2b-enabled` |
| `requiresMesh` | Whether the demo needs an API Mesh: `true`, `false`, or `"optional"` |
| `datapack` | The sample-data pack the demo expects; the Sample Data step starts with it selected |
| `integrations` | The integrations the demo depends on: catalog ids, and custom apps by repository |
| `blockLibraries` | Shipped block libraries to pre-tick |
| `contentSource` | The content site, when it is not the one `fstab.yaml` names, or to name its index path |

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
  "version": 1,
  "name": "Isle5 by Jen",
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
  "contentSource": { "org": "jen", "site": "isle5-content", "indexPath": "/sitemap.json" }
}
```

## What is read when there is no file

Demo Builder reads four files from the repository's default branch:

- **`package.json`.** A `next` dependency makes it a headless (Next.js) demo. Otherwise it
  is an Edge Delivery demo when `head.html`, `scripts/scripts.js` and `scripts/delayed.js`
  are present; a repository with none of them is not a storefront and is refused, naming
  what is missing.
- **`fstab.yaml`.** The DA.live site, as above.
- **`config.json`.** The store codes from the `headers.cs` block, and whether company (B2B)
  features are on from the `commerce-b2b-enabled` flag.
- **`package.json` again,** when `config.json` does not say: the company drop-ins
  (`@dropins/storefront-company-management` and the other 4) mean B2B is on.

When neither file says whether the demo uses company features, the dialog asks the SC, and
says what an empty account menu would mean if they answer wrong. The agent's tools do not
ask; they treat it as off and say so.

## What is yours, and what Demo Builder writes

The code is yours. No Demo Builder patch is applied to a storefront built from your demo,
and reset never applies one either. Five behaviours the shipped brands get from patches are
checked against your code instead, and what is missing is said to the SC in three sentences
at most: product links may open an empty page, a product page with no product may be blank,
and product images from AEM Assets may not load for some SKUs. Those are yours to fix in
your code, and the sentence says so.

Into every project built from your demo, Demo Builder writes what makes it that project's:
`fstab.yaml` pointing at the project's own content site, `config.json` and
`demo-config.json` with the project's own store and endpoint, the block library, the
inspector tagging and the quick-edit hooks. Your files are the starting point; those are the
ones the project owns afterwards.

## Copies, forks, and history

When an SC adds your demo, "Keep my own copy of this demo's code" is ticked by default. That
forks your repository into their GitHub account, marks the fork as a template, and reads
everything from the fork from then on: projects are created from it, reset goes back to it,
and the update check offers to pull your changes into it. Forgetting the demo can delete
the fork.

A fork carries your full history. **Do not share a repository whose history ever held a
secret.** Rewriting history does not reach forks already made.

## After you change your demo

- **Your later changes** reach a colleague's fork through the update check, which offers to
  pull them; a project reset then picks them up. A colleague who kept no copy resets straight
  to your default branch.
- **If you rename the repository,** GitHub answers the old name with the new one, and each
  project follows the rename the next time it resets or opens.
- **If you delete it,** projects built on it keep working. Their reset refuses with one
  sentence, their dashboard says the demo can't be reached, and "Change source" lets them
  point at another copy of the same kind, a fork included.

## The words

On the Welcome grid and in the dialog it is a **demo**: the thing you share and the thing
they build on. Inside a project it is a **storefront**: that project's own code and site,
which the Storefront area configures. One demo, many storefronts.

## Headless demos

A Next.js demo adds the same way; its pages live in the app, so there is no content site
to index. There is no "Share this demo" for a headless project, because a headless project
is a local clone with no repository of the SC's own: share one by pushing your clone to a
repository and sending the link.

## For agents

The same doors exist as tools, in [mcp-tools.md](mcp-tools.md): `probe_shared_demo` reads
a demo from a link, `add_shared_demo` adds it, `create_project` takes an added demo's id or
a link, `change_demo_source` repoints a project, and `forget_added_demo` takes a demo off
the list. The demos an SC has added live in the `demoBuilder.demos.added` setting.

## Related

- [project-file-format.md](project-file-format.md) — the file formats, and where a project's storefront is looked up
- [custom-block-libraries.md](custom-block-libraries.md) — bringing your own blocks
- [mcp-tools.md](mcp-tools.md) — the tool catalogue
