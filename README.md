**English** | [中文文档](./docs/README_ZH.md)  

***Reshape Your Memory and Reading in Obsidian***

> **Seamlessly integrate the scientific principles of Spaced Repetition and Incremental Reading into your plain-text knowledge base.**

## When Your Knowledge Vault Becomes a Collection Graveyard

Many of us face a common dilemma: we meticulously collect a vast library of web pages, articles, and notes in Obsidian, only for these valuable resources to sink into oblivion after being saved. Traditional note-taking methods like passive re-reading and highlighting are often ineffective for long-term retention, trapping our knowledge bases in a "write-and-forget" cycle.

Syro aims to provide a solution. It is not designed to replace your existing note-taking habits, but to introduce the dimension of "time," transforming your static knowledge vault into a dynamic memory system that actively and intelligently helps you learn and remember.

## Who Is This For?
Syro's core mechanics—Spaced Repetition and Incremental Reading—are especially suited for the following types of Obsidian users:

-   **Digital Hoarders Battling the "Collector's Fallacy"**
    For those who have clipped a massive amount of content but lack the capacity to read it all, Syro's Incremental Reading feature breaks down overwhelming backlogs into daily, digestible micro-tasks. The algorithm periodically brings this content to the surface, helping you transform a static "digital filing cabinet" into a dynamic stream of absorbed knowledge.

-   **Practitioners of Zettelkasten and Evergreen Notes**
    Syro allows knowledge to grow and mature over time. The algorithm periodically resurfaces your fleeting ideas and half-formed draft notes, encouraging you to refine, elaborate, and form new connections over multiple encounters. This facilitates a process of "incremental thinking" and "incremental writing."

-   **Creative Workers Seeking Interdisciplinary Sparks**
    By facilitating interleaved learning across different topics and notes, Syro can help generate unexpected semantic connections. This "neuro-creativity" fosters an environment ripe for breakthroughs and deep insights when tackling complex problems.

-   **Professionals and Students Tackling Complex Knowledge**
    When facing dense subjects, Syro allows you to turn essential terminology, formulas, and core definitions into flashcards. Train these concepts to the point of automatic recall, freeing up valuable cognitive resources for higher-order reasoning and conceptual integration.

-   **Implementers Who Need "Programmable Attention"**
    The system takes over the tedious task of review scheduling, eliminating the "what should I study today?" decision fatigue. It acts like a "cron job for your brain," generating a scientifically-backed set of micro-tasks each day, allowing you to efficiently combat forgetting simply by following its lead.

## 🌟 Core Features

-   **Contextual Flashcards**
    Create flashcards directly within your notes using natural Markdown syntax (e.g., `==highlighting==` or `::`). If you forget an answer during review, you can instantly jump back to the original source. This **helps you** memorize in full context, rather than relying on isolated rote learning.

-   **Incremental Reading**
    Add long-form articles or notes to a review queue. The algorithm intelligently breaks them down for future reading sessions. A Timeline feature tracks your reading position, enabling **effortless, pressure-free, long-term learning**.

-   **Advanced Scheduling Algorithm**
    Powered by the cutting-edge **FSRS** (Free Spaced Repetition Scheduler) algorithm. Compared to traditional algorithms, it more accurately predicts your forgetting curve, **aiming to** achieve higher retention with fewer reviews.

-   **Local-First and Secure**
    Built on the Obsidian philosophy. All review data is stored securely in plain-text JSON files within your local vault. Your knowledge remains yours, and yours alone.

## 📖 Explore the Documentation

To dive deeper into Syro's potential, start with the documentation hub below. The English and Chinese documentation trees now mirror each other.

-   🏠 **[Syro Documentation Hub](./docs/docs/en/index.md)**
-   📦 **[Core Concepts](./docs/docs/en/getting-started/introduction.md)**
-   🚀 **[5-Minute Quick Start](./docs/docs/en/getting-started/quick-start.md)**
-   🧠 **[Flashcards Overview](./docs/docs/en/flashcards/index.md)**
-   📚 **[Note Review Overview](./docs/docs/en/note-review/index.md)**
-   ⚙️ **[Advanced & FAQ](./docs/docs/en/advanced-and-faq/data-and-sync.md)**
-   🇨🇳 **[Chinese Documentation Hub](./docs/docs/zh/index.md)**

## ⬇️ Installation Guide

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
        piyooko/obsidian-syro
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
-   A special acknowledgement goes to **[Jarrett Ye (L-M-Sherlock)](https://github.com/L-M-Sherlock)**. Thank you, not only as a core contributor to the FSRS algorithm, but also as a passionate evangelist for the popularization of spaced repetition and advanced educational concepts.
-   **[Obsidian Spaced Repetitions](https://github.com/st3v3nmw/obsidian-spaced-repetition)**: The original source of inspiration for this plugin. Thank you for bringing the spark of spaced repetition to the Obsidian community.
-   **[Obsidian Smart Connections](https://github.com/brianpetro/obsidian-smart-connections)**: Its excellent engineering architecture and innovative ideas provided invaluable inspiration when exploring the integration of AI with local knowledge bases.

---
**License**: [MIT License](./LICENSE) 

 *(Disclosure: Most of Syro’s core features are available for free. Certain supporter-exclusive experimental features require CDK verification. The current version does not enforce an account system; the plugin may perform automatic or user-initiated online CDK validation, but it does not transmit core review data, note content, or any information unrelated to CDK verification to the cloud.)*
