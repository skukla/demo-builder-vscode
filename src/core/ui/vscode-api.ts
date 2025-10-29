// Re-export vscode API from webviews
// This allows webview UI components and hooks to access the VS Code API
// NOTE: Path is relative from src/core/ui/ to webview-ui/src/wizard/app/
export { vscode } from '../../../webview-ui/src/wizard/app/vscodeApi';
