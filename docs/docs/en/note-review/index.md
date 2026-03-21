# Note Review Overview

![Note Review Queue](../../assets/media/en/note-review-queue.jpg)

## Module Overview
The Note Review module is the core implementation of Syro's **Incremental Reading** workflow.

Unlike flashcard review, which tests small knowledge units, note review works at the level of **entire Markdown files**. When you are faced with long articles, read-later pages, or dense study material, it is often unrealistic to digest everything in one sitting. This module helps you break those long-range tasks apart, distribute them intelligently across future fragments of time, and gradually complete understanding and extraction through repeated passes.

## Core Workflow at a Glance
To implement incremental reading inside Obsidian, Syro provides a toolset built around the ideas of a queue and a preserved context:
- **Build a reading queue**: run the `Track` action on notes to hand them over to the underlying scheduling algorithm, such as WMS.
- **Allocate reading energy**: use the review-queue sidebar on the right, where the system ranks the notes most worth reading today.
- **Preserve reading state**: with the Timeline mechanism, the system records your scroll position when you interrupt reading so the next session can resume seamlessly.

## Chapter Navigation
To help you build orderly long-form reading habits, continue with the following detailed guides:

1. **[Managing the Note Review Queue](./queue-management.md)**
   - Learn how to add single notes or entire folders to the review system and remove them when needed.
   - Learn how to interpret the time-based groups in the sidebar interface (`Today`, `Overdue`, `Future`, and so on).
   - Learn how to influence the algorithm's ordering through tag filtering and priority so your most important domains always stay near the top.

2. **[Timeline: Save Reading Position and History](./timeline.md)**
   - Learn how the system captures the exact place where each reading session stops.
   - Learn how to use the history drawer to quickly recover earlier reading context and reduce the cognitive cost of task switching.

---
**Next step:**
If you want to bring your first article into the scheduling system right away, start with [Managing the Note Review Queue](./queue-management.md).
