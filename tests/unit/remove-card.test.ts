import { RPITEMTYPE } from "src/dataStore/repetitionItem";
import { TrackedFile } from "src/dataStore/trackedFile";
import { DEFAULT_SETTINGS } from "src/settings";

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
