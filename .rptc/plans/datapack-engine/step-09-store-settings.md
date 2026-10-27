# Step 09: store settings in a pack

Status: **to do** (owner's ask, 2026-10-27).

A new kind, `store_config`: rows of
`{path, value, scope, scope_code}`. Install reads and records each setting's current value,
then writes the new one through `PUT /V1/system/config` (the writer the setup guide's config
steps already use; ACCS since 2026-09, proven live 2026-10-10), and reads the response's
`errors`, since a 200 can carry refused items. Remove restores the recorded values. Scope
codes are mapped to the install target's website and store. Export reads a chosen list of
paths back out of a store. Limit: packs that carry it live in OUR library and zip files;
the service's catalog checks each kind against its own list and will most likely refuse an
unknown one.
