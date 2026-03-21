# Timeline: Save Reading Position and History

![Reading Context Illustration](../../assets/media/en/reviewing-context.jpg)

> *Note: Some screenshots in this documentation may come from earlier versions of the interface, but the core layout and entry logic remain largely the same and can still serve as a useful visual reference.*

## Module Overview
The essence of incremental reading is to spread long material across multiple moments in time. Timeline is the context-recovery tool built specifically for that purpose. It records when you previously reviewed a note and, whenever possible, helps you return to roughly the same scroll position where you stopped reading last time.

If you often switch between multiple heavy tutorials or book excerpts and are tired of reopening a note only to search for where you left off, this page is for you.

## What Timeline does
Without Timeline, interrupting a reading session often means losing context. By recording both **reading progress (scroll percentage)** and **historical commit states**, Timeline dramatically reduces the cognitive cost of switching tasks.

With this mechanism, you can confidently split a ten-thousand-word article into ten short ten-minute reading sessions. The system keeps the anchor for every pause on your behalf.

## How do you view and use Timeline?
1. **Expand the timeline drawer**:
   - In the review-queue sidebar, select and open a tracked note.
   - Beneath that note item - or through the relevant quick action - a Timeline drawer can usually be expanded.
2. **Interpret the history**:
   - Inside the drawer, you will see each historical commit for that note, including the timestamp and the approximate place reached in the document (for example `45%`).
3. **Restore context**:
   - Click an older entry in the Timeline and the main editor will attempt to scroll back to the approximate position from that reading session. This makes it far easier to recover the surrounding context.

## When does Timeline record a new entry?
Timeline is not a high-frequency real-time log. It usually records state only when you perform an **explicit review action** on a note.
- After reading part of a note, if you run a `Review`, `Good`, `Hard`, or postponement action through the command or the UI, the system captures the current scroll position and stores it as a new Timeline record.

## Interface customization and settings
If Timeline takes up too much sidebar space, or you do not need scroll-position history, you can adjust it in the plugin settings under the `Notes` tab:
- **Show scroll percentage**: show or hide the numeric progress display.
- **Auto-expand Timeline**: decide whether clicking a note automatically expands its Timeline drawer.

## Common misconceptions
- **Expecting pixel-perfect restoration**: Timeline relies on document structure and scroll ratios. If you heavily rewrite the source note between two reading sessions, older records may shift and can only be treated as approximate references.
- **Underestimating cleanup risk**: Timeline history depends on underlying data files such as `review_commits.json`. If you delete those files while troubleshooting, the note's historical reading context will disappear as well.

---
**Related chapters:**
- [Managing the Note Review Queue](./queue-management.md)
- [Data, Sync & Backup](../advanced-and-faq/data-and-sync.md)
- [Note Review Overview](./index.md)
