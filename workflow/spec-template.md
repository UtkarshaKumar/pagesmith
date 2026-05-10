# Feature Title
<!-- Replace with the name of the feature/bug/refactor -->

branch: feature/your-branch-name
<!-- Optional: override the auto-generated branch name -->

---

## Summary
<!-- 2-4 sentences describing what this does and why. -->
<!-- This becomes the PR description. -->

What we're building:
-
-
-

## Context & Motivation
<!-- Why is this needed? What problem does it solve? -->
<!-- Include links to tickets, ADRs, or prior discussions. -->

Related: <!-- Jira/GitHub issue URL -->

---

## Acceptance Criteria
<!-- These are the gates the Reviewer will check against. -->
<!-- Be specific and testable. -->

- [ ] AC-01:
- [ ] AC-02:
- [ ] AC-03:
- [ ] AC-04: (non-functional) Performance: <!-- e.g., P95 < 200ms under load -->
- [ ] AC-05: (non-functional) Security: <!-- e.g., no new CVEs, all inputs validated -->

---

## Out of Scope
<!-- What this spec explicitly does NOT cover. -->
<!-- Prevents scope creep and keeps reviewers focused. -->

-
-

---

## Technical Design
<!-- Optional — fill in if you have constraints or a preferred approach. -->
<!-- Leave blank to let Builder propose the design. -->

### Architecture notes
<!-- e.g., "Use existing UserRepository, don't add a new service" -->

### Data model changes
<!-- Tables, fields, migrations needed -->

### API changes
<!-- New endpoints, changed contracts, OpenAPI fragments -->

### Key files expected to change
<!-- List files if known; leave blank for Builder to determine -->

---

## Test Plan
<!-- Builder writes tests first (TDD). List the scenarios. -->
<!-- Reviewer checks these are covered. -->

### Unit tests
- [ ]
- [ ]

### Integration tests
- [ ]
- [ ]

### Edge cases to test
- [ ] Empty/null inputs
- [ ] Concurrency (if applicable)
- [ ] Error paths (DB down, external API failure, etc.)
- [ ]

### What we are NOT testing here
<!-- e.g., E2E flows tested by QA, infra tested in a separate PR -->

---

## Quality Gate Configuration
<!-- Override defaults for this spec. Remove lines to use project defaults. -->

<!-- gates_override:
  format: true
  lint: true
  typecheck: true
  tests: true
  coverage: true
  coverage_threshold: 85
  security: true
  plankton: false
-->

---

## Non-Functional Requirements
<!-- Performance, accessibility, security, observability -->

| NFR | Requirement |
|-----|-------------|
| Performance | <!-- e.g., no new N+1 queries --> |
| Security | <!-- e.g., all user inputs sanitised --> |
| Observability | <!-- e.g., add structured log for key events --> |
| Accessibility | <!-- e.g., WCAG 2.1 AA for new UI --> |

---

## Definition of Done
<!-- What "DONE" means for this feature beyond code review. -->

- [ ] All acceptance criteria met
- [ ] All quality gates pass
- [ ] Reviewer verdict: PASS
- [ ] PR description complete
- [ ] No new TODOs left in code
- [ ] CLAUDE.md updated if new conventions introduced

---

<!-- ═══════════════════════════════════════════════════
  STACKED PR MODE — delete this section for single PRs
═══════════════════════════════════════════════════ -->

## Stacked PR Stack
<!-- Define layers when work is too large for a single PR. -->
<!-- Run with: ./orchestrate.sh spec.md --stack -->

stack:
  - layer: data-layer
    description: Schema, migrations, repository layer
    branch: feature/your-branch-data
  - layer: service-layer
    description: Business logic and orchestration
    branch: feature/your-branch-service
  - layer: api-layer
    description: Controllers, DTOs, route registration
    branch: feature/your-branch-api
  - layer: ui-layer
    description: Frontend components and hooks
    branch: feature/your-branch-ui

### Layer: data-layer
<!-- Requirements scoped to this layer only -->
- [ ]
- [ ]

### Layer: service-layer
<!-- Requirements scoped to this layer only -->
- [ ]
- [ ]

### Layer: api-layer
<!-- Requirements scoped to this layer only -->
- [ ]
- [ ]

### Layer: ui-layer
<!-- Requirements scoped to this layer only -->
- [ ]
- [ ]
