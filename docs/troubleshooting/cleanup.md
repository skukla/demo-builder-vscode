# Removing projects and data

## Delete a project from the UI — not with `rm -rf`

**Use the project card's kebab menu → Delete.** It is a real command
(`demoBuilder.deleteProject`), reached from the projects grid and the project
dashboard, and it is the only path that cleans up everything.

Deleting a project by hand removes the local folder and **leaves its cloud
resources behind**: the GitHub repository, the DA.live content, the Helix site
registration, and backend resources. Those keep existing, keep counting against
your org, and the next project of the same name collides with them.

This guide previously said a Delete Project command was something "future versions
may add" and gave `rm -rf` as the answer. That was wrong, and the advice orphaned
resources every time it was followed.

An agent can do the same thing with the `delete_project` tool, which requires the
project's name echoed back exactly — a fuzzy match cannot destroy the wrong one.

## What cleans up on its own

- **A failed creation** removes its own partial project.
- **Retrying a name that already exists** clears the previous directory first, so a
  retry needs no manual step.

A successfully created project is never removed automatically. That is deliberate.

## Where things live

```
~/.demo-builder/projects/<project-name>/
├── components/          cloned component repositories
├── logs/
├── .env                 environment configuration
└── .demo-builder.json   the project manifest
```

Override the root with `DEMO_BUILDER_PROJECTS_DIR`.

## When manual removal is still reasonable

Reclaiming disk space from projects whose cloud resources are already gone, or
clearing a machine you are done with. Each project is typically 100–500 MB.

```bash
du -sh ~/.demo-builder/projects/*
rm -rf ~/.demo-builder/projects/<name>
```

**If the project still has cloud resources, delete it from the UI first**, then
remove any leftover directory.

## Reset All

`Demo Builder: Reset All` deletes every project, clears workspace state, removes
stored secrets, and stops running processes.

Its title says "(Dev Only)" but nothing enforces that — the command has no `when`
clause, so it is visible in the palette for everyone. Treat the label as a warning
rather than a guard.

## A project folder deleted by hand still shows up

The extension tracks projects in its own state, not only on disk, so a
hand-deleted project can linger in the list. Reload the window
(`Developer: Reload Window`) to clear it.

## Related

- [Adobe CLI timeouts](adobe-cli-timeouts.md) — when a slow `aio` call looks like a
  failure
- [`../architecture/overview.md`](../architecture/overview.md)
