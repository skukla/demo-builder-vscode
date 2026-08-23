# Instance wipe option — remove as much data as the service allows

**Filed:** 2026-08-22, as the successor to
[`../complete/2026-08-17-what-does-a-datapack-removal-actually-delete.md`](../complete/2026-08-17-what-does-a-datapack-removal-actually-delete.md).

## Provenance

The predecessor asked whether a datapack removal could give a clean instance.
Answered 2026-08-22 by the Data Installer service owner: it cannot — removal is
pack-scoped, and hand-created data is out of its reach. The "clean slate" want
survives the answer, so it becomes its own feature: an explicit wipe option
that removes as much data from the Commerce instance as is possible.

## Goal / Scope

Give a user a deliberate way to clear a demo instance's data down to whatever
floor the service permits, as a distinct action — NOT folded into reset (reset
already means "put the storefront back, optionally clear the pack"; a wipe is a
different promise and must not share a button with it).

Open design questions, in dependency order:

1. **What CAN be removed?** The service's removal is pack-scoped per data type.
   The maximal wipe available today is therefore: for every datapack the
   instance has seen, remove every data type it carries. What the union of
   known packs leaves behind (hand-created records, data from packs the
   extension never saw) defines the floor — and the wipe's honesty depends on
   stating that floor, not implying zero.
2. **Whose packs?** The project records only ITS datapack. A wipe that wants to
   go further needs the service to enumerate what was imported to the instance
   (does the activity endpoint expose enough? `get_datapack_activity` exists on
   the MCP surface). If enumeration is impossible, the wipe is scoped to what
   this project knows, and says so.
3. **Whether the service should grow a true wipe.** Worth raising with the
   service owner as a feature request — a server-side wipe would obsolete the
   client-side union and reach data the client cannot name. Record the answer
   here either way.
4. **Surface.** Candidates: a Data Installer surface action (beside import), a
   dashboard kebab item, and the MCP tool surface (`reset_datapack` exists —
   check whether it is already the per-pack removal and whether a wipe is a
   loop over it or a new tool).

## Constraints

- **No undo.** Every removal is irreversible; the confirm must name what will
  be removed AND what will survive.
- The predecessor's finding stands: hand-created data survives any
  client-driven wipe. Never promise "clean instance" unless the service grows
  a true wipe (question 3).
- A six-type removal was measured at 470 seconds — a multi-pack wipe is
  potentially a very long operation; surface duration honestly.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-22-instance-wipe-option.md` and its predecessor
> in `.rptc/complete/`. Answer the four design questions in order — question 1
> (what the maximal client-side wipe consists of) and question 2 (whether the
> service can enumerate imports beyond this project's) gate everything, and
> question 3 (a service-side true wipe) may obsolete the rest, so ask it early.
> Then design the surface and confirm copy before writing code.
