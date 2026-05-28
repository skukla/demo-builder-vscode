# Step 2: Update Wizard Step Configuration

## Purpose
Add the `eds-preflight` step to the wizard configuration and ensure it appears conditionally based on stack requirements (when GitHub or DA.live is needed).

## Prerequisites
- [ ] Step 1 complete (EdsPreflightStep component exists)
- [ ] Understanding of wizard-steps.json structure

## Implementation Details

### wizard-steps.json Changes
Add new step entry after `settings` and before `review`:

```json
{
  "id": "eds-preflight",
  "name": "EDS Setup",
  "description": "Create GitHub repository and populate DA.live content for Edge Delivery Services.",
  "enabled": true,
  "condition": {
    "stackRequiresAny": ["requiresGitHub", "requiresDaLive"]
  }
}
```

### Step Ordering
Position: After `settings` (step 10), before `review` (step 11)

This ensures:
1. All user configuration is collected first
2. EDS resources are created before final review
3. User can see EDS setup results in review step

### Step Filtering Logic
No changes needed to `stepFiltering.ts` - existing `stackRequiresAny` condition support already handles this pattern (same as `eds-connect-services`).

## Files to Modify

### `src/features/project-creation/config/wizard-steps.json`
- Insert `eds-preflight` step definition between `settings` and `review`
- Use `stackRequiresAny` condition for GitHub OR DA.live stacks

## Expected Outcome
- Step appears in wizard only for stacks requiring GitHub or DA.live
- Step positioned correctly in wizard flow
- Timeline navigation shows "EDS Setup" step

## Acceptance Criteria
- [ ] `eds-preflight` step defined in wizard-steps.json
- [ ] Step has `stackRequiresAny` condition matching EDS-dependent stacks
- [ ] Step appears after settings, before review in step order
- [ ] Existing stepFiltering.ts handles the condition without modification

## Dependencies from Other Steps
- **Requires from Step 1**: Nothing directly (configuration only)
- **Provides to Step 5**: Step ID `eds-preflight` for WizardContainer integration
