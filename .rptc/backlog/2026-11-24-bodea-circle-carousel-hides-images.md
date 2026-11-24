---
id: EDS-80
kind: fix
area: eds
needs: []
value: low
status: backlog
---

# Bodea's Circle Carousel hides its images

Filed 2026-11-24, found while writing the shipped block examples (EDS-71).

The block's README in `skukla/bodea-source` describes "circular images with linked text below".
Its JS puts each image in a `.circle-carousel-circle` element (`circle-carousel.js` line 224), and
its CSS hides that element at every width (`circle-carousel.css` line 66, `display: none`). Nothing
else in the repo overrides it (code search for `circle-carousel-circle`: only the block's own three
files). So authors see labels only, whatever images they add.

Fix in `bodea-source`: drop the `display: none`, or say in the README that the block is labels only.
