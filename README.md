**English** | [中文文档](./docs/README_ZH.md)

**_Reshape Your Memory and Reading in Obsidian_**

> **Seamlessly integrate the scientific principles of Spaced Repetition and Incremental Reading into your plain-text knowledge base.**

<img width="2494" height="1036" alt="image" src="https://github.com/user-attachments/assets/08e782b0-3bad-4cbc-ab57-2f80e08af323" />

## Core Features

-   **Context-Aware Flashcards (No More "Island Effect")**
    Create flashcards directly inline using native Markdown (like `==highlights==` or `::`). When reviewing, if you forget a card, one click teleports you back to the exact paragraph in your original note. You memorize in the full context, not in isolated fragments. 

-   **Incremental Reading Queue**
    Toss dozens of heavy books, long web clips, or dense articles into the right-sidebar queue. Filter them by tags, and let the FSRS algorithm decide what you should read today. It breaks massive reading backlogs into stress-free daily micro-tasks.

-   **Timeline (Like "Git Commits" for Reading)**
    Read halfway and got tired? Just close it. Syro automatically saves your exact scroll percentage. Days later, when the article pops up again, click the Timeline to jump right back to where you left off. You can even leave a "commit message" to remind your future self of your thoughts.

-   **Modern UI & Advanced FSRS Algorithm**
    Built with a clean, modern interface that looks native to Obsidian (with Style Settings support coming). Under the hood, it’s powered by the cutting-edge **FSRS** algorithm to ensure you achieve maximum retention with minimum review time.


## When Your Knowledge Vault Becomes a Collection Graveyard

Many of us face a common dilemma: we meticulously collect a vast library of web pages, articles, and notes in Obsidian, only for these valuable resources to sink into oblivion after being saved. Traditional note-taking methods like passive re-reading and highlighting are often ineffective for long-term retention, trapping our knowledge bases in a "write-and-forget" cycle.

Syro aims to provide a solution. It is not designed to replace your existing note-taking habits, but to introduce the dimension of "time," transforming your static knowledge vault into a dynamic memory system that actively and intelligently helps you learn and remember.

## Who Is This For?

- *Digital Hoarders*: Turn your read-it-later graveyard into a daily digestible feed.
  
- *Students & Professionals*: Memorize complex terms in their original context, not in isolated Anki decks.
  
- *Zettelkasten Users*: Resurface fleeting notes naturally over time to build deeper connections.


##  Explore the Documentation

To dive deeper into Syro's potential, start with the documentation hub below. The English and Chinese documentation trees now mirror each other.

-    **[Syro Documentation Hub](./docs/docs/en/index.md)**
-    **[Core Concepts](./docs/docs/en/getting-started/introduction.md)**
-    **[5-Minute Quick Start](./docs/docs/en/getting-started/quick-start.md)**
-    **[Flashcards Overview](./docs/docs/en/flashcards/index.md)**
-    **[Note Review Overview](./docs/docs/en/note-review/index.md)**
-    **[Advanced & FAQ](./docs/docs/en/advanced-and-faq/data-and-sync.md)**

##  Installation Guide

### Via BRAT

If Syro is not yet available in the community store for your vault, install it via the `BRAT` plugin to get the latest published build promptly.

**Detailed Steps:**

1.  **Install BRAT**

    -   If you don't have BRAT installed, go to `Settings` > `Community plugins` > `Browse`.
    -   Search for `BRAT`, find `Obsidian42 - BRAT`, and click `Install`, then `Enable`.

2.  **Add Syro's Repository**

    -   Open the BRAT settings (`Settings` > `Community Plugins` > `BRAT`).
    -   Click the `Add Beta plugin` button.

3.  **Paste the Repository URL**

    -   In the prompt, paste this repository's URL:
        ```
        https://github.com/piyooko/obsidian-syro
        ```
    -   Then click `Add Plugin`. BRAT will automatically download the latest version of Syro.

4.  **Enable the Plugin**
    -   After BRAT finishes, go back to your `Settings` > `Community Plugins` list.
    -   Find `Syro` and toggle it on.

Syro is now installed and ready to use!

### Community Plugins Store

If Syro is available in the official Obsidian Community Plugins store, you can install it there directly by searching for `Syro`.

### Manual Installation (Alternative)

1.  Go to the [Releases](https://github.com/piyooko/obsidian-syro/releases) page of this repository and download `main.js`, `manifest.json`, and `styles.css` from the latest version.
2.  Create a new folder named `syro` inside your vault's `.obsidian/plugins/` directory.
3.  Copy the downloaded files into this new folder.
4.  Restart Obsidian and enable `Syro` in `Settings` > `Community Plugins`.

## Acknowledgements

Syro's development is deeply indebted to the open-source community and inspired by many outstanding projects. We extend our sincere gratitude and respect to the following projects and their contributors:

-   **[Obsidian](https://obsidian.md/)**: For creating this free, open, and privacy-focused plain-text ecosystem that makes everything possible.
-   **[Anki](https://apps.ankiweb.net/)**: A titan in the field of spaced repetition. We salute its role in popularizing active recall worldwide.
-   **[FSRS](https://github.com/open-spaced-repetition/fsrs4anki)**: For its outstanding open-source algorithm, which has significantly advanced the science of review scheduling.
-   **[Jarrett Ye (L-M-Sherlock)](https://github.com/L-M-Sherlock)**. For your pivotal role in developing the FSRS algorithm, and your tireless dedication to popularizing spaced repetition and advanced educational practices.
-   **[Obsidian Spaced Repetitions](https://github.com/st3v3nmw/obsidian-spaced-repetition)**: The original source of inspiration for this plugin. Thank you for bringing the spark of spaced repetition to the Obsidian community.

---

**License**: [MIT License](./LICENSE)

_(Disclosure: Most of Syro’s core features are available for free. Certain supporter-exclusive experimental features require CDK verification. The current version does not enforce an account system; the plugin may perform automatic or user-initiated online CDK validation, but it does not transmit core review data, note content, or any information unrelated to CDK verification to the cloud.)_
