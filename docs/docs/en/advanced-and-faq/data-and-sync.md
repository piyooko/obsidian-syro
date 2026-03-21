# Data, Sync & Backup

## Module Overview
As a plugin deeply aligned with Obsidian's local-first philosophy, Syro will never upload your learning data to a closed cloud service. This page explains, transparently, where scheduling data is stored, how the system captures text changes, and how to back it up or migrate it safely.

If you sync across devices, or are curious about how the system remembers review progress, start here.

## 1. Sync mechanism: how does the system keep up with you?
Obsidian gives users a great deal of freedom in file operations. To make sure review cards stay aligned with their original text, Syro provides a robust sync strategy:
- **Automatic incremental sync**: this is the default and recommended mode. When you edit a flashcard, add a new cloze, or change tags, the system silently computes those small differences in the background and updates the review database in real time. Most of the time, you barely notice it.
- **Manual full rebuild (`Rebuild Cache`)**: if you batch-edit hundreds of files with external scripts, or pull a large number of files on another device through iCloud, Syncthing, or a similar tool, automatic sync may miss changes. In that case, run `Syro: Rebuild Cache` from the Command Palette to force a full scan and realignment.

## 2. Storage model: where is your data?
All of Syro's scheduling state is stored safely as plain-text JSON inside your local plugin directory, specifically under `.obsidian/plugins/syro/`.
The core files include:
- `tracked_files.json`: the main data file that stores parsed flashcard results, FSRS scheduling state, and note-tracking state.
- `review_notes.json` / `review_commits.json`: separate files that store Timeline history and reading context for the note-review queue.
- *(You may also see temporary files with the `.overlay` suffix. These are incremental cache layers used to avoid write conflicts and speed up updates to large files. They are normal.)*

## 3. Backup and multi-device migration
Because all data is stored strictly inside your Obsidian vault:
- **Normal backup**: as long as you back up the entire hidden `.obsidian` folder, all of Syro's learning progress, card ratings, and scheduling state will be preserved.
- **Multi-device use**: if you rely on Obsidian Sync or third-party sync tools such as Git or OneDrive, make sure your sync rules **do not exclude** the JSON files under `.obsidian/plugins/syro/`. Otherwise, your review progress will not roam between desktop and mobile.

*Tip: before making any manual edits to the underlying JSON files, always copy the folder first as a safety backup.*

---
**Related chapter:**
- [FAQ & Troubleshooting](./faq-troubleshooting.md)
