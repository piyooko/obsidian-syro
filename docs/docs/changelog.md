# Changelog

## [0.0.5] - 2026-03-22

- Fixed the sync progress toast so runtime status text uses locale keys instead of corrupted hard-coded strings.
- Fixed the review session first-card render path so the front side appears on the initial screen without reopening or switching cards.
- Added a reviewer-aligned mojibake audit script and kept the release repository file delta limited to the intended tracked additions.

## [0.0.4] - 2026-03-21

- Removed the default Anki-cloze hotkeys from the shipped command metadata for community review compliance.
- Replaced the custom folder suggester, legacy trash call, `localStorage` popover sizing, `navigator.platform`, and `new Function` interpolation with review-safe implementations.
- Moved status bar due styling out of runtime style injection and into static CSS-driven presentation for the public release build.

## [0.0.3] - 2026-03-21

- Finalized the plugin description for the initial community submission and aligned it across the repo, release metadata, and community submission.
- Kept the first public release on `0.0.3` while replacing the unpublished short-description draft.

## [0.0.2] - 2026-03-21

- Marked the release as desktop-only for the first community submission.
- Removed package-lock duplication and aligned runtime date usage with Obsidian's exported `moment`.
- Trimmed noisy production debug logs and moved modal inline styles into shared CSS utilities.

## [0.0.1] - 2026-03-12

- Reframed the repository and public-facing documentation around the `Syro` identity.
- Removed legacy donation links, outdated repository references, and inherited plugin branding from the main entry points.
- Simplified the documentation site while the Syro docs are being rebuilt.
