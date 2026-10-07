# Step 9: Start notices an older install

A component's record (`metadata.nodeVersion`) is the Node it was last installed under. When it
differs from what the register now answers, Start still runs it on the recorded Node (its
installed packages were built for it) and shows one notice: "Installed under Node 20; this
release uses 24. Reinstall now?" Reinstall runs the existing update/reinstall path, which moves
the record (step 6). A project with no record reads as the current Node, as today.

House notice pattern (`spectrum-webview-ui` dashboard notices), and the same answer reaches an
agent through `get_project_status`.

**Tests:** same Node, no notice; older record, notice and still starts on the recorded Node;
reinstall moves the record.
