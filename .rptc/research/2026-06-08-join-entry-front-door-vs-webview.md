# Research: The "Join a shared storefront" entry — webview vs native, reframed against the front door

**Filed:** 2026-06-08 · Started as "the Join screen feels heavy for paste-a-link → confirm; should it be native VS Code UI instead of a webview?" **Method:** codebase walk (Join surface, resolve service, sibling entries) + backlog/research triangulation. **Outcome:** the question was at the wrong altitude — the Join webview is a confirmed **Slice-1 interim artifact**, and the durable target is the **product-selection front door / journey selector** already designed in the backlog. This doc records that finding and the open phasing gate, and **defers** the deep front-door research pass to when the front door becomes the active slice.

## Question (as asked, then reframed)

- **As asked:** the Join screen is a dedicated React webview that does paste-link → resolve → confirmation preview → launch the seeded wizard. A full webview feels heavy for that. Should it be native VS Code UI (InputBox → progress → modal confirm) instead?
- **Reframed (the real question):** is the Join webview merely a phase-1 artifact of a multi-phase approach whose end-state is a per-(product, ownership) guided experience? **Yes — confirmed.** So "native vs webview for *this* screen" is a local optimization on a surface the backlog already slates to be subsumed.

## Findings

### 1. The native-swap is mechanically cheap (the original question's answer)
- The resolve logic is **fully webview-decoupled**: `resolveJoinLink(link, readFile)` (pure) + `createPublicMasterReader(fetch)` (unauthenticated public read) in `handlers/joinHandlers.ts`. A plain command can call these directly — the webview adds nothing to the work.
- Native primitives already exist in-repo (`showInputBox`, `showQuickPick`/`showWebviewQuickPick`, `withProgress`, modal `showInformationMessage`).
- **Decisive sibling precedent:** the other two "gather a little input → launch the seeded wizard" entries are already **native** — Import from File (`showOpenDialog` → `executeCommand('demoBuilder.createProject', …)`) and Copy from Existing (`showWebviewQuickPick` → `createProject`), both in `services/settingsTransferService.ts`. **Join is the lone webview of the three.**
- So a native swap (InputBox → withProgress(resolveJoinLink) → modal confirm → createProject) is a **net deletion** (drops the `joinStorefront` bundle, `JoinStorefrontScreen`, chrome, lifecycle/anti-stranding plumbing, tests) and reuses the resolve service verbatim. **This remains true and available** — but see §2 before spending it.

### 2. The Join webview is a documented Slice-1 artifact, not an end-state
`engagement-modes-and-ownership.md:99` describes the current screen almost exactly — "a **distinct 'Join a shared storefront'** entry … one field: 'Paste the storefront link' → reads `storefront-share.json` → **confirmation preview** ('You're joining CitiSignal, shared by … → backend …; you'll author in your own AEM/DA.live') → into the gallery-less joiner wizard" — and tags it **"Refines Slice 1 Step 2"** (`:104`). It was always scoped as the phase-1 expedient.

### 3. The durable target is a product-selection front door (Join = one card)
- `engagement-modes-and-ownership.md:75`: up-front entry model — **"Solo / Start shared → gallery; Join shared → paste link."**
- `aem-sc-first-run.md:28–31, :71, :119`: a **front door** ("what are you here to build?") where **"cards are data, not code … the seed of the eventual configuration selector,"** built on the **existing** `selectedPackage`/`selectedStack`/`componentSelections`/registry model — explicitly *not* a new shape beside it.
- `user-journeys.md:73`: **"the journey selector ships in v1 (commerce live, content 'coming soon')."**
- `compositional-demo-builder.md`: north-star — "the synced storefront, the App Builder add-flow, and the content-SC wizard all **ladder into** it."

### 4. In the end-state, the standalone Join surface likely disappears
The front door is itself the (gallery) webview. "Join a shared storefront" becomes a **card → launches the create wizard with a 'paste link' first step** for the content flow. There is then **no separate Join screen** to make native-or-webview — the paste/resolve/confirm folds into the unified wizard. The durable mechanism (`resolveJoinLink`, the `storefront-share.json` marker, `executeSatelliteSetup`, `buildJoinModeState`, the `createProject` `joinDescriptor` handoff) carries forward unchanged; only the *entry surface* changes.

## Recommendation

1. **Do not invest further in the standalone Join container** (neither the native swap from §1 nor more webview chrome). That effort is throwaway once the front door (§3–4) absorbs the entry. The native-swap option is recorded here so it's available *if* the front door is deferred far enough that the interim surface needs maintenance.
2. **Keep the current Join webview as the interim Slice-1 entry**, minimal-touch. The anti-stranding lifecycle fix stands — it's needed until the front door subsumes the surface.
3. **The high-leverage research is the front door / journey selector itself** (per-(product, ownership) guided experience, cards-as-data over the existing registry/`componentSelections` model), with Join/Solo/Start-shared/Commerce-demo/AEM-storefront as peer cards. Do that as a dedicated RPTC research pass **when the front door becomes the active slice** — consistent with the backlog's "plan one slice at a time / JIT" discipline.

## Open gate (PM decision — blocks the §3 research pass)

Per the slice ladder (`synthesis-and-build-order.md:41–43`): Slice 1 = repoless wiring (**done**), Slice 2 = AEM as a content source, Slice 3+ = mirrored packages / App Builder. The **front-door/UX is a separate user-facing slice** — `aem-sc-first-run.md:125` reframes it as **"Slice 4 → content-SC front door + connect-flow UI + shared-surface adaptation"** — yet the *journey-selector shell* is called "v1." So the gate is:

> **Bring the front door forward as the next slice now** (let it absorb the Join entry + the commerce gallery), **or continue the headless ladder (Slice 2: AEM content source)** and leave the interim Join webview as-is until then?

This decision determines when the §3 front-door research pass is justified. It is not resolved here.

## Sources

- `src/features/project-creation/handlers/joinHandlers.ts` — decoupled `resolveJoinLink` / `createPublicMasterReader`
- `src/features/projects-dashboard/services/settingsTransferService.ts` — native sibling entries (Import / Copy)
- `.rptc/backlog/commerce-connect-aem-sc/engagement-modes-and-ownership.md` (esp. `:75`, `:99`, `:104`)
- `.rptc/backlog/commerce-connect-aem-sc/aem-sc-first-run.md` (esp. `:28–31`, `:71`, `:119`, `:125`)
- `.rptc/backlog/commerce-connect-aem-sc/user-journeys.md` (`:73`)
- `.rptc/backlog/commerce-connect-aem-sc/synthesis-and-build-order.md` (`:41–43`)
- `.rptc/backlog/compositional-demo-builder.md` (north-star / ladder)
