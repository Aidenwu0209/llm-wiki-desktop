# Issue Drafts To Create

These are maintainer-reviewed issue drafts. They are not external user feedback, and they should not be presented as requests from real users unless maintainers later attach verified feedback.

## [P0] Run real PaddleOCR-VL-1.5 parse smoke

Labels: `p0`, `validation`, `parser`

Goal: Run a live PaddleOCR-VL-1.5 parse smoke with a maintainer-approved test document and publish a redacted report.

Acceptance criteria:

- Endpoint, model, and API key environment variable are documented without exposing secrets.
- The report states whether raw document bytes left the local machine.
- Generated artifacts are validated against the parser artifact contract.
- Private raw documents and unredacted outputs are not committed.

## [P0] Run ERNIE live evidence-answer smoke

Labels: `p0`, `validation`, `provider`

Goal: Run a live ERNIE evidence-answer smoke using synthetic or approved public evidence.

Acceptance criteria:

- `AI_STUDIO_API_KEY` setup is documented without exposing the key.
- The report distinguishes live response from mock or dry-run behavior.
- Evidence IDs and citations are checked.
- No private prompts, raw documents, or secrets are committed.

## [P0] Publish v0.1.0-rc1

Labels: `p0`, `release`

Goal: Prepare and publish the v0.1.0-rc1 release candidate materials.

Acceptance criteria:

- Release readiness checklist is complete.
- Known limitations are documented.
- Changelog has a v0.1.0-rc1 section.
- Artifacts are clearly marked as unsigned/local if signing is not complete.

## [P1] Add user feedback round 1

Labels: `p1`, `research`

Goal: Collect and summarize first-round user feedback without fabricating users or testimonials.

Acceptance criteria:

- Feedback source and consent boundaries are documented.
- Private user data is removed or summarized.
- Findings separate observed issues from maintainer interpretation.
- Follow-up issues are created for actionable items.

## [P1] Improve center reading workspace

Labels: `p1`, `ui`, `reading-workspace`

Goal: Improve the center reading workspace for source, concept, review, and proposal navigation.

Acceptance criteria:

- Reading context is easier to keep while navigating related files.
- Proposal-first writeback remains intact.
- Tests cover vault path resolution and preview behavior.
- UI screenshots are included if visible changes are made.

## [good first issue] Add FAQ for AI_STUDIO_API_KEY setup

Labels: `good first issue`, `docs`, `provider`

Goal: Add a short FAQ explaining how to configure `AI_STUDIO_API_KEY` for ERNIE provider checks.

Acceptance criteria:

- The FAQ says not to commit or paste the API key.
- It explains how to set the environment variable for local development.
- It links to provider setup docs if available.
- It avoids claiming a live check passed unless the contributor actually ran one.

## [good first issue] Add screenshot checklist for release notes

Labels: `good first issue`, `docs`, `release`

Goal: Add a release-note screenshot checklist that keeps private data out of public materials.

Acceptance criteria:

- Checklist covers private paths, raw documents, API keys, local usernames, and unpublished data.
- It references existing screenshot locations.
- It distinguishes demo screenshots from live user data.
