# data-installer

Browses the Data Installer service's datapack catalog and installs packs into a
project's Commerce backend.

Almost all of it is internal: the panel, the clients, the parsers and the UI are
reached through the command and the handler maps, not by importing them.

## What another feature may import, and the trap that shaped the list

This feature had a curated barrel (`index.ts`) until 2026-08-31, when it was
retired under [ADR-022](../../../docs/architecture/adr/022-barrel-files.md) —
features are imported by module path and get no barrel. The barrel is gone; the
reasoning it carried is not, because it is about bundling and still applies.

**Anything a wizard step imports from here gets bundled into a WEBVIEW.** The
webview bundles are built by separate esbuild entries that cannot resolve
extension-host modules. Exposing `ShowDataInstallerCommand` or a handler map to a
webview caller drags in `vscode`, the command factory and the whole host graph —
which broke three `WizardContainer` suites with "Cannot find module
'@/commands/handlerContextFactory'" the moment it was tried.

Deep imports make this safer rather than less safe: a consumer pulls exactly the
module it names, so one host-touching module can no longer poison every consumer
of a shared barrel. What it costs is that nothing states the boundary in one
place any more — hence this section.

The four modules the wizard's Sample Data sub-step imports, and why each is
shared rather than copied:

| Module | Why it is shared |
|---|---|
| `services/datapackCatalog` | `groupDatapacks` / `pickDefaultVersion` / `orderVersions`. The wizard renders the same 40-rows-for-25-names catalog and must fold it identically; a second grouping rule would be a second source of truth |
| `ui/components/DatapackCard` | The wizard shows the same grid the panel does — a pack is a demo, with brand art, a version and a count of what it carries. A list of names asks the user to pick something they cannot see. One component with an optional `selected` beat a second, poorer card in project-creation |
| `ui/hooks/useDataInstallerRequest` | A handler's reply reaches the webview WHOLE — `{success, data, error}` — because the communication manager sends the entire `HandlerResponse` as the payload. A caller reaching for `data.items` off a raw `useVSCodeRequest` reads a field the envelope does not have, and a guard refusal (`success: false`) arrives looking exactly like a success. The wizard hit both at once: its sample-data list was empty forever and said nothing about why |
| `ui/dataInstallerFailure` | One failure treatment. Every surface calls the same guard, so every surface can be refused for the same reasons and must offer the same affordance for each. The wizard's sub-step grew its own copy first; sharing this is what retired it |

All four are presentational or pure, so none pulls an extension-host module into a
webview bundle. Importing anything else from this feature into webview-reachable
code is the mistake described above.

The host-side entry points — the command, the handler maps — are imported by path
by the host-side modules that register them (`commandManager`, the descriptor
modules). Those are registrations, not cross-feature dependencies.
