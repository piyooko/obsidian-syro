# Core Concepts: Spaced Repetition and Incremental Reading

In the practice of digital note-taking and personal knowledge management (PKM), Obsidian has become a powerful platform for building knowledge bases thanks to its local-first design, plain-text foundations, and bidirectional links. Yet as the amount of information in a vault keeps growing, many users run into a familiar problem: once something is captured, it is forgotten. Carefully clipped articles, fleeting inspirations, and deeper lines of thought often sink back into the graph after being written down.

Syro was created to introduce a "time dimension" into Obsidian's otherwise static text graph. By integrating **Spaced Repetition** and **Incremental Reading**, two widely validated cognitive techniques, it helps users build a dynamic workflow that can actively schedule review and fight forgetting.

---

## Spaced Repetition: The Scientific Basis for Fighting Forgetting

**Spaced repetition** is not a new technology. It grows out of the *Testing Effect* and the *Spacing Effect* in cognitive psychology. By prompting active retrieval near the edge of the forgetting curve, it strengthens long-term memory with remarkable efficiency.

In this field, **Anki** is undoubtedly one of the most widely used and successful landmark tools. Through extremely atomic card design, it has helped countless learners - especially medical students and language learners - tackle huge bodies of hard knowledge.

### Why introduce spaced repetition into Obsidian?

Even though standalone spaced-repetition software such as Anki is extraordinarily efficient at memory retrieval, some users run into an "island effect" when working with highly structured personal notes:
- To optimize test efficiency, traditional flashcards usually strip knowledge points down to their smallest form and remove them from context. During review, that can sometimes break the internal logic between ideas. If you have forgotten the original background, an isolated card can feel confusing.

Syro takes a complementary path: **it preserves structure and context in place**.
In Syro's workflow, your flashcards - whether Q/A or cloze - are embedded directly inside long-form Markdown notes. When you struggle with a card, you do not need to switch tools. You can reopen the surrounding text at any time, read the full paragraph above or below the card, and even jump through backlinks to related topics. This review experience, grounded in the source text itself, helps you avoid rote memorization while rebuilding the deeper connections behind the knowledge.

---

## Incremental Reading: Reshaping How Long-Form Material Gets Digested

**Incremental Reading** is a revolutionary learning method proposed by Piotr Wozniak, the founder of **SuperMemo** and one of the pioneers of spaced repetition. It extends the logic of spaced repetition beyond card review into the full process of reading and learning.

Its core idea is simple: instead of trying to finish and fully understand a long piece of material in a single pass, you bring it into the system and let the algorithm split it across multiple moments in the future. Over repeated short encounters, you read, highlight, extract, and eventually turn the material into testable cards.

### How incremental reading works, and why it matters

SuperMemo demonstrated how powerful incremental reading can be when dealing with large amounts of complex information. Syro borrows that idea and provides a foundational implementation inside Obsidian:

1. **Manage cognitive load and sustain learning momentum**
   When facing dozens of pages of dense literature, people easily become intimidated or lose focus. Incremental reading lets you move across multiple topics in parallel. When you grow tired of the current material, you can stop at any time. The algorithm remembers your progress, and you can move seamlessly to the next article that interests you. That kind of on-demand switching helps keep the brain in a more effective state for absorption.
2. **Let meta-memory mature and improve card quality**
   On a first read, we often lack a global view and treat everything as equally important. Incremental reading encourages **delayed processing**: weeks later, when an excerpt resurfaces in the queue, you are in a better position to judge whether it is truly worth turning into a flashcard. This prevents the system from filling up with large numbers of low-quality, redundant cards.
3. **Spark cross-disciplinary associations**
   Because the review queue is generated dynamically by the algorithm, you may read computer science, history, and psychology on the same day. That high degree of interleaving and unpredictability creates opportunities for the brain to cross disciplinary boundaries and form unexpected semantic links.

---

## Syro's Design Vision

Syro is not meant to replace Anki or SuperMemo outright. Those outstanding tools still have unmatched strengths in their own specialized domains, such as very high card throughput or extremely granular incremental decomposition.

Syro's vision is this: **inside Obsidian's open, free, plain-text ecosystem, provide knowledge workers with a built-in engine that makes reading, thinking, and remembering flow together naturally.**

By combining underlying scheduling algorithms such as FSRS with your everyday writing flow, Syro aims to help you:
- eliminate the decision fatigue of "what should I read today?" and "what should I review today?"
- keep high-value notes and ideas resurfacing instead of fading into silence
- consolidate memory with as little friction as possible while preserving full knowledge context

If you are ready to experience a learning workflow that combines active retrieval with incremental scheduling, continue to the [5-Minute Quick Start](./quick-start.md).
