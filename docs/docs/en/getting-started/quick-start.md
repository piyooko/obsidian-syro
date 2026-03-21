# 5-Minute Quick Start

> *Note: This page walks you through the smallest complete Syro workflow. We strongly recommend performing the steps once in your own vault - it is far more effective than reading any long manual.*

## Module Overview
When a plugin is feature-rich, the best way to learn it is to begin with the simplest possible closed loop. This page shows you how, in roughly five minutes, to bring a normal Obsidian note into the review system and complete your very first active-recall session.

## Step 1: Track your first note (incremental reading)
If you have an article or note that you want to read over time:
1. Open a note in Obsidian that you want to study.
2. Open the **Command Palette** (usually `Ctrl/Cmd + P`), search for `Syro: Track this note`, and run it.
3. Search for `Syro: Open Notes Review Queue in sidebar` and run it.
4. You should now see the note inside the right sidebar under sections such as `Today` or `New`. It has successfully entered your incremental-reading queue.

## Step 2: Create your first flashcard (knowledge extraction)
Now let us extract a specific knowledge point from that note:
1. **Create a Q/A card**: in a blank area of the note, type a question, separate it with `::`, and then type the answer.
   *Example: `What is Obsidian's core philosophy?:: It is a local-first knowledge base built on plain text.`*
2. **Create a cloze card**: highlight an important phrase in the note using Obsidian's built-in syntax `==text==`.
   *Example: `Syro is a review plugin built on the ==spaced repetition== model.`*

## Step 3: Launch your first review session
Once the card is ready, let us test the brain's retrieval ability:
1. In the Command Palette, run `Syro: Review flashcards in this note`.
2. A review screen will appear. You will see the question you just wrote, or the highlighted phrase with its key part hidden.
3. **Recall the answer in your head**, then press the `Space` key or click `Show Answer`.
4. Based on how easily you recalled it, click `Again`, `Hard`, `Good`, or `Easy`.

**Congratulations!** You have now completed Syro's core loop end to end. The scheduling algorithm has recorded your feedback and arranged the next review time for both the note and the cards you just created.

## Suggested entry points for daily use
To make everyday use easier, you can quickly enter Syro through the following places:
- **Status Bar**: the bottom-right corner of the Obsidian window usually shows the number of notes and flashcards waiting for review. Click it to jump in quickly.
- **Context Menu**: right-click a file in the file list, or the current note tab, to quickly track or untrack it.

---
**Explore more workflows:**
- If you want to learn more card-authoring syntax, continue to [Elegant Flashcard Authoring](../flashcards/card-authoring.md).
- If you want to learn how to manage long-form reading queues, continue to [Managing the Note Review Queue](../note-review/queue-management.md).
