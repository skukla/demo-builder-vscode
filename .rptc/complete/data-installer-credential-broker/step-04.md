# Step 04 — Docs, and the security note this endpoint deserves

**Repos:** both. **Does not block release** — but do not defer it past the release
either. Three of the four documents below are currently *wrong* the moment step 02
merges, and a wrong doc is worse than a missing one.

## Four documents, three of them now false

### 1. `docs/systems/data-installer.md` §1

Line 24 reads **"There are no credentials to configure."** That was true when the
only auth was the user's IMS token. It is not true of a datapack write.

Replace it with the resolution order, in precedence:

1. a pair declared on the `adobe-commerce-accs` component — hand-pasted or written
   by `provision-accs-credentials`
2. the shared service's `get-commerce-credentials`, when a discovery service is
   configured
3. nothing — refuse, and offer Console provisioning only where it can succeed

Say which of those the user configures (the first, optionally) and which they do
not (the second — it follows `demoBuilder.accsDiscovery.services`, already
configured for store discovery), and say that an unconfigured service shows up in
Diagnostics rather than as silence. **No endpoint, no org id, no tenant id in the
file**: it is tracked in a public repo.

### 2. `accs-discovery-service/README.md` — Security §

The bullet claiming the `client_id` and `client_secret` "never leave the action
runtime" becomes false for the new inputs. Do not soften it — split it:

- `IMS_CLIENT_ID`/`IMS_CLIENT_SECRET` are consumed inside the runtime and still
  never leave it.
- `COMMERCE_S2S_CLIENT_ID`/`COMMERCE_S2S_CLIENT_SECRET` are **dispensed by design**
  to callers who clear the guard chain.

The whole value of the original sentence was that a reader could rely on it. Keeping
it as a blanket claim spends that.

### 3. `accs-discovery-service/README.md` — API §

Add `GET /get-commerce-credentials` in the shape the other endpoints use: headers,
success body, and the full error table (401 / 403 / 405 / 503), matching what step
01 actually returns. Note that rotation is `.env` + redeploy, and that
`aio runtime action update --param` is deliberately not the path — an update call
that omits a param drops it.

### 4. `accs-discovery-service/.env.example`

Both new variables, with a comment saying what the credential must be subscribed to
(`ACCS-REST-API`) and that it must live in the org where the **Commerce instances**
are — not where the SC works.

## The security note

The sharpest fact in this plan is not in any of the four documents above:

> A single credential can write catalog data to **every ACCS instance in its org**,
> not only the one a project points at. Measured 2026-08-16, two instances, one
> credential, with a nonsense-instance control at 400 and a bad-secret control at
> 401.

That is true of the shipped code today, before this plan changes anything. What
this plan changes is that one such credential is now dispensed over HTTP to anyone
whose IMS token validates and whose email domain is allowlisted.

**Write it as an ADR** — `docs/architecture/adr/014-data-installer-shared-credential.md`,
next in sequence after 013. Not a section in a systems doc. Three reasons:

- It **reverses** the recommendation in
  `.rptc/research/data-installer-credential-home/research.md`, which argued brokering
  "gets worse, not better". The reversal is defensible — the research measured reach
  before the owner established that an SC's I/O project and the Commerce instances
  can sit in different orgs — but an undocumented reversal gets re-litigated, and
  the research file will still be there arguing the other way.
- The consolidation argument is genuinely counter-intuitive and needs to survive
  contact with a reviewer: **one pair replaces N**, each of which already reached the
  whole org. Fewer copies of the same power, not more power.
- The guard is IMS token + email domain and nothing below the org. Site scoping — the
  reason org scope was rejected for publish keys — has no equivalent here. A future
  reader will propose narrowing it; the ADR should record that there is nothing to
  narrow on, so they spend that effort somewhere useful.

The ADR must state its own limits: cross-org reach is **untested** (step 05), and the
2026-08-16 measurement covered a **read**. A write conclusion needs a write.

## Cross-links

- The ADR points at `step-05.md` for the open question and at
  `.rptc/backlog/per-sc-io-project.md` for what happens if the answer is yes.
- `docs/systems/data-installer.md` §7 "See also" gains the ADR.
- The overview's Steps table gets its status column updated as each step lands.

## Do not

- Do not promote the research file to `docs/research/`. It is superseded on its
  central recommendation; promoting it now would curate the wrong conclusion.
- Do not name a person anywhere in these files, and do not quote an activation id,
  tenant id or Runtime endpoint out of a live response. `.rptc/CLAUDE.md` records
  why, and it was a real leak.
- Do not write the ADR as a security *warning*. It is a design record with a
  measured blast radius. Alarm ages badly; measurements do not.
