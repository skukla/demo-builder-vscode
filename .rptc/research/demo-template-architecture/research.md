# Demo Template Architecture - Research Document

## Status Tracking
- [x] Discovery Complete
- [x] Ready for Planning (Phase 2 plan created)
- [ ] In Implementation

**Created:** 2025-12-16
**Last Updated:** 2025-12-16

---

## Executive Summary

**Topic:** Demo-First Architecture with Adobe Commerce Backend Configurations

**Purpose:** Design a flexible wizard system where demo templates are the primary entity, with customizable backend/frontend combinations and component-specific configuration steps.

**Key Insight:** Instead of asking users to configure a system from scratch, we should offer pre-configured demo templates (e.g., "CitiSignal Financial Services Demo") that users can customize by selecting backend infrastructure and optional features.

---

## Background: Adobe Commerce Backend Landscape

### Backend Configurations

| Configuration | Full Name | Description | Data Storage |
|---------------|-----------|-------------|--------------|
| **PaaS** | Commerce Cloud (PaaS) | Traditional Adobe Commerce on Cloud | Commerce database |
| **PaaS + ACO** | PaaS with Adobe Commerce Optimizer | PaaS with ACO catalog layer | ACO for catalog, Commerce for orders/customers |
| **ACCS** | Adobe Commerce Cloud Services | SaaS + ACO combined offering | ACO for catalog, SaaS Commerce for transactions |

### Key Terminology

- **ACO (Adobe Commerce Optimizer)**: SaaS catalog layer that provides flexible catalog management, merchandising rules, and performance optimization
- **ACCS**: A combined product offering where SaaS Commerce is bundled with ACO - these are NOT separate components
- **PaaS + ACO**: PaaS Commerce with ACO added as an enhancement layer

### Data Ownership by Backend

| Data Type | PaaS | PaaS + ACO | ACCS |
|-----------|------|------------|------|
| Product catalog | Commerce DB | ACO | ACO |
| Orders | Commerce DB | Commerce DB | SaaS Commerce |
| Customers | Commerce DB | Commerce DB | SaaS Commerce |
| Inventory | Commerce DB | Commerce DB | SaaS Commerce |
| Pricing | Commerce DB | ACO (rules) + Commerce | ACO |

---

## Architecture Decision: Demo-First with Customization

### The Model

**Primary Entity:** Demo Template (e.g., "CitiSignal Financial Services Demo")

**Customization Axes:**
1. **Backend Infrastructure:** PaaS, PaaS + ACO, or ACCS
2. **Frontend Framework:** EDS (Edge Delivery Services) or Headless NextJS
3. **Optional Features:** API Mesh, AEM integration, App Builder apps

### User Flow

```
1. User selects Demo Template
   └── "CitiSignal Financial Services Demo"

2. Wizard shows pre-configured selections
   └── Backend: ACCS (recommended)
   └── Frontend: EDS (recommended)
   └── Features: API Mesh (required), AEM (optional)

3. User can customize
   └── Change backend to PaaS + ACO
   └── Keep EDS frontend
   └── Enable AEM integration

4. Wizard adjusts steps dynamically
   └── Shows relevant configuration steps
   └── Shows appropriate data import options
```

### Why Demo-First?

1. **Reduced Cognitive Load:** Users don't need to understand component relationships
2. **Validated Combinations:** Demo templates represent tested, working configurations
3. **Faster Setup:** Pre-populated settings get users to a working demo faster
4. **Flexibility:** Power users can still customize everything
5. **Scalability:** New demos are new templates, not new code

---

## Component-Specific Wizard Steps

### Current Implementation (v1.0)

Using the `requiredComponents` field in `wizard-steps.json`:

```json
{
  "id": "api-mesh",
  "name": "API Mesh Setup",
  "enabled": true,
  "requiredComponents": ["commerce-mesh"]
}
```

**Current Logic:** ALL required components must be selected (AND logic).

### Future Extensions Needed

#### 1. OR Logic for Alternative Backends

When a step should appear for ANY of multiple backends:

```json
{
  "id": "catalog-config",
  "name": "Catalog Configuration",
  "enabled": true,
  "requiredComponents": {
    "any": ["aco-catalog", "accs-bundle"]
  }
}
```

#### 2. Exclusive OR for Mutual Exclusivity

When components are mutually exclusive (can't select both):

```json
{
  "id": "backend-selection",
  "validCombinations": [
    ["paas-backend"],
    ["paas-backend", "aco-addon"],
    ["accs-bundle"]
  ]
}
```

#### 3. Conditional Requirements

When requirements depend on other selections:

```json
{
  "id": "aco-config",
  "name": "ACO Configuration",
  "enabled": true,
  "requiredComponents": {
    "all": ["aco-addon"],
    "none": ["accs-bundle"]
  }
}
```

---

## Data Import Feature Design

### Import Targets by Backend

| Backend | Import Targets |
|---------|----------------|
| PaaS | Commerce DB (all data) |
| PaaS + ACO | ACO (catalog), Commerce DB (orders/customers) |
| ACCS | ACO (catalog) - transactions via SaaS APIs |

### Wizard Flow for Data Import

```
1. Backend determines available import targets
2. User selects what to import:
   └── Catalog data (products, categories)
   └── Customer data (if supported)
   └── Order history (if supported)
3. Wizard shows relevant import steps
4. Import configuration collected
```

### Proposed Step Configuration

```json
{
  "id": "data-import-catalog",
  "name": "Catalog Data Import",
  "enabled": true,
  "requiredComponents": {
    "any": ["aco-addon", "accs-bundle"]
  },
  "optionalFeature": true
}
```

---

## Demo Template Configuration Structure

### Proposed Schema

```json
{
  "id": "citisignal-financial",
  "name": "CitiSignal Financial Services Demo",
  "description": "Complete financial services storefront with...",
  "defaults": {
    "backend": "accs-bundle",
    "frontend": "eds-storefront",
    "features": ["commerce-mesh", "aem-integration"]
  },
  "supportedBackends": ["paas-backend", "paas-backend+aco-addon", "accs-bundle"],
  "supportedFrontends": ["eds-storefront", "headless-nextjs"],
  "requiredFeatures": ["commerce-mesh"],
  "optionalFeatures": ["aem-integration", "app-builder-extensions"]
}
```

### Template Selection Step

```json
{
  "id": "template-selection",
  "name": "Demo Template",
  "enabled": true,
  "position": 0
}
```

This becomes the first step, replacing or enhancing the current "Welcome" step.

---

## Implementation Phases

### Phase 1: Foundation (Current)
- [x] Component-specific wizard steps with `requiredComponents`
- [x] AND logic for multiple requirements
- [x] Mesh steps conditional on `commerce-mesh`

### Phase 2: Backend Matrix
- [x] **PLANNED** - See `.rptc/plans/backend-matrix-or-logic/`
- [ ] Define backend component IDs (paas, paas+aco, accs)
- [ ] Add OR logic support to `filterStepsByComponents`
- [ ] Create backend-specific configuration steps

### Phase 3: Demo Templates
- [x] **PLANNED** - See `.rptc/plans/demo-templates-phase-3/`
- [ ] Create `demo-templates.json` configuration
- [ ] Build Template Selection step (card grid UI)
- [ ] Simplify ComponentSelectionStep (remove placeholder sections)
- [ ] Wire template defaults to component selection

### Phase 4: Data Import
- [ ] Design data import wizard steps
- [ ] Implement import target resolution by backend
- [ ] Build import progress/validation UI

---

## Open Questions

1. **Template Versioning:** How do we handle demo template versions when Adobe releases new features?

2. **Template Discovery:** Should users be able to download additional templates from a marketplace?

3. **Custom Templates:** Should power users be able to create their own demo templates?

4. **Migration Path:** How do existing projects migrate when templates change?

5. **Feature Flags:** Should some template features be gated by Adobe organization entitlements?

---

## Related Research

- **Component-Specific Wizard Steps**: `.rptc/research/component-specific-wizard-steps/research.md`
- **Current wizard configuration**: `templates/wizard-steps.json`
- **Component definitions**: `templates/components.json`

---

## Next Steps

When ready to implement:

1. Start with `/rptc:plan "demo-template-architecture"` referencing this research
2. Focus on Phase 2 (Backend Matrix) first - builds on existing infrastructure
3. Consider user testing with current CitiSignal demo before Phase 3
