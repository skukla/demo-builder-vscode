# Step 6: One recorded version per installed component

Today start reads the version recorded at install (`metadata.nodeVersion`, plus a
`.node-version` file in the component folder), while update reads the registry's current value.
Raise the version and the install moves but `npm run dev` does not.

- Start reads the record. Update compares the record with `nodeFor(id)`; when they differ, it
  reinstalls under the declared version and rewrites both the record and `.node-version`.
- Reset does the same for what it reinstalls.
- A project made before the record existed has none: it reads as the declared version.

This is the project half of the migration: projects move at their next update or reset, never
silently at start.

**Tests:** start uses the record; update with a changed declaration reinstalls and rewrites it;
update with the same declaration does not reinstall.
