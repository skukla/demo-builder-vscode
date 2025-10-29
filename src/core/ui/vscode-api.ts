// Re-export vscode API from webviews
// This allows src/core/ui components and hooks to access the VS Code API
// TEMPORARILY COMMENTED OUT FOR BACKEND COMPILATION
// export { vscode } from '../../webviews/app/vscodeApi';

// Stub export to prevent compilation errors
// This will be restored when webview restructure is complete
export const vscode = {} as any;
