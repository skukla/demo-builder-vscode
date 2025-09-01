# Changelog

All notable changes to the Adobe Demo Builder VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Centralized CSS System**: Created `custom-spectrum.css` with 850+ lines of reusable CSS classes for React Spectrum components
- **Class Name Utilities**: Added `classNames.ts` utility module with `cn()` function for composing CSS classes
- **Per-Node-Version Prerequisites**: Support for installing prerequisites in specific Node.js versions
- **Prerequisite Continuation**: Ability to continue prerequisite checking from a specific index after installation
- **Version-to-Component Mapping**: Shows which components require which Node.js versions during prerequisite checking
- **Enhanced Sub-Prerequisites Display**: Sub-prerequisites (plugins) now only appear when actively checking or completed
- **Graph-Based Dependency Architecture**: Documented future architecture for flexible entity relationships (see `docs/architecture/graph-based-dependencies.md`)

### Changed
- **Complete Style Migration**: Migrated all 118+ inline `UNSAFE_style` declarations to `UNSAFE_className` with CSS classes
- **Prerequisite Status Messages**: Changed initial status from "Checking version..." to "Waiting..." for unchecked prerequisites
- **Sub-Prerequisites UI**: Removed bullet points from sub-prerequisites, maintaining indentation for hierarchy
- **Improved Scrolling**: Better auto-scroll behavior during prerequisite checking with proper alignment
- **Prerequisites JSON Structure**: Enhanced with `perNodeVersion`, `plugins`, and component requirements support

### Fixed
- **Prerequisite Check Flow**: Fixed issue where Git prerequisite showed "Checking version" while waiting
- **Plugin Display Logic**: Fixed premature display of "not installed" status for unchecked plugins
- **Scroll Positioning**: Fixed last prerequisite item visibility during checking
- **fnm Shell Configuration**: Automatically configures shell profile after fnm installation (adds to .zshrc/.bashrc)

### Technical Improvements
- **Maintainability**: All styles now centralized in CSS files rather than scattered inline styles
- **Performance**: CSS classes cached by browser, reducing re-render overhead
- **Type Safety**: Added TypeScript interfaces for prerequisite plugins and enhanced checking
- **Code Organization**: Created dedicated utilities directory for shared functions

## [1.0.0] - Previous Release

Initial release of Adobe Demo Builder VS Code Extension.