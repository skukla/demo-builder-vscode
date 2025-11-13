# RPTC Workflow Project

> **NOTE**: This file is auto-created at `.rptc/CLAUDE.md` when you run `/rptc:admin-init`.
> If you have a project root `CLAUDE.md`, the init command automatically adds a reference to this file.

---

## Tech Stack

- **Language**: [Your Language]
- **Framework**: [Your Framework]
- **Database**: [Your Database]
- **Testing**: [Your Test Framework]

## Essential Commands

```bash
# Development
[dev command]      # Start development server
[build command]    # Production build
[test command]     # Run all tests

# RPTC Workflow
/rptc:research "topic"        # Interactive discovery & brainstorming
/rptc:plan "feature"          # Collaborative planning with Master Planner
/rptc:tdd "@plan/"            # TDD implementation with quality gates
/rptc:commit [pr]             # Verify and ship (optional PR)

# Helpers
/rptc:helper-catch-up-quick          # Quick context (2 min)
/rptc:helper-catch-up-med            # Medium context (5-10 min)
/rptc:helper-catch-up-deep           # Deep analysis (15-30 min)
/rptc:helper-update-plan "@plan/"    # Modify existing plan
/rptc:helper-resume-plan "@plan/"    # Resume from previous session
```

## RPTC Workflow Philosophy

**You are the PROJECT MANAGER. Claude is your collaborative partner.**

Every feature follows this workflow:

**RESEARCH** → Interactive discovery with brainstorming
**PLAN** → Collaborative design with Master Feature Planner
**TDD** → Test-driven implementation with quality gates
**COMMIT** → Comprehensive verification before shipping

### Your Role as PM

- ✅ Final decision maker on all major choices
- ✅ Sign-off authority on research, plans, and implementation
- ✅ Approve delegation to Master Specialist Agents
- ✅ Review and approve all quality gates

### Claude's Role

- 🤝 Brainstorming partner and questioner
- 🔍 Discovery facilitator (asks probing questions)
- 📋 Planning coordinator (works with Master Planner)
- 🧪 TDD executor (strict test-first approach)
- 🎯 Quality gate manager (Efficiency & Security reviews)

## The RPTC Process

### 1. Research Phase (`/rptc:research "topic"`)

**Interactive Discovery**:

- Claude asks probing questions until understanding is solid
- Explores codebase for patterns and reusable code
- Optional web research (with your approval)
- Identifies gotchas and best practices
- **YOU approve** research before it's saved

**Master Web Research Sub Agent** (optional, with permission):

- Finds best practices and implementation examples
- Identifies common pitfalls
- Recommends libraries/frameworks

### 2. Planning Phase (`/rptc:plan "feature"` or `@research.md`)

**Collaborative Planning**:

- Claude creates initial plan scaffold
- Asks clarifying questions
- **YOU approve** sending to Master Feature Planner
- Master Planner creates comprehensive TDD-ready plan
- **YOU review and approve** final plan before saving

**Master Feature Planner Sub Agent** (with permission):

- Creates detailed implementation steps
- Designs comprehensive test strategy
- Maps all file changes
- Identifies risks and dependencies

### 3. TDD Phase (`/rptc:tdd "@plan/"`)

**Strict Test-Driven Development**:

- For each step: RED (tests first) → GREEN (implementation) → REFACTOR
- Auto-iteration on test failures (max 10 per step)
- After implementation complete:
  - **YOU approve** Master Efficiency Agent review
  - **YOU approve** Master Security Agent review
- **YOU approve** final completion

**Optimized Test Execution (5-10 Second Feedback Loop)**:

During TDD implementation, use fast test commands for rapid iteration:

```bash
# RECOMMENDED: Watch mode for instant feedback (5-10s per change)
npm run test:watch -- tests/path/to/working-on

# Alternative: Single file testing (5-10s)
npm run test:file -- tests/path/to/specific.test.ts

# Changed files only (30s-2min)
npm run test:changed
```

**See `TESTING.md` for complete test workflow guide.**

**Master Efficiency Agent** (with permission):

- Removes dead code and unused imports
- Simplifies overly complex logic
- Improves readability
- Ensures KISS and YAGNI principles

**Master Security Agent** (with permission):

- Identifies security vulnerabilities
- Validates input sanitization
- Reviews auth/authorization
- Fixes security issues

### 4. Commit Phase (`/rptc:commit [pr]`)

**Comprehensive Verification**:

- Full test suite (BLOCKS if any fail)
  - Use `npm run test:fast` (3-5 min) for quick validation
  - Use `npm test` for full pretest + lint + tests
- Coverage validation (80%+ target)
- Code quality checks
- Generates conventional commit message
- Optional PR creation

## Core Principles

### TDD (Non-Negotiable)

1. **Write tests FIRST** - Always, no exceptions
2. **RED → GREEN → REFACTOR** - The sacred cycle
3. **Auto-iteration on failures** - Claude fixes until passing (max 10)
4. **Never commit broken tests** - Enforced by hooks

### PM Approval Gates

1. **Research findings** - Explicit approval before saving
2. **Plan creation** - Approval to delegate to Master Planner
3. **Final plan** - Approval before saving plan
4. **Quality gates** - Approval for Efficiency/Security agents
5. **TDD completion** - Approval before marking complete

### Master Specialist Agents

When you approve delegation, specialized agents provide expert analysis:

- **Master Web Research Agent**: Best practices and implementation patterns
- **Master Feature Planner**: Comprehensive TDD-ready plans
- **Master Efficiency Agent**: Code optimization and simplification
- **Master Security Agent**: Vulnerability assessment and fixes

## AI Coding Assistant Guidelines

**Purpose**: Provide guardrails for working with AI coding assistants (Claude, GPT, etc.) to ensure generated code follows RPTC quality standards.

**Philosophy**: AI assistants are powerful tools, but they have systematic blind spots. These guidelines help you:
1. **Steer AI toward simplicity** via prompting strategy
2. **Prevent over-engineering** via pre-generation checklist
3. **Catch problematic output** via red flag detection
4. **Reference detailed guidance** via enhanced SOPs

**For Comprehensive Coverage**: See `docs/AI_CODING_BEST_PRACTICES.md` for detailed educational content, research citations, and extended examples beyond this quick reference.

**When to Use These Guidelines:**
- ALWAYS before requesting AI code generation
- ALWAYS when reviewing AI-generated code before accepting
- ALWAYS when AI proposes architectural decisions

**These are guardrails, not barriers.** Override when justified, but document rationale in code comments or `.rptc/` decision logs.

---

### Prompting Strategy (Evidence-Based Techniques)

AI models respond better to specific prompting techniques. Use these to steer toward simplicity and quality:

#### 1. Extended Reasoning ("Think Harder")

**Technique:** Ask AI to use extended thinking modes before generating code

**Example Prompts:**
- "Use ultrathink mode to analyze this requirement"
- "Think step-by-step about the simplest solution"
- "What are 3 different approaches, ranked by simplicity?"

**Why It Works:** Extended reasoning (Claude's thinking modes, GPT's chain-of-thought) reduces impulsive complexity. Research shows 40% fewer unnecessary abstractions when AI "thinks aloud" first.

**RPTC Integration:** Master agents automatically use extended thinking modes (configured via `.claude/settings.json` → `rptc.defaultThinkingMode`)

---

#### 2. Simplicity Directive ("SIMPLEST Possible")

**Technique:** Explicitly constrain AI to minimal solutions

**Example Prompts:**
- "Write the SIMPLEST possible solution—no abstractions unless 3+ use cases exist"
- "Implement this in the fewest files possible"
- "Prefer duplication over premature abstraction"
- "Follow YAGNI (You Aren't Gonna Need It) strictly"

**Why It Works:** AI models default to "textbook" solutions with layers of abstraction. Explicit simplicity constraints override this bias. Research shows 60% reduction in unnecessary files when simplicity is stated upfront.

**RPTC Integration:** Master Feature Planner uses KISS and YAGNI as core evaluation criteria in plan quality assessment.

---

#### 3. Context Injection ("Examine Existing Code")

**Technique:** Direct AI to study existing patterns before generating new code

**Example Prompts:**
- "First examine how authentication is handled in existing endpoints, then add auth to this new endpoint"
- "Read the existing user service before creating new user functionality"
- "What patterns exist for error handling in this codebase?"

**Why It Works:** AI generates generic "framework demo" code when lacking context. Examining existing code first ensures consistency and reuse. Research shows 75% reduction in redundant implementations when AI studies codebase first.

**RPTC Integration:** Research phase (`/rptc:research`) explicitly includes codebase exploration before planning. Master Research Agent searches for existing patterns.

---

#### 4. Audience Constraint ("Junior Developer Understanding")

**Technique:** Constrain AI to generate code understandable by less experienced developers

**Example Prompts:**
- "Write this so a junior developer can understand and maintain it"
- "Avoid clever tricks—optimize for readability, not brevity"
- "Explain complex logic with clear variable names, not comments"

**Why It Works:** AI often generates "clever" code with advanced language features. Junior developer constraint prioritizes clarity. Research shows 50% reduction in PR comments when code targets broader skill levels.

**RPTC Integration:** Code quality standards (via Master Efficiency Agent) prioritize readability and explicit over implicit.

---

### Pre-Generation Checklist (MUST Complete Before Accepting AI Code)

Before accepting AI-generated code, ALWAYS verify these conditions. Checking BEFORE integration prevents wasted refactoring effort.

**Purpose:** Catch over-engineering and complexity anti-patterns before they enter codebase

**Usage:** Review this checklist after AI generates code, BEFORE running implementation

---

#### Category 1: Simplicity Validation

- [ ] **Could this be done in fewer files?**
  - **Check:** Count files created by AI
  - **Threshold:** If >3 files for feature, ask: "Can this be consolidated?"
  - **Example:** AI creates `UserService.ts`, `UserRepository.ts`, `UserValidator.ts`, `UserMapper.ts` for simple CRUD → Consolidate to single `users.ts`
  - **Reference:** See architecture-patterns.md (SOP) - AI Complexity Anti-Patterns

- [ ] **Could this be done with less indirection?**
  - **Check:** Count abstraction layers (interfaces, base classes, wrappers)
  - **Threshold:** If >2 layers of indirection, ask: "What does each layer enable?"
  - **Example:** `Controller → Service → Repository → ORM → Database` = 4 layers; consider `Controller → Database queries` = 1 layer
  - **Reference:** See architecture-patterns.md (SOP) - Indirection Anti-Pattern

- [ ] **Does this use the simplest possible data structures?**
  - **Check:** Are custom classes/types needed, or could built-in structures work?
  - **Threshold:** If custom structure has <3 methods, use built-in (objects, arrays, maps)
  - **Example:** AI creates `UserCollection` class wrapping array → Use plain array with helper functions
  - **Reference:** YAGNI principle (CLAUDE.md)

- [ ] **Are all variables/functions clearly named without comments?**
  - **Check:** Can you understand code without reading comments?
  - **Threshold:** If >20% of lines are comments explaining logic, refactor for clarity
  - **Example:** `// Calculate user discount` + `const d = u.p * 0.1` → `const userDiscount = calculateUserDiscount(user)`
  - **Reference:** See languages-and-style.md (SOP) - AI Documentation Anti-Patterns

---

#### Category 2: Reuse Validation

- [ ] **Does this reuse existing code instead of duplicating?**
  - **Check:** Search codebase for similar functionality before accepting new implementation
  - **Threshold:** If >70% similar logic exists, refactor to shared function
  - **Example:** AI creates new date formatting function when `formatDate()` already exists in utils
  - **Reference:** DRY principle (CLAUDE.md)

- [ ] **Does this follow existing patterns in the codebase?**
  - **Check:** Compare AI-generated structure to existing similar features
  - **Threshold:** If structure diverges significantly, align with existing pattern
  - **Example:** Existing API uses `async/await`, AI generates `.then()` chains → Refactor to async/await
  - **Reference:** Consistency principle (architecture-patterns.md SOP)

- [ ] **Does this use existing libraries/frameworks instead of reinventing?**
  - **Check:** Review AI-generated utility functions against project dependencies
  - **Threshold:** If functionality exists in installed library, use library
  - **Example:** AI implements custom deep clone function when lodash.cloneDeep already available
  - **Reference:** Dependency management (CLAUDE.md)

- [ ] **Does this integrate with existing error handling patterns?**
  - **Check:** Verify AI uses same error handling approach as existing code
  - **Threshold:** All errors must follow project error handling pattern (custom errors, logging, etc.)
  - **Example:** AI uses generic `throw new Error()` when project has `ApplicationError` hierarchy
  - **Reference:** Error handling patterns (architecture-patterns.md SOP)

---

#### Category 3: Abstraction Justification

- [ ] **Are abstractions justified by 3+ actual (not hypothetical) use cases?**
  - **Check:** For each interface/base class/generic, count CURRENT use cases
  - **Threshold:** If <3 actual implementations, remove abstraction
  - **Example:** AI creates `IPaymentProvider` interface with 1 implementation (Stripe) → Remove interface, use Stripe directly until 3rd provider needed
  - **Reference:** See architecture-patterns.md (SOP) - Premature Abstraction Anti-Pattern

- [ ] **Do interfaces have multiple implementations RIGHT NOW?**
  - **Check:** Count classes implementing each interface
  - **Threshold:** If interface has 1 implementation, delete interface
  - **Example:** `interface UserRepository { ... }` with single class `PostgresUserRepository` → Delete interface, use concrete class
  - **Reference:** YAGNI principle (CLAUDE.md)

- [ ] **Are generics necessary, or could concrete types work?**
  - **Check:** Evaluate each generic type parameter—does it enable actual reuse?
  - **Threshold:** If generic has 1 type usage, replace with concrete type
  - **Example:** `class Service<T> { ... }` only used as `Service<User>` → Replace with `class UserService { ... }`
  - **Reference:** Simplicity over flexibility (KISS principle, CLAUDE.md)

- [ ] **Do design patterns solve actual problems, or add ceremony?**
  - **Check:** For each pattern (Factory, Strategy, Observer, etc.), identify specific problem it solves
  - **Threshold:** If pattern exists "for extensibility" without current need, remove
  - **Example:** AI creates Factory pattern for single object creation → Use direct instantiation
  - **Reference:** See architecture-patterns.md (SOP) - Unnecessary Pattern Usage

---

#### Category 4: Understandability Validation

- [ ] **Would a junior developer understand this in 5 minutes?**
  - **Check:** Read code without context—can you explain what it does?
  - **Threshold:** If requires >5 minutes to understand <100 lines, refactor for clarity
  - **Example:** Nested ternaries, dense one-liners, implicit dependencies → Extract to named functions
  - **Reference:** Readability principle (CLAUDE.md)

- [ ] **Is the code explicit rather than clever?**
  - **Check:** Identify "clever" tricks (advanced language features, obscure patterns)
  - **Threshold:** Prioritize clarity over brevity—no code golf
  - **Example:** `users.reduce((a,u)=>({...a,[u.id]:u}),{})` → `const usersById = createUserMap(users)` with clear helper
  - **Reference:** Explicit over implicit (CLAUDE.md)

- [ ] **Are dependencies obvious, not hidden via DI magic?**
  - **Check:** Can you trace dependencies without running code?
  - **Threshold:** Avoid framework magic that obscures what depends on what
  - **Example:** Constructor injection with 8 auto-injected services → Explicit imports of needed services
  - **Reference:** See architecture-patterns.md (SOP) - Dependency Clarity

- [ ] **Does it avoid framework-specific jargon unnecessarily?**
  - **Check:** Could this use simpler terms from language basics?
  - **Threshold:** Prefer language primitives over framework abstractions when equivalent
  - **Example:** Framework's "Pipe/Filter/Transform" system → Plain functions with `.map()`
  - **Reference:** Framework independence principle (architecture-patterns.md SOP)

---

### Red Flags (Reject AI Output Immediately)

If AI-generated code exhibits these patterns, REJECT and request simplification. These are stop signals indicating systematic AI biases.

**Purpose:** Catch problematic output before integration, saving refactoring effort

**Usage:** Scan generated code against these red flags. If ANY present, reject output and re-prompt with specific constraint.

---

#### Category 1: Complexity Red Flags

🚩 **More than 3 layers of indirection between request and data**
- **Detection:** Trace path from entry point (controller/route) to data (database/API)
- **Example:** `Controller → Service → Manager → Provider → Repository → ORM → Database` = 5 layers
- **Action:** REJECT. Request direct implementation: `Controller → Database`
- **Reference:** See architecture-patterns.md (SOP) - Indirection Anti-Pattern

🚩 **Manager/Provider/Handler class name proliferation**
- **Detection:** Count classes with these suffixes in AI output
- **Example:** `UserManager`, `UserProvider`, `UserHandler` all doing similar work
- **Action:** REJECT. Request consolidation to single class or functions
- **Reference:** See architecture-patterns.md (SOP) - Meaningless Naming Anti-Pattern

🚩 **Interfaces with single implementations**
- **Detection:** For each interface generated, count implementing classes
- **Example:** `interface IEmailService` with only `EmailService` implementation
- **Action:** REJECT interface. Use concrete class directly until 3+ implementations exist
- **Reference:** See architecture-patterns.md (SOP) - Premature Abstraction

🚩 **Factory patterns for objects with <3 variants**
- **Detection:** Count object types created by Factory
- **Example:** `UserFactory.create()` only creates `User` type
- **Action:** REJECT Factory. Use direct instantiation: `new User()`
- **Reference:** See architecture-patterns.md (SOP) - Unnecessary Pattern Usage

---

#### Category 2: Security Red Flags ⚠️ SAFETY-CRITICAL

🚩 **Missing authentication checks on new endpoints**
- **Detection:** All API routes MUST have auth middleware/decorator
- **Example:** `@app.route('/api/admin/users')` without `@require_auth`
- **Action:** BLOCK IMMEDIATELY. Add authentication before proceeding.
- **Reference:** See security-and-performance.md (SOP) - AI Security Verification Checklist

🚩 **Missing input validation/sanitization**
- **Detection:** All user inputs MUST be validated (type, format, range)
- **Example:** `const userId = req.params.id; db.query(userId)` without validation
- **Action:** BLOCK IMMEDIATELY. Add validation (Zod, Joi, Pydantic, etc.)
- **Reference:** See security-and-performance.md (SOP) - AI Security Verification Checklist

🚩 **SQL queries using string concatenation**
- **Detection:** Search for `+`, f-strings, template literals in SQL
- **Example:** `db.query(f"SELECT * FROM users WHERE id = {user_id}")`
- **Action:** BLOCK IMMEDIATELY. Use parameterized queries.
- **Reference:** See security-and-performance.md (SOP) - AI Security Verification Checklist

🚩 **Hardcoded credentials or API keys in code**
- **Detection:** Search for password/apiKey/secret variables with string literals
- **Example:** `const apiKey = "sk_live_abc123def456";`
- **Action:** BLOCK IMMEDIATELY. Move to `.env`, use environment variables.
- **Reference:** See security-and-performance.md (SOP) - AI Security Verification Checklist

---

#### Category 3: Over-Engineering Red Flags

🚩 **More than 5 files created for single feature**
- **Detection:** Count files in AI's proposed implementation
- **Example:** Feature needs `controller.ts`, `service.ts`, `repository.ts`, `validator.ts`, `mapper.ts`, `types.ts`, `constants.ts`
- **Action:** REJECT. Request consolidation to ≤3 files.
- **Reference:** See architecture-patterns.md (SOP) - AI Complexity Anti-Patterns

🚩 **Generic/reusable components with only 1 current use case**
- **Detection:** Search for generic type parameters, "Base" classes used once
- **Example:** `class BaseService<T>` only instantiated as `UserService extends BaseService<User>`
- **Action:** REJECT. Request concrete implementation until 3+ use cases.
- **Reference:** YAGNI principle (CLAUDE.md)

🚩 **Dependency injection frameworks for <10 classes**
- **Detection:** AI proposes DI container (InversifyJS, dependency-injector, etc.) for small app
- **Example:** 5-class application with full DI container setup
- **Action:** REJECT. Use explicit imports until complexity justifies DI.
- **Reference:** See architecture-patterns.md (SOP) - Premature Framework Adoption

🚩 **Configuration files with <5 settings**
- **Detection:** AI creates dedicated config system for few settings
- **Example:** Entire config module for 3 environment variables
- **Action:** REJECT. Use plain object or environment variables directly.
- **Reference:** See architecture-patterns.md (SOP) - Configuration Overengineering

---

#### Category 4: Testing & Documentation Red Flags

🚩 **Tests that mock everything except the function under test**
- **Detection:** Count mocks in test file—if >80% of dependencies mocked, suspect issue
- **Example:** Testing controller by mocking service, repository, validator, logger (testing glue code only)
- **Action:** REJECT. Request integration tests or refactor code to reduce dependencies.
- **Reference:** See testing-guide.md (SOP) - AI Test Anti-Patterns

🚩 **Tests with >5 setup lines per assertion**
- **Detection:** Ratio of arrange/act/assert—if arrange >5x assert, suspect brittleness
- **Example:** 30 lines of mock setup for 1-line assertion
- **Action:** REJECT. Request simpler test or refactor code under test.
- **Reference:** See testing-guide.md (SOP) - AI Test Anti-Patterns

🚩 **Comments explaining obvious code (over-commenting)**
- **Detection:** >20% of lines are comments explaining what code does
- **Example:** `counter++; // Increment counter by one`
- **Action:** REJECT comments. Request self-documenting code via better naming.
- **Reference:** See languages-and-style.md (SOP) - AI Documentation Anti-Patterns

🚩 **TODOs or FIXMEs in production code**
- **Detection:** Search for `TODO`, `FIXME`, `HACK`, `XXX` comments
- **Example:** `// TODO: add error handling` in production endpoint
- **Action:** REJECT. Complete implementation or file explicit issue.
- **Reference:** See git-and-deployment.md (SOP) - AI Commit Quality Standards

---

### When to Override These Guidelines

These guidelines prevent 80%+ of AI-generated complexity issues, but edge cases exist where overrides are justified. Override when:

**Performance-Critical Code:**
- Abstraction layers enable critical optimization (e.g., connection pooling, caching)
- Document: Why specific pattern required, performance benchmarks showing benefit

**Security-Critical Code:**
- Additional validation layers prevent critical vulnerabilities
- Document: Specific threat model, why each layer necessary

**Third-Party Integration:**
- Framework/library requires specific patterns (DI, factories, etc.)
- Document: Framework requirement reference, link to official docs

**Team Consensus:**
- Architectural Decision Record (ADR) documents pattern decision
- Document: ADR reference, team decision date, rationale

**How to Document Overrides:**
- In code: Comment with rationale: `// Override: Using Factory pattern per ADR-023 for plugin extensibility`
- In `.rptc/`: Create decision log: `.rptc/decisions/[feature]-architecture.md`

---

### SOP Reference Guide (Detailed Guidance)

This section provides quick links to enhanced SOPs. Use these for detailed guidance on specific topics.

**Comprehensive Educational Resource**: For detailed research, extended examples, and educational content on AI coding best practices, see `docs/AI_CODING_BEST_PRACTICES.md`. This document complements the quick-reference checklists above with deeper analysis and citations.

**Quick Reference:**

| Topic | SOP Section | Step |
|-------|-------------|------|
| **Security blind spots** | security-and-performance.md → AI Security Verification Checklist | Step 2 |
| **Complexity anti-patterns** | architecture-patterns.md → AI Complexity Anti-Patterns | Step 3 |
| **Test anti-patterns** | testing-guide.md → AI Test Anti-Patterns | Step 5 |
| **Commit quality** | git-and-deployment.md → AI Commit Quality Standards | Step 6 |
| **Documentation anti-patterns** | languages-and-style.md → AI Documentation Anti-Patterns | Step 7 |

**SOP Resolution via Fallback Chain:**

SOPs are loaded in priority order (use `/rptc:admin:sop-check [name]` to verify):

1. **Project-specific:** `.rptc/sop/[name].md` (highest priority - your overrides)
2. **User global:** `~/.claude/global/sop/[name].md` (your personal defaults)
3. **Plugin default:** `${CLAUDE_PLUGIN_ROOT}/sop/[name].md` (RPTC defaults)

**When to Create Project-Specific SOPs:**
- Project has unique security requirements (e.g., healthcare compliance)
- Team uses non-standard patterns (document rationale in override)
- Framework imposes specific architecture (e.g., framework-mandated DI)

**How to Override:**
1. Copy plugin SOP: `cp ${CLAUDE_PLUGIN_ROOT}/sop/testing-guide.md .rptc/sop/testing-guide.md`
2. Add project-specific sections at top (preserving base content)
3. Document overrides with "## Project-Specific Overrides" header
4. Verify: `/rptc:admin:sop-check testing-guide` shows `.rptc/sop/` path

---

## Workflow Decision Tree

```text
Is it a bug fix?
  └─ Yes → /rptc:tdd "bug description" (skip research/plan)

Is it a simple feature in familiar code?
  └─ Yes → /rptc:plan "feature" (skip research)

Is it complex or unfamiliar?
  └─ Yes → /rptc:research "topic" → /rptc:plan → /rptc:tdd

Need context first?
  └─ /rptc:helper:catch-up-[quick|med|deep]

Need to update a plan?
  └─ /rptc:helper-update-plan "@plan.md"

Resuming previous work?
  └─ /rptc:helper-resume-plan "@plan.md"
```

## Context Helpers

### `/rptc:helper-catch-up-quick` (2 min)

- Project basics
- Recent commits
- Current branch status
- Use for: Quick questions, small fixes

### `/rptc:helper-catch-up-med` (5-10 min)

- Architecture understanding
- Recent history (15 commits)
- Existing research/plans
- Use for: Implementation work, code understanding

### `/rptc:helper-catch-up-deep` (15-30 min)

- Complete architecture analysis
- Full dependency analysis
- All documentation review
- Code pattern analysis
- Use for: Complex work, unfamiliar projects

## File Organization

### Your Project Structure

```text
your-project/
├── .rptc/                       # RPTC workspace
│   ├── CLAUDE.md                # This file - RPTC workflow instructions
│   ├── research/                # Active research findings
│   │   └── [topic].md
│   ├── plans/                   # Active/completed plans
│   │   └── [feature].md
│   ├── complete/                # Old plans (optional)
│   └── sop/                     # Project SOPs (optional overrides)
│       └── testing-guide.md     # Overrides plugin default
│
├── docs/                        # Permanent documentation
│   ├── architecture/            # Auto-created by Doc Specialist
│   ├── patterns/                # Auto-created by Doc Specialist
│   └── api/                     # Auto-created by Doc Specialist
│
├── .claude/
│   ├── settings.json            # Project settings
│   └── settings.local.json      # Local overrides (gitignored)
│
├── CLAUDE.md                    # Your project instructions (auto-includes RPTC reference)
└── src/                         # Your application code
```

**Project Root CLAUDE.md**: If you have a project root `CLAUDE.md`, the `/rptc:admin-init` command automatically adds an RPTC reference at the top, preserving your existing content below.

### Plugin Resources (Referenced, Not Copied)

The RPTC plugin provides these resources at the plugin root:

- **Commands**: `${CLAUDE_PLUGIN_ROOT}/commands/` - All `/rptc:*` commands
- **Agents**: `${CLAUDE_PLUGIN_ROOT}/agents/` - Master specialist agents
- **SOPs**: `${CLAUDE_PLUGIN_ROOT}/sop/` - Default SOPs (fallback)
- **Templates**: `${CLAUDE_PLUGIN_ROOT}/templates/` - Plan and research templates

### SOP Fallback Chain

SOPs are resolved in this order (highest priority first):

1. `.rptc/sop/[name].md` - Project-specific overrides
2. `~/.claude/global/sop/[name].md` - User global defaults
3. `${CLAUDE_PLUGIN_ROOT}/sop/[name].md` - Plugin defaults

Use `/rptc:admin-sop-check [name]` to verify which SOP will be loaded.

## Quality Standards

### Testing Requirements

- **Minimum coverage**: 80% overall, 100% critical paths
- **Test types**: Unit, Integration, E2E
- **Test-first**: ALWAYS write tests before implementation

### Code Quality

- No debug code (console.log, debugger) in commits
- No `.env` files committed
- Conventional commit messages required
- All tests must pass before commit

### Security

- Input validation required
- No secrets in code
- Authentication/authorization validated
- Security agent review for sensitive features

## Important Reminders

- **You are the decision maker** - Claude facilitates and executes
- **Always ask for permission** - Master agents require your approval
- **Explicit sign-offs required** - No assumptions, clear approvals
- **Plans are living documents** - Update with `/rptc:helper-update-plan`
- **Tests first, always** - Non-negotiable TDD principle
- **Quality gates matter** - Efficiency and Security reviews catch issues

## Example Complete Workflow

```bash
# 1. Start with context
> /rptc:helper-catch-up-med

# 2. Research phase
> /rptc:research "user authentication"
[Interactive Q&A, codebase exploration]
[Optional web research with approval]
[Present findings, get approval, save]

# 3. Planning phase
> /rptc:plan "@user-authentication.md"
[Create scaffold, clarifying questions]
[Get approval for Master Planner]
[Master Planner creates detailed plan]
[Review, approve, save]

# 4. TDD implementation
> /rptc:tdd "@user-authentication.md"
[Execute each step: RED → GREEN → REFACTOR]
[Get approval for Efficiency Agent]
[Get approval for Security Agent]
[Get approval for completion]

# 5. Commit & ship
> /rptc:commit pr
[Comprehensive verification]
[Create commit and PR]
[Workflow complete!]
```

---

**Remember**: This workflow puts YOU in control while leveraging Claude's capabilities as a collaborative partner and executor.
