# Step 04 — Render the name beside the code

Depends on 02 (the row) and 03 (the stored names).

## Change

The Commerce scope row shows the name it was chosen by, with the code kept alongside:

```
Commerce scope  Website      CitiSignal (citisignal)
                Store        CitiSignal Store (citisignal_store)
                Store View   CitiSignal US (citisignal_us)
```

- **Name first, code parenthesised and muted.** The name is what the user picked; the code
  is what is in the `.env` and what they would grep for. Both earn their place in a detail
  panel — this is the surface you open when you want specifics.
- **No name → the code alone**, not "(unknown)" and not an empty bracket. A codes-only row
  is the correct rendering for every project predating step 03, and it must not look
  broken.
- **Width.** The value column is ~264px; `CitiSignal Store (citisignal_store)` is close to
  it at 12px. Confirm the long case wraps inside the drawer rather than widening it — the
  existing rows use `overflow-wrap: anywhere`.

## Tests

- Name present → renders `Name (code)`.
- Name absent → renders the bare code, no parentheses (control: name present → parens).
- Mixed — one part named, two not → each renders independently, no bleed.
- A long name + long code wraps rather than overflowing.

## Done when

- The row reads the way the picker does
- A project with no stored names is indistinguishable from today's codes-only row
- `gate` green
