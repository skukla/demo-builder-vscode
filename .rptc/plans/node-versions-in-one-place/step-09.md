# Step 9: Move installed components when a release moves the Node

**Replaced 2026-10-07 (owner).** The first version of this step waited for Start Demo to notice
a component installed under an older Node and ask. The owner's point: the only thing that ever
puts a component behind is a release that moves Demo Builder's Node, and that moment is known,
so deal with it then, before anyone reaches Start.

**When.** At activation, when `demoBuilderNode()` differs from the Node recorded at the last
activation (`globalState`), or none is recorded yet. Never on an ordinary start (the owner's
exception to PR-1 D14, step 12). In the background, behind the post-update progress notification.

**What.**

1. Prepare the new Node with the Adobe CLI under it (`ensureNode`, step 2). If that fails, stop:
   nothing moves, the stamp is not written, the next activation tries again.
2. For every project Demo Builder knows (the projects folder AND the recent-projects list),
   read it WITHOUT opening it. For each component instance whose record
   (`metadata.nodeVersion`) names another Node: reinstall its packages under the new Node
   (`installNpmDependencies`, with its catalog build step) and rewrite the record.
3. Skip: a component of an SC's own repo that carries its own Node
   (`appBuilderComponents[id].nodeVersion`); a component with no record (it reads as the current
   Node); every component of a project whose demo is RUNNING (it catches up at the next
   activation after the demo stops).
4. A failed reinstall leaves that component on its old Node, which still works, and is listed in
   the result. Step 12's dashboard notice offers Retry for any component whose record is behind.
5. Save each changed project without making it current; the open project is updated in memory
   too, so a later save cannot write the old record back.
6. Write the stamp once every project has been tried. Cleanup (step 11) then removes the old Node
   when nothing records it.

**Safe by construction:** the release check guarantees every shipped component accepts the new
Node, or the release cannot ship.

**Tests:** a project with a component behind is reinstalled on the new Node and its record
moves; one already current is untouched; an own-repo component and a no-record component are
skipped; a running project is skipped; a failed reinstall keeps the old record and is reported; a
failed Node preparation moves nothing and writes no stamp; the open project is updated in memory.
