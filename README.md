# Adobe Demo Builder for VSCode

Create and manage Adobe Commerce demos with ease directly from Visual Studio Code.

## Features

- 🚀 **Quick Project Creation** - Set up a complete Adobe Commerce demo in minutes
- 🔐 **License Protected** - Secure distribution with license key validation
- 🔄 **Automatic Updates** - Stay current with auto-update functionality
- 📊 **Status Bar Integration** - Monitor your demo status at a glance
- 🎯 **Guided Setup** - Step-by-step wizard for configuration
- 🔧 **Prerequisites Management** - Automatic detection and installation guidance
- ☁️ **API Mesh Integration** - Deploy and manage Adobe API Mesh
- 🎨 **Demo Inspector** - Optional debugging overlay for demos

## Requirements

- Visual Studio Code 1.74.0 or higher
- Node.js 18.x or 20.x
- Valid Demo Builder license key
- Adobe I/O CLI (optional, for mesh deployment)

## Installation

1. Download the `.vsix` file from your team
2. Open VSCode Command Palette (`Cmd+Shift+P` on Mac)
3. Run: `Extensions: Install from VSIX...`
4. Select the downloaded file
5. Reload VSCode when prompted

## Quick Start

1. **Create a Project**
   - Open Command Palette (`Cmd+Shift+P`)
   - Run: `Demo Builder: Create Project`
   - Follow the guided setup wizard

2. **Start Your Demo**
   - Click the Demo Builder status bar item
   - Or run: `Demo Builder: Start`

3. **View Status**
   - Check the status bar for real-time updates
   - Run: `Demo Builder: View Status` for details

## Commands

- `Demo Builder: Create Project` - Create a new demo project
- `Demo Builder: Start` - Start the frontend application
- `Demo Builder: Stop` - Stop the running demo
- `Demo Builder: Configure` - Modify project settings
- `Demo Builder: Delete Project` - Remove the current project
- `Demo Builder: View Status` - Display detailed project status
- `Demo Builder: Check for Updates` - Manually check for extension updates

## Configuration

Configure Demo Builder through VSCode settings:

```json
{
  "demoBuilder.defaultPort": 3000,
  "demoBuilder.autoUpdate": true,
  "demoBuilder.updateChannel": "stable",
  "demoBuilder.showStatusBar": true,
  "demoBuilder.logLevel": "info"
}
```

## License Key

A valid license key is required to use Demo Builder. Contact your team administrator to obtain a key.

License key format: `DEMO-YYYY-XXXXXX`

## Project Structure

Projects are stored in `~/.demo-builder/projects/` with the following structure:

```
project-name/
├── config.json      # Project configuration
├── .env            # Environment variables
├── mesh.json       # API Mesh configuration
└── frontend/       # Frontend application
```

## Troubleshooting

### Prerequisites Not Found
- Run the prerequisite checker from the wizard
- Follow installation guides for missing components

### Port Already in Use
- Change the port in configuration
- Or stop the conflicting process

### Mesh Deployment Failed
- Ensure Adobe I/O CLI is authenticated
- Check network connectivity
- Verify project permissions

## Support

For issues or questions:
- Check the output panel: View → Output → Demo Builder
- Contact your team administrator
- Report issues to the development team

## UI/UX Design Decisions

### Loading States
The extension uses a custom loading spinner for webview initialization with carefully tuned timing:
- **1.5 second minimum display time** - Ensures users see clear feedback (1.5 spinner rotations)
- **100ms initialization delay** - Prevents VSCode's default "Initializing web view..." message
- **Centralized loading utility** - Consistent experience across all webviews

### Visual Components
- **Adobe Spectrum Design System** - Consistent with Adobe's design language
- **Custom spinner component** - Pure HTML/CSS for initial loading before React
- **Timeline navigation** - Visual progress indicator in project creation wizard

## Development

This extension is part of Adobe's Demo Builder toolkit. For development setup:

1. Clone the repository
2. Run `npm install`
3. Open in VSCode
4. Press `F5` to launch Extension Development Host

For detailed technical documentation, see `docs/technical.md`.

## Security

- All API keys are stored securely using VSCode's Secret Storage
- License keys are validated locally with encrypted database
- No sensitive data is logged or transmitted

## Version History

### 1.0.0
- Initial release
- Core project management
- License validation system
- Auto-update functionality
- Adobe I/O CLI integration
- API Mesh deployment
- Frontend installation

---

© 2024 Adobe Demo Team. Internal Use Only.