# Demo-Packages Architecture Simplification

## Status Tracking
- [x] Planned
- [ ] In Progress
- [ ] Code Review
- [ ] Complete

## Executive Summary
- **Feature**: Merge brands.json + templates.json into unified demo-packages.json
- **Purpose**: Eliminate confusion between "brand" (internal jargon) and "template" (conflicts with user mental model); reduce cognitive load from 4 files to 3
- **Approach**: Create unified data structure, single loader, update all imports, delete old files
- **Complexity**: Medium (refactoring across ~20 files, no new functionality)
- **Estimated Effort**: 8 steps
- **Key Risks**: Breaking existing wizard flow during migration; missing import updates causing runtime errors

## Test Strategy
- **Framework**: Jest with ts-jest
- **Coverage Goals**: 80%+ overall, 100% for loader/type validation
- **Test Scenarios Summary**: Detailed test scenarios in each step file; covers JSON loading, type validation, data merging, and backward compatibility

## Acceptance Criteria
- [ ] demo-packages.json created with merged data from brands.json + templates.json
- [ ] JSON schema validates new structure
- [ ] TypeScript types compile without errors
- [ ] All existing wizard flows function correctly
- [ ] All tests pass (new + updated)
- [ ] 11 old files deleted (4 JSON, 2 types, 4 loaders, 1 helper)
- [ ] No references to "brands" or old "templates" in import statements
- [ ] Documentation updated to reflect new architecture

## Risk Assessment
| Risk | Category | Likelihood | Impact | Mitigation |
|------|----------|------------|--------|------------|
| Breaking wizard during migration | Technical | Medium | High | Step-by-step migration with tests at each step |
| Missing import updates | Technical | Medium | Medium | Grep-based verification sweep; TypeScript compilation check |

## Dependencies
- **New Packages**: None
- **Configuration Changes**: New JSON structure (demo-packages.json)
- **External Services**: None

## File Reference Map

### Existing Files to Modify
- `src/features/project-creation/ui/steps/WelcomeStep.tsx` - Update imports
- `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Update imports
- `src/features/project-creation/ui/helpers/stackHelpers.ts` - Update type references
- `src/features/project-creation/ui/components/BrandSelector.tsx` - Update to use DemoPackage
- `src/features/project-creation/ui/components/BrandGallery.tsx` - Update to use DemoPackage
- `src/features/project-creation/ui/components/brandGalleryHelpers.ts` - Update type references
- `src/features/project-creation/ui/steps/ReviewStep.tsx` - Update imports
- `src/features/project-creation/handlers/executor.ts` - Update loader usage
- `src/features/dashboard/commands/showDashboard.ts` - Update imports
- `src/types/index.ts` - Update exports
- `templates/CLAUDE.md` - Update documentation

### New Files to Create
- `templates/demo-packages.json` - Merged package data
- `templates/demo-packages.schema.json` - JSON schema
- `src/types/demoPackages.ts` - TypeScript type definitions
- `src/features/project-creation/ui/helpers/demoPackageLoader.ts` - Unified loader

### Files to Delete
- `templates/brands.json`
- `templates/brands.schema.json`
- `templates/templates.json`
- `templates/templates.schema.json`
- `src/types/brands.ts`
- `src/types/templates.ts`
- `src/features/project-creation/ui/helpers/brandDefaults.ts`
- `src/features/project-creation/ui/helpers/brandStackLoader.ts`
- `src/features/project-creation/ui/helpers/templateLoader.ts`
- `src/features/project-creation/ui/helpers/templateDefaults.ts`
- Related test files in `tests/` directory

## Coordination Notes
- Steps 1-3 (create new files) can proceed without modifying existing code
- Step 4 (update imports) is the critical migration point - must be atomic
- Step 5 (update tests) must complete before Step 6 (delete old files)
- Step 7 (verification sweep) confirms no broken references remain

## Next Actions
- Run `/rptc:tdd "@demo-packages-simplification/"` to begin TDD implementation
- Start with Step 1: Create demo-packages.json and schema
