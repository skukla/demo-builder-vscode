# Resource disposal

Anything registered with VS Code — a watcher, an event listener, a status bar item —
outlives the code that made it unless something disposes it. In an extension that
reloads often, a leaked listener fires against a dead object.

## `DisposableStore`

`@/core/utils/disposableStore` collects disposables and releases them **in reverse
order** on `dispose()`. LIFO matters: a resource created second may depend on the
first, so tearing down in creation order can dispose something still in use.

```typescript
class MyService {
    private disposables = new DisposableStore();

    initialize() {
        this.disposables.add(vscode.workspace.createFileSystemWatcher('**/*.ts'));
        this.disposables.add(vscode.window.onDidChangeActiveTextEditor(handler));
    }

    dispose() { this.disposables.dispose(); }
}
```

**Commands get one for free.** `BaseCommand` holds a store and empties it — which is
most of why extending it is a rule rather than a suggestion. A hand-rolled command
reliably forgets one listener.

## The failure to recognise

A leak does not present as a leak. It presents as a handler running twice, or running
after the panel that owned it closed, or state changing with nothing on screen to
explain it. When something fires more often than it should after a few reloads, look
for a listener nobody disposed.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Commands extend
`BaseCommand` or `BaseWebviewCommand`, which is what makes disposal automatic rather
than remembered.

## Related

- [`src/core/base/README.md`](../../src/core/base/README.md) — what extending gives you
