import { EditorState } from "@codemirror/state";
import {
    extractContextRangesField,
    setExtractContextRangesEffect,
    type ExtractContextRanges,
} from "src/editor/extract-context-decoration";

function createRanges(overrides: Partial<ExtractContextRanges> = {}): ExtractContextRanges {
    return {
        currentOuterFrom: 2,
        currentOuterTo: 8,
        currentInnerFrom: 4,
        currentInnerTo: 6,
        currentOpenTokenFrom: 2,
        currentOpenTokenTo: 4,
        currentCloseTokenFrom: 6,
        currentCloseTokenTo: 8,
        ...overrides,
    };
}

describe("extractContextRangesField", () => {
    test("does not map stale out-of-bounds ranges before applying replacement ranges", () => {
        const shortDoc = "x".repeat(12);
        let state = EditorState.create({
            doc: shortDoc,
            extensions: [extractContextRangesField],
        });

        state = state.update({
            effects: setExtractContextRangesEffect.of(
                createRanges({
                    currentOuterFrom: 20,
                    currentOuterTo: 40,
                    currentInnerFrom: 26,
                    currentInnerTo: 34,
                    currentOpenTokenFrom: 20,
                    currentOpenTokenTo: 26,
                    currentCloseTokenFrom: 34,
                    currentCloseTokenTo: 40,
                }),
            ),
        }).state;

        expect(() => {
            state = state.update({
                effects: setExtractContextRangesEffect.of(createRanges()),
            }).state;
        }).not.toThrow();

        expect(state.field(extractContextRangesField)).toEqual(createRanges());
    });

    test("clamps mapped ranges to the current document length", () => {
        let state = EditorState.create({
            doc: "0123456789",
            extensions: [extractContextRangesField],
        });

        state = state.update({
            effects: setExtractContextRangesEffect.of(createRanges({ currentOuterTo: 99 })),
        }).state;

        const ranges = state.field(extractContextRangesField);

        expect(ranges?.currentOuterTo).toBe(10);
        expect(ranges?.currentCloseTokenTo).toBeLessThanOrEqual(10);
    });
});
