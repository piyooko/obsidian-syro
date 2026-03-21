# Managing the Note Review Queue

![Review Queue Sidebar](../../assets/media/en/note-review-queue.jpg)

## Module Overview
The power of incremental reading lies in the system's ability to pull out the few pieces that are most worth reading today from a sea of material. This page explains how to track notes, how to read the queue sidebar on the right, and how to reshape your reading order through tags and priority.

If you need to distribute attention across multiple long texts, or want to pin material from a particular domain near the top, this guide is the place to start.

## 1. Add material to the schedule, and remove it again
The system does not automatically grab every file in your vault. You must explicitly authorize it through the **Track** action:
- **Track in place**: while reading a note, run `Syro: Track this note`, or choose the equivalent right-click action.
- **Track in bulk**: right-click a folder in the file tree and choose the action that tracks every note inside that directory.
- If a note is no longer worth keeping in the schedule, run **Untrack** to remove it from the queue. This never deletes the underlying local file.

## 2. Read the queue sidebar
Run `Syro: Open Notes Review Queue in sidebar` to open the queue interface. The algorithm groups candidate notes into collapsible time-based sections:
- **New**: newly tracked material that has not been meaningfully read yet.
- **Overdue**: tasks that were missed or set aside earlier. There is no need to panic - you can pick them up again at any time.
- **Today**: the notes the algorithm believes are most suitable for you to revisit today.
- *(Click any item in the sidebar to open the original note in the main editor and continue reading.)*

## 3. Shape your reading focus with tags and priority
When your queue grows too large, you can influence the algorithm's ordering in two ways:

- **Tag filtering**:
  Select a specific tag in the filter bar at the top of the sidebar (for example `#psychology`) and the queue instantly narrows down to material in that topic. You can also configure **Ignored Tags** in the plugin settings so notes with tags such as `#draft` are permanently excluded from view.

- **Priority**:
  When several notes are due on the same day, which one should surface first? Click the priority-edit button on a note item and assign it a higher number, such as `80` or `100`. High-priority notes gain the algorithmic privilege of cutting the line, ensuring that high-value material captures your attention first.

*(Important: after you finish reading, remember to perform a `Review` or `Advance` action on the note. This removes it from today's queue and lets the algorithm assign the next revisit date.)*

---
**Related chapter:**
- [Timeline: Save Reading Position and History](./timeline.md)
