# Prototype Conventions: What Every Journey Window Must Already Do

Read before building or changing any journey window, and check every window against it before the
owner sees it. Each rule comes from a J1 verdict in `prototype-feedback.md`; the owner's words are
quoted so the rule can be traced and not reinterpreted. Owner, 2026-11-11, J2-1: "take another look
at all of the conventions we have ... so that we don't have to keep correcting the same stuff."

`docs/development/sop/dialog-design.md` still holds the general dialog rules (status in the title,
Title Case, no middle dots, button order). This file holds what the journey reviews added on top.

## Words

1. **No grey detail lines.** A row is its name and its one fact. No hint, sub-line, source, or
   example names under it. J1-2: "All of the extra information in the gray should be removed at the
   least." J1-3a: "The added by hand comments are noise we don't need. Strike all similar comments."
2. **No dependency or relationship phrases.** Each record counts under its own type; nothing says
   what it goes with or what needs it ("with their customers", "Products need it"). J1-5: "Are the
   lines noise or necessary?" (removed).
3. **Say a fact once.** A count appears in one place only; no heading, tab, or list count repeating
   it. J1-3b: "We say 10 customers like three times here."
4. **Basic facts, standard words.** A reason or state is one of a short fixed list of plain facts an
   SC knows, worded like software, never a one-off explanation. J1-3b: "It feels less like software
   and more like a one-off AI solution." "A commerce SC is not going to know these particulars."
5. **Cut the qualifier the title or verb already implies.** J1-5: "\"never deleted\" is noise." A
   line that only restates what the window or button says goes. So an install's rows read "Products 56", not "56 added",
   and add a verb only when it says something new ("53 added, 3 updated"). J2-1: "does the term
   'added' seem off" (agreed).
6. **Never explain a control's state.** No line says why something is ticked, locked, greyed or
   chosen. J2-1: "We don't need to tell people why things are ticked."
7. **Hide nothing the SC needs; list nothing they don't.** Items that need no knowing or doing are
   not listed (already-closed orders, protected settings). J1-3b: "Should we show an SC orders that
   are already closed as kept, or should we ignore them?" (ignore). So rows with nothing to change
   ("No changes") are not listed either.

## Layout

8. **The summary is a type table, the same one everywhere.** One row per data type: plain type name,
   its count with what happens ("56 added", "12 closed"), nothing else; type names are plain text,
   not links. The records are an optional spot check behind ONE button (Review Records): types on the
   left, records on the right. J1-2 to J1-4 (linked names: "two controls did one job").
9. **One control per job.** Never two ways to do the same thing in one window. J1-4: "linking through
   to the individual type is noise or necessary" (removed).
10. **Same layout on every variant.** Every row, tab and column is present in the same place on every
   type and state; an empty one is greyed out, never missing. J1-3b: "throws off a consistent layout."
11. **Things that line up, line up.** Counts and markers sit in fixed slots so they align down the
    list. J1-3b: "should we move the dots to the right of the column so that the counts and the dots
    all line up" (yes).

## Size

12. **A window opens at the size of what it shows.** No large window for little content. J1.1: "We
    have a massive modal for no reason to the end user."
13. **Nothing scrolls for ordinary content.** J1.1: "on the second, we have content that scrolls."
14. **A window never grows once on screen.** When one step's content would grow, it becomes a new
    step (a new window may have a new size), or the content is made shorter (J1.1 to J1.3, J1-3d).
    So a short question or result after a tall window is its own small window, not a tall window
    with empty space.

## Runs and Results

15. **A run's rows are its steps; a problem sits on its row as ONE line, in the notice colour, and
    appears only at the end, in the room the working line used.** No closing sentence repeating the
    rows or the button. J1-3d.
16. **An ended run's one action sits in the footer beside Close** (Retry, Fix with AI, Open Commerce
    Admin). Row buttons only when one window has several fixes in different places. J1-3d.
17. **A clean run ends on the small result, which closes itself; "Took ..." shows only when the
    window stays open** (Phase 4, approved mockup).

## Markers and Colour

18. **Use the house's colours and markers, never new ones.** The notice dot (`StatusDot`), the notice
    text colour; a marker that ties two places shows in both. J1-3b: "We need to make sure to use the
    colors in the existing design system."

20. **Red is for deleting and removing only** (Clear, Uninstall, Delete). Any other main action is
    the standard blue, even one that loses changes (Undo Last Save): its sentence carries the
    warning. A losing choice beside a safer main action (Don't Save beside Save) is outline. J3-3:
    "I think red seems like an error. Too strong."

## The Spot Check

19. **The spot check only looks.** Its one button is Back, on the right, returning to the summary.
    No Cancel and no action: the summary is the only place an action is taken, so its warning or
    "I understand" box can't be skipped. J2-3: "should only go back to the summary and let the
    summary be the chief action door."

## Before the owner sees a window

- Read every line of it against rules 1 to 7 and strike what fails, before showing it.
- Check its size against 12 to 14 (the prototype pill: "Empty above buttons" should be small; a
  window with a large number there is a rule 12 or 14 failure).
- If a plan decision forces a line these rules would strike (for example "a locked row says why"),
  do not build it silently: raise the conflict with the owner first.
