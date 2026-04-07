import { RPITEMTYPE } from "src/dataStore/repetitionItem";
import { TrackedFile, TrackedItem } from "src/dataStore/trackedFile";
import { CardType } from "src/Question";
import { DEFAULT_SETTINGS, syncDefaultClozePatterns } from "src/settings";

test("verify syncNoteCardsIndex returns removedIds correctly", () => {
    const tf = new TrackedFile("plugin_test/final-test.md", RPITEMTYPE.CARD, "testDeck");
    const settings = { ...DEFAULT_SETTINGS };
    const content = ["Card A::Answer A", "Card B::Answer B", "Card C::Answer C"].join("\n");

    const res1 = tf.syncNoteCardsIndex(content, settings);

    expect(res1.hasChange).toBe(true);
    expect(tf.trackedItems).toBeDefined();
    expect(tf.trackedItems?.length).toBe(3);

    tf.trackedItems?.forEach((card, index) => {
        card.reviewId = 1001 + index;
    });

    const removedContent = content.replace("Card B::Answer B\n", "");
    const res2 = tf.syncNoteCardsIndex(removedContent, settings);

    expect(res2.hasChange).toBe(true);
    expect(res2.removedIds).toContain(1002);
    expect(tf.trackedItems?.length).toBe(2);
});

test("syncNoteCardsIndex keeps plain curly clozes separate from Anki clozes", () => {
    const tf = new TrackedFile("plugin_test/final-test.md", RPITEMTYPE.CARD, "testDeck");
    const settings = {
        ...DEFAULT_SETTINGS,
        convertCurlyBracketsToClozes: true,
        convertAnkiClozesToClozes: true,
    };
    syncDefaultClozePatterns(settings);

    const content = "{{plain}} {{c1::anki}}";
    const res1 = tf.syncNoteCardsIndex(content, settings);

    expect(res1.hasChange).toBe(true);
    expect(tf.trackedItems?.map((item) => item.clozeId)).toEqual(["c1_l0", "cb0"]);

    tf.trackedItems?.forEach((card, index) => {
        card.reviewId = 2001 + index;
    });

    const removedContent = "{{c1::anki}}";
    const res2 = tf.syncNoteCardsIndex(removedContent, settings);

    expect(res2.hasChange).toBe(true);
    expect(res2.removedIds).toContain(2002);
    expect(tf.trackedItems?.map((item) => item.clozeId)).toEqual(["c1_l0"]);
    expect(tf.trackedItems?.[0].reviewId).toBe(2001);
});

test("syncNoteCardsIndex groups same-line Anki clozes into one tracked item", () => {
    const tf = new TrackedFile("plugin_test/final-test.md", RPITEMTYPE.CARD, "testDeck");
    const settings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
    };
    syncDefaultClozePatterns(settings);

    const content = "{{c1::Front Punch}} and {{c1::Light Punch}}";
    tf.syncNoteCardsIndex(content, settings);

    expect(tf.trackedItems).toHaveLength(1);
    expect(tf.trackedItems?.[0].clozeId).toBe("c1_l0");
    expect(tf.trackedItems?.[0].fingerprint).toBe("Front Punch||Light Punch");
});

test("syncNoteCardsIndex splits same-number Anki clozes across list lines", () => {
    const tf = new TrackedFile("plugin_test/final-test.md", RPITEMTYPE.CARD, "testDeck");
    const settings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
    };
    syncDefaultClozePatterns(settings);

    const content = ["- {{c1::Down}}", "- {{c1::Amplify}}"].join("\n");
    tf.syncNoteCardsIndex(content, settings);

    expect(tf.trackedItems?.map((item) => [item.clozeId, item.lineNo])).toEqual([
        ["c1_l0", 0],
        ["c1_l1", 1],
    ]);
});

test("syncNoteCardsIndex creates one tracked item per Anki table row group", () => {
    const tf = new TrackedFile("plugin_test/final-test.md", RPITEMTYPE.CARD, "testDeck");
    const settings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
    };
    syncDefaultClozePatterns(settings);

    const content = [
        "| Input | English | Chinese |",
        "| --- | --- | --- |",
        "| 1 | {{c1::Front Punch}} | {{c1::Light Punch}} |",
        "| 2 | {{c1::Back Punch}} | Back |",
    ].join("\n");
    tf.syncNoteCardsIndex(content, settings);

    expect(tf.trackedItems?.map((item) => [item.clozeId, item.lineNo, item.fingerprint])).toEqual([
        ["c1_l2", 2, "Front Punch||Light Punch"],
        ["c1_l3", 3, "Back Punch"],
    ]);
});

test("syncNoteCardsIndex preserves a legacy unsuffixed Anki review id on migration", () => {
    const tf = new TrackedFile("plugin_test/final-test.md", RPITEMTYPE.CARD, "testDeck");
    const settings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
    };
    syncDefaultClozePatterns(settings);

    const legacyContent = "{{c1::Down}}";
    tf.syncNoteCardsIndex(legacyContent, settings);
    expect(tf.trackedItems).toHaveLength(1);

    if (!tf.trackedItems) {
        throw new Error("missing tracked items");
    }

    tf.trackedItems[0].clozeId = "c1";
    tf.trackedItems[0].reviewId = 3001;
    tf.trackedItems[0].lineNo = 0;

    const res = tf.syncNoteCardsIndex(legacyContent, settings);

    expect(res.removedIds).toEqual([]);
    expect(tf.trackedItems).toHaveLength(1);
    expect(tf.trackedItems?.[0].clozeId).toBe("c1_l0");
    expect(tf.trackedItems?.[0].reviewId).toBe(3001);
});

test("syncNoteCardsIndex keeps one legacy review id when old same-line Anki holes collapse into one card", () => {
    const tf = new TrackedFile("plugin_test/final-test.md", RPITEMTYPE.CARD, "testDeck");
    const settings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
    };
    syncDefaultClozePatterns(settings);

    tf.trackedItems = [
        new TrackedItem(
            "Front Punch",
            0,
            " and ",
            CardType.Cloze,
            { startOffset: 0, endOffset: 11, blockStartOffset: 0, blockEndOffset: 40 },
            "c1",
            4001,
        ),
        new TrackedItem(
            "Light Punch",
            0,
            "{{c1::Front Punch}} and ",
            CardType.Cloze,
            { startOffset: 20, endOffset: 31, blockStartOffset: 0, blockEndOffset: 40 },
            "c1",
            4002,
        ),
    ];

    const res = tf.syncNoteCardsIndex("{{c1::Front Punch}} and {{c1::Light Punch}}", settings);

    expect(tf.trackedItems).toHaveLength(1);
    expect(tf.trackedItems?.[0].clozeId).toBe("c1_l0");
    expect([4001, 4002]).toContain(tf.trackedItems?.[0].reviewId);
    expect(res.removedIds).toHaveLength(1);
});
