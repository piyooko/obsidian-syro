# Changelog

## [0.0.8] - 2026-03-27

### New Features

-   Folder Tracking & Dynamic Tags: You can now set up auto-tracking for specific folders. You also have the option to set up rules that automatically bulk-apply specific tags to both existing and newly created markdown notes within those folders.
-   Sidebar Progress Toggle: Added a new switch in the settings so you can independently show or hide the reading progress indicator in the review sidebar.
-   File Path Tooltips: Hovering over a note in the sidebar can now display its relative path within your vault. You can toggle this feature on or off and customize the hover delay in your settings.

### Improvements

-   Smoother Folder Tracking UI: Polished the folder tracking menu with better text, improved spacing, and a more intuitive workflow for setting up auto-tags.
-   Refined "Safe Truncation" Settings: The settings panel for handling long-context truncation is now much clearer and more reliable to configure.
-   Cleaner Settings Menu: Removed the overly technical object-level debug tracking. This removes unnecessary clutter from your settings panel and keeps the plugin running lean.
-   Better Documentation: Updated and reorganized both the English and Chinese README files so the plugin's structure and instructions are much easier to follow.

### Bug Fixes

-   Tracking Logic Priority: Fixed an issue with note tracking resolution. Manual tracking will now reliably override folder-based rules, and legacy tag data will no longer interfere with your tracking results.
-   Tooltip Behavior: Fixed the sidebar file path tooltips so they correctly respect your custom hover delay settings before appearing.
-   Folder Tracking UI Tweaks: Squashed several minor visual bugs in the folder tracking menu, including incorrect button text, weird spacing, and minor interaction glitches.
-   Text & Display Consistency: Fixed various text inconsistencies between the sidebar and timeline, including keeping timeline titles in English and removing leftover internal placeholder text from the auto-tag button.

## [0.0.7] - 2026-03-26

-   Kept progress bar styling in settings while making deck options the only visibility toggle for review countdown bars.
-   Wired the review countdown bar to respect the configured color, warning color, height, and fill direction.
-   Released version `0.0.7` with aligned manifest, package, compatibility metadata, and release notes.

## [0.0.6] - 2026-03-25

-   Restored the async review sequencer contract so review actions no longer break the TypeScript test pipeline after the review-flow refactor.
-   Released version `0.0.6` with aligned manifest, package, and compatibility metadata for distribution.

## [0.0.5] - 2026-03-22

-   Fixed the sync progress toast so runtime status text uses locale keys instead of corrupted hard-coded strings.
-   Fixed the review session first-card render path so the front side appears on the initial screen without reopening or switching cards.
-   Added a reviewer-aligned mojibake audit script and kept the release repository file delta limited to the intended tracked additions.

## [0.0.4] - 2026-03-21

-   Removed the default Anki-cloze hotkeys from the shipped command metadata for community review compliance.
-   Replaced the custom folder suggester, legacy trash call, `localStorage` popover sizing, `navigator.platform`, and `new Function` interpolation with review-safe implementations.
-   Moved status bar due styling out of runtime style injection and into static CSS-driven presentation for the public release build.

## [0.0.3] - 2026-03-21

-   Finalized the plugin description for the initial community submission and aligned it across the repo, release metadata, and community submission.
-   Kept the first public release on `0.0.3` while replacing the unpublished short-description draft.

## [0.0.2] - 2026-03-21

-   Marked the release as desktop-only for the first community submission.
-   Removed package-lock duplication and aligned runtime date usage with Obsidian's exported `moment`.
-   Trimmed noisy production debug logs and moved modal inline styles into shared CSS utilities.

## [0.0.1] - 2026-03-12

-   Reframed the repository and public-facing documentation around the `Syro` identity.
-   Removed legacy donation links, outdated repository references, and inherited plugin branding from the main entry points.
-   Simplified the documentation site while the Syro docs are being rebuilt.
