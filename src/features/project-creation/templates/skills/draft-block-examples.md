---
name: draft-block-examples
description: Writes an example page for each storefront block that has none in the DA.live block library, so authors see what they will insert and how to fill it in. Use when the user asks to draft or write block examples, when the dashboard's Draft Examples tile sent them, or when DA.live's block list shows "Column 1 content" placeholders.
---

# Draft examples for the blocks that have none

Every block in the storefront's code is in DA.live's block list. A block with no real example shows a placeholder Demo Builder made from its code ("Column 1 content"). Authors are visual: they want to see what they will insert, then know how to fill it in. This skill writes a real example page for each of those blocks, one at a time, with the user checking each before it is saved.

## What a good example is

- **Neutral sample content in the block's real structure.** The same rows and columns the block's code reads, filled with plain sample text, the way Adobe's own examples read ("Your heading here", "A short line about what this is for").
- **One named example per way of using the block.** Each example is a heading over the block's table. DA.live lists each one as its own item, named by its heading. A block with style variants, or that works with one row and with several, gets one example for each.
- **Images from the storefront's own media.** Reuse image addresses from the storefront's own pages. Use a neutral stock image (no logo, no brand, no faces) only when the storefront has none, and say so.
- **Generic retail wording, never a brand name.** The example is copied into every page an author builds; a brand name in it is wrong on the next demo.
- **A one-line description.** What the block is for and how to fill it in. DA.live shows it behind an info button on each example.
- **Commerce blocks are real blocks too.** An author may place account, cart, checkout and order blocks; their content comes from the shopper's session, so their example is the table the author places: the block's settings rows with their defaults (as on Adobe's cart page, "Enable Item Quantity Update | true"), or an empty table when the code reads no settings. Neutral, no brand; the README and code name the settings and their defaults.

## The worked example (Carousel)

The page has two named examples. Each row of the carousel table is one slide: an image in the first cell, then a heading, one line and a link in the second.

```html
<h2>Carousel, three slides</h2>
<div class="carousel">
  <div>
    <div><picture><img src="STOREFRONT-IMAGE-1" alt="New season"></picture></div>
    <div><h3>New season, new arrivals</h3><p>Discover the latest pieces in our collection.</p><p><a href="/">Shop now</a></p></div>
  </div>
  <div>
    <div><picture><img src="STOREFRONT-IMAGE-2" alt="Free shipping"></picture></div>
    <div><h3>Free shipping over $50</h3><p>On every order, every day.</p><p><a href="/">Learn more</a></p></div>
  </div>
  <div>
    <div><picture><img src="STOREFRONT-IMAGE-3" alt="Our stores"></picture></div>
    <div><h3>Find a store near you</h3><p>Visit us and see the collection in person.</p><p><a href="/">Find a store</a></p></div>
  </div>
</div>
<h2>Carousel, single slide</h2>
<div class="carousel">
  <div>
    <div><picture><img src="STOREFRONT-IMAGE-1" alt="Banner"></picture></div>
    <div><h3>Your heading here</h3><p>A short line about what this banner is for.</p><p><a href="/">Call to action</a></p></div>
  </div>
</div>
```

Its description: "A full-width rotating banner. Each row is one slide: an image in the first column, then a heading, a short line and a link. With two or more rows it turns every 6 seconds; one row stays still."

`STOREFRONT-IMAGE-n` stands for an image address taken from the storefront's own pages. A description says only what the block's code and README show; check details such as timing in the code before writing them.

## The loop

1. **Find the blocks.** Call `list_blocks_needing_examples` with the project name. Each block comes with its title, the table its code reads (`code`: rows, columns, style `variants`) and a README excerpt. Page through with `offset` when it says there are more. If its `note` says DA.live is not signed in, the list is the one recorded at the last build; that is fine to work from.
2. **Read each block.** Read its code in `components/eds-storefront/blocks/<id>/` (the `.js` shows which rows and cells it reads and what each one does; the `.css` shows its variants) and its `README.md`. `get_block_authoring_shape` gives the same shape for one block.
3. **Find the storefront's images.** Use `list_content` and `read_page` on a few of the storefront's own pages and take image addresses from them.
4. **Draft the page.** One named example per way of using the block, each `<h2>` over the block's table (`<div class="<id>">`, or `<div class="<id> <variant>">`, one `<div>` per row, one `<div>` per cell), plus the one-line description.
5. **Show the user the draft before writing it.** Show the example page and the description in plain words, and ask whether to save it. Change it as they ask.
6. **Save it.** Call `promote_block_to_library` with `{ projectName, blockId, title, unsafeHTML: <the page>, description, confirm: true }`. It writes the page into the storefront's block list, publishes it, and takes the block off the dashboard's Draft Examples count. If it answers `examplesRecord: 'failed'`, the page was written and only the dashboard's count could not be updated; it may lag until the next Refresh Blocks. Tell the user that in one line.
7. **Next block.** Say which block is next and how many are left.

At the end, tell the user in plain words how many blocks now have an example, which were skipped and why, and that the Draft Examples dot clears when every block has one.

## What not to do

- **No brand names**, in text, link labels or image descriptions.
- **No copying another site's content.** Write neutral sample text; take images only from this storefront.
- **No saving without the user seeing the draft first.** `promote_block_to_library` publishes to the live site.
- **No made-up behaviour.** Describe only what the block's code and README show.
