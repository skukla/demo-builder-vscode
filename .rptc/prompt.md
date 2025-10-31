# Prompt

ultrathink

When I click the Create New Project button on the welcome webview, I get a loading spinner that eventually produces an error instead of the new project wizard.

Here is the debug log:

[2025-10-30T18:05:32.555Z] DEBUG: Registering Demo Builder commands...
[2025-10-30T18:05:32.556Z] DEBUG: Loaded API services configuration
[2025-10-30T18:05:32.556Z] DEBUG: Registered 16 commands: demoBuilder.showWelcome, demoBuilder.createProject, demoBuilder.showProjectDashboard ... (and 13 more)
[2025-10-30T18:05:32.576Z] DEBUG: [UI] Creating new Welcome webview panel
[2025-10-30T18:05:32.576Z] DEBUG: [UI] Welcome panel created successfully
[2025-10-30T18:05:32.576Z] DEBUG: [UI] Setting loading state...
[2025-10-30T18:05:32.680Z] DEBUG: Loading HTML set with message: "Loading Demo Builder..."
[2025-10-30T18:05:32.680Z] DEBUG: [UI] getWebviewContent called
[2025-10-30T18:05:32.680Z] DEBUG: [UI] getWebviewContent completed, returning HTML
[2025-10-30T18:05:34.181Z] DEBUG: Actual content HTML set for webview
[2025-10-30T18:05:34.181Z] DEBUG: [UI] Loading state set, content should be loaded
[2025-10-30T18:05:34.181Z] DEBUG: [UI] Initiating handshake protocol
[2025-10-30T18:05:34.182Z] DEBUG: [Extension] Welcome screen shown successfully
[2025-10-30T18:05:34.262Z] DEBUG: [UI] Received webview ready signal
[2025-10-30T18:05:34.262Z] DEBUG: [UI] Handshake complete
[2025-10-30T18:05:34.262Z] DEBUG: Welcome screen action: ready
[2025-10-30T18:05:34.263Z] DEBUG: Initial data sent to webview
[2025-10-30T18:05:34.271Z] DEBUG: Welcome screen action: ready
[2025-10-30T18:05:34.272Z] DEBUG: Initial data sent to webview
[2025-10-30T18:05:39.298Z] DEBUG: Welcome screen action: create-new
[2025-10-30T18:05:39.298Z] DEBUG: [Project Creation] Starting wizard from welcome screen
[2025-10-30T18:05:39.298Z] DEBUG: [UI] Welcome panel disposed
[2025-10-30T18:05:39.354Z] DEBUG: [Project Creation] Initializing wizard interface...
[2025-10-30T18:05:39.354Z] DEBUG: [Project Creation] execute() called. Current panel: undefined, comm: undefined
[2025-10-30T18:05:39.354Z] DEBUG: [Webview] createOrRevealPanel() for demoBuilderWizard. Active panels count: 0
[2025-10-30T18:05:39.354Z] DEBUG: [Webview] Singleton check for demoBuilderWizard: panel=none, comm=none
[2025-10-30T18:05:39.354Z] DEBUG: [Webview] Creating new demoBuilderWizard panel
[2025-10-30T18:05:39.355Z] DEBUG: [Webview] Registered demoBuilderWizard in singleton map. Active panels: 1
[2025-10-30T18:05:39.355Z] DEBUG: [Project Creation] After createOrRevealPanel(). Panel: exists, comm: undefined
[2025-10-30T18:05:39.355Z] DEBUG: [Project Creation] No communication manager, initializing...
[2025-10-30T18:05:39.461Z] DEBUG: Loading HTML set with message: "Loading Project Creation Wizard..."
[2025-10-30T18:05:40.964Z] DEBUG: Actual content HTML set for webview
[2025-10-30T18:05:40.965Z] DEBUG: [WebviewComm] Starting initialization
[2025-10-30T18:05:42.943Z] DEBUG: [Update] Extension up to date: v1.0.0
[2025-10-30T18:05:43.182Z] DEBUG: [Updates] citisignal-nextjs: Update available (installed=9404d6a → release=62148f2)
[2025-10-30T18:05:43.387Z] DEBUG: [Updates] commerce-mesh: Update available (installed=f386e92 → release=9f1657b)
[2025-10-30T18:05:55.955Z] DEBUG: Full error details:
{
  "message": "Webview handshake timeout",
  "stack": "Error: Webview handshake timeout\n\tat Timeout._onTimeout (/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/dist/utils/webviewCommunicationManager.js:72:24)\n\tat listOnTimeout (node:internal/timers:588:17)\n\tat process.processTimers (node:internal/timers:523:7)",
  "name": "Error"
}
