import { resolveDurationTokenDeletion } from "src/ui/timeline/timelineLivePreview";

describe("timelineLivePreview", () => {
    it("deletes a duration token from the right boundary without exceeding document bounds", () => {
        expect(
            resolveDurationTokenDeletion({
                selectionFrom: 8,
                selectionTo: 8,
                tokenFrom: 0,
                tokenTo: 8,
                docLength: 8,
                direction: "backward",
            }),
        ).toEqual({
            from: 0,
            to: 8,
            anchor: 0,
        });
    });

    it("deletes a duration token from the left boundary without exceeding document bounds", () => {
        expect(
            resolveDurationTokenDeletion({
                selectionFrom: 0,
                selectionTo: 0,
                tokenFrom: 0,
                tokenTo: 8,
                docLength: 8,
                direction: "forward",
            }),
        ).toEqual({
            from: 0,
            to: 8,
            anchor: 0,
        });
    });

    it("expands overlapping selections to the full duration token", () => {
        expect(
            resolveDurationTokenDeletion({
                selectionFrom: 0,
                selectionTo: 3,
                tokenFrom: 0,
                tokenTo: 8,
                docLength: 12,
                direction: "forward",
            }),
        ).toEqual({
            from: 0,
            to: 8,
            anchor: 0,
        });
    });
});
