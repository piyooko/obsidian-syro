import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
    alignNestedIrExtractBlocksHorizontally,
    clampIrExtractVerticalInsetsForAdjacentBlocks,
    containNestedIrExtractBlocks,
    createIrExtractBlockElement,
    createIrExtractNoteTooltipElement,
    createIrExtractDecorationExtensions,
    findActiveIrExtractSourceMatch,
    buildIrExtractRenderExtractsForTest,
    findIrExtractEditingRoot,
    findIrExtractSourceMatches,
    findIrExtractSourceMatchesAtPoint,
    findIrExtractSourceStartsAtSelectionPoint,
    getIrExtractInfoVisibleStarts,
    getIrExtractInfoOffsetIndexes,
    getIrExtractLayerInset,
    getIrExtractLayerVerticalInset,
    getIrExtractHorizontalFrameForMetrics,
    getIrExtractLineRanges,
    getIrExtractNoteTooltipPosition,
    getIrExtractRenderRange,
    getIrExtractVerticalInsetForMetrics,
    getIrExtractWrappedBlockPrefix,
    getIrExtractWrappedHeading,
    findIrExtractInfoActionStartAtClientPoint,
    getIrExtractNoteTooltipPlacement,
    shouldHighlightIrExtractBlock,
    shouldCloseIrExtractPinnedTooltip,
    isIrExtractNoteTooltipVisible,
    type MeasuredExtractBlock,
    type RenderExtract,
} from "src/editor/ir-extract-decoration";
import { parseIrExtracts } from "src/util/irExtractParser";

describe("irExtractDecoration helpers", () => {
    beforeAll(() => {
        if (!HTMLElement.prototype.setCssProps) {
            HTMLElement.prototype.setCssProps = function setCssProps(
                this: HTMLElement,
                props: Record<string, string>,
            ) {
                for (const [key, value] of Object.entries(props)) {
                    this.style.setProperty(key, value);
                }
            };
        }
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    function getInfoRightOffsetEntries(
        source: string,
        visibleStarts: number[],
        blocks?: MeasuredExtractBlock[],
    ): Array<[number, number]> {
        const matches = parseIrExtracts(source);
        const measuredBlocks =
            blocks ??
            matches.map((match) => ({
                start: match.start,
                left: 0,
                top: 0,
                width: 100,
                height: 20,
                depth: 1,
                maxDepth: 1,
            }));
        const offsets = getIrExtractInfoOffsetIndexes(
            source,
            new Map(matches.map((match) => [match.start, match])),
            new Map(measuredBlocks.map((block) => [block.start, block])),
        );
        return visibleStarts.map((start) => [start, offsets.get(start)?.rightOffset ?? 0]);
    }

    function getInfoTopOffsetEntries(
        source: string,
        visibleStarts: number[],
        blocks: MeasuredExtractBlock[],
    ): Array<[number, number]> {
        const matches = parseIrExtracts(source);
        const offsets = getIrExtractInfoOffsetIndexes(
            source,
            new Map(matches.map((match) => [match.start, match])),
            new Map(blocks.map((block) => [block.start, block])),
        );
        return visibleStarts.map((start) => [start, offsets.get(start)?.topOffset ?? 0]);
    }

    test("keeps the first three extract layer insets fixed", () => {
        expect(getIrExtractLayerInset(1, 3)).toBe(18);
        expect(getIrExtractLayerInset(2, 3)).toBe(12);
        expect(getIrExtractLayerInset(3, 3)).toBe(6);
    });

    test("spreads deeper extract layers evenly between outer and inner inset", () => {
        expect([1, 2, 3, 4].map((depth) => getIrExtractLayerInset(depth, 4))).toEqual([
            18, 14, 10, 6,
        ]);
        expect([1, 2, 3, 4, 5].map((depth) => getIrExtractLayerInset(depth, 5))).toEqual([
            18, 15, 12, 9, 6,
        ]);
    });

    test("scales vertical inset with line-height breathing room", () => {
        expect(getIrExtractVerticalInsetForMetrics(50, [26])).toBe(8);
        expect(getIrExtractVerticalInsetForMetrics(34, [26])).toBe(4);
        expect(getIrExtractVerticalInsetForMetrics(28, [26])).toBe(1);
        expect(getIrExtractVerticalInsetForMetrics(26, [26])).toBe(0);
    });

    test("clamps same-depth vertical insets to adjacent block gaps", () => {
        const clamped = clampIrExtractVerticalInsetsForAdjacentBlocks([
            { rawTop: 0, rawBottom: 26, depth: 1, verticalInset: 8 },
            { rawTop: 30, rawBottom: 56, depth: 1, verticalInset: 8 },
            { rawTop: 30, rawBottom: 56, depth: 2, verticalInset: 4 },
        ]);

        expect(clamped).toEqual([2, 2, 4]);
    });

    test("expands parent blocks to contain nested child blocks", () => {
        const blocks = containNestedIrExtractBlocks([
            {
                start: 0,
                left: 10,
                top: 10,
                width: 90,
                height: 40,
                depth: 1,
                maxDepth: 2,
            },
            {
                start: 20,
                parentStart: 0,
                left: 0,
                top: 20,
                width: 130,
                height: 40,
                depth: 2,
                maxDepth: 2,
            },
        ]);

        expect(blocks[0]).toMatchObject({ left: -1, top: 10, width: 132, height: 51 });
    });

    test("expands parent extract frames outward from the innermost container frame", () => {
        const blocks = alignNestedIrExtractBlocksHorizontally([
            {
                start: 0,
                left: 20,
                top: 0,
                width: 220,
                height: 80,
                depth: 1,
                maxDepth: 3,
            },
            {
                start: 30,
                parentStart: 0,
                left: 20,
                top: 20,
                width: 220,
                height: 30,
                depth: 2,
                maxDepth: 3,
            },
            {
                start: 50,
                parentStart: 30,
                left: 20,
                top: 28,
                width: 220,
                height: 18,
                depth: 3,
                maxDepth: 3,
            },
        ]);

        expect(blocks[0]).toMatchObject({ left: 2, width: 256 });
        expect(blocks[1]).toMatchObject({ left: 8, width: 244 });
        expect(blocks[2]).toMatchObject({ left: 14, width: 232 });
    });

    test("shows ancestor info actions when hovering a nested child block", () => {
        const visibleStarts = getIrExtractInfoVisibleStarts(
            new Map([
                [0, { start: 0, left: 0, top: 0, width: 100, height: 100, depth: 1, maxDepth: 3 }],
                [
                    20,
                    {
                        start: 20,
                        parentStart: 0,
                        left: 0,
                        top: 20,
                        width: 100,
                        height: 60,
                        depth: 2,
                        maxDepth: 3,
                    },
                ],
                [
                    40,
                    {
                        start: 40,
                        parentStart: 20,
                        left: 0,
                        top: 30,
                        width: 100,
                        height: 20,
                        depth: 3,
                        maxDepth: 3,
                    },
                ],
            ]),
            40,
            null,
            null,
        );

        expect([...visibleStarts]).toEqual([40, 20, 0]);
    });

    test("shows the same ancestor info actions when the cursor is inside a nested child block", () => {
        const visibleStarts = getIrExtractInfoVisibleStarts(
            new Map([
                [0, { start: 0, left: 0, top: 0, width: 100, height: 100, depth: 1, maxDepth: 3 }],
                [
                    20,
                    {
                        start: 20,
                        parentStart: 0,
                        left: 0,
                        top: 20,
                        width: 100,
                        height: 60,
                        depth: 2,
                        maxDepth: 3,
                    },
                ],
                [
                    40,
                    {
                        start: 40,
                        parentStart: 20,
                        left: 0,
                        top: 30,
                        width: 100,
                        height: 20,
                        depth: 3,
                        maxDepth: 3,
                    },
                ],
            ]),
            null,
            40,
            null,
        );

        expect([...visibleStarts]).toEqual([40, 20, 0]);
    });

    test("keeps visible info actions fixed when their start tokens are on unrelated lines", () => {
        const source = "{{ir::outer\nsome text\n{{ir::inner}}}}";
        const matches = parseIrExtracts(source);

        expect(getInfoRightOffsetEntries(source, [matches[1].start, matches[0].start])).toEqual([
            [matches[1].start, 0],
            [matches[0].start, 0],
        ]);
    });

    test("stacks info actions left when nested start tokens share a source line", () => {
        const source = "{{ir::这{{ir::是}}一句话}}";
        const matches = parseIrExtracts(source);

        expect(getInfoRightOffsetEntries(source, [matches[1].start, matches[0].start])).toEqual([
            [matches[1].start, 0],
            [matches[0].start, 24],
        ]);
    });

    test("uses measured block right edges to keep stacked info actions from overlapping", () => {
        const source = "{{ir::这{{ir::是}}一句话}}";
        const matches = parseIrExtracts(source);

        expect(
            getInfoRightOffsetEntries(
                source,
                [matches[1].start, matches[0].start],
                [
                    {
                        start: matches[1].start,
                        left: 0,
                        top: 0,
                        width: 232,
                        height: 20,
                        depth: 2,
                        maxDepth: 2,
                    },
                    {
                        start: matches[0].start,
                        left: 0,
                        top: 0,
                        width: 244,
                        height: 20,
                        depth: 1,
                        maxDepth: 2,
                    },
                ],
            ),
        ).toEqual([
            [matches[1].start, 0],
            [matches[0].start, 36],
        ]);
    });

    test("does not stack same source-line starts when their visual rows differ", () => {
        const source = "{{ir::父级很长很长很长很长很长很长很长 {{ir::逃出}} 后续}}";
        const matches = parseIrExtracts(source);

        expect(
            getInfoRightOffsetEntries(
                source,
                [matches[1].start, matches[0].start],
                [
                    {
                        start: matches[1].start,
                        left: 0,
                        top: 96,
                        width: 232,
                        height: 20,
                        depth: 2,
                        maxDepth: 2,
                    },
                    {
                        start: matches[0].start,
                        left: 0,
                        top: 0,
                        width: 244,
                        height: 20,
                        depth: 1,
                        maxDepth: 2,
                    },
                ],
            ),
        ).toEqual([
            [matches[1].start, 0],
            [matches[0].start, 0],
        ]);
    });

    test("keeps computed info positions fixed even when only one icon is visible", () => {
        const source = "{{ir::这{{ir::是}}一句话}}";
        const matches = parseIrExtracts(source);

        expect(getInfoRightOffsetEntries(source, [matches[0].start])).toEqual([
            [matches[0].start, 24],
        ]);
        expect(getInfoRightOffsetEntries(source, [matches[1].start])).toEqual([
            [matches[1].start, 0],
        ]);
    });

    test("aligns stacked info actions to the highest icon in the group", () => {
        const source = "{{ir::这{{ir::是}}一句话}}";
        const matches = parseIrExtracts(source);

        expect(
            getInfoTopOffsetEntries(
                source,
                [matches[1].start, matches[0].start],
                [
                    {
                        start: matches[1].start,
                        left: 0,
                        top: 8,
                        width: 232,
                        height: 20,
                        depth: 2,
                        maxDepth: 2,
                    },
                    {
                        start: matches[0].start,
                        left: 0,
                        top: 0,
                        width: 244,
                        height: 20,
                        depth: 1,
                        maxDepth: 2,
                    },
                ],
            ),
        ).toEqual([
            [matches[1].start, -8],
            [matches[0].start, 0],
        ]);
    });

    test("creates an editable note-path tooltip for the info action", () => {
        const pinnedStarts: number[] = [];
        const hoverStarts: number[] = [];
        const hoverEnds: number[] = [];
        const element = createIrExtractBlockElement(42, {
            onPinTooltip: (blockStart: number) => pinnedStarts.push(blockStart),
            onTooltipHoverStart: (blockStart: number) => hoverStarts.push(blockStart),
            onTooltipHoverEnd: (blockStart: number) => hoverEnds.push(blockStart),
        });

        const action = element.querySelector<HTMLElement>(".sr-ir-info-action");
        const tooltip = createIrExtractNoteTooltipElement();
        const textarea = tooltip.querySelector<HTMLTextAreaElement>("textarea");

        expect(action).toBeTruthy();
        expect(tooltip).toBeTruthy();
        expect(tooltip?.classList.contains("sr-note-path-tooltip")).toBe(true);
        expect(tooltip?.classList.contains("is-below")).toBe(true);
        expect(textarea?.classList.contains("sr-ir-note-tooltip-input")).toBe(true);
        expect(action?.querySelector(".sr-ir-note-tooltip")).toBeNull();
        expect(textarea?.placeholder).toBe("输入备注...");

        action?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        expect(hoverStarts).toEqual([42]);

        action?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        expect(hoverEnds).toEqual([42]);

        action?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
        expect(pinnedStarts).toEqual([42]);

        if (!textarea) {
            throw new Error("Expected editable tooltip textarea");
        }
        Object.defineProperty(textarea, "scrollHeight", { value: 42, configurable: true });
        textarea.value = "纯前端备注";
        textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
        expect(textarea.value).toBe("纯前端备注");
        expect(textarea.style.getPropertyValue("--sr-ir-note-textarea-height")).toBe("42px");
    });

    test("shows the note tooltip only from icon hover or pinned click state", () => {
        expect(isIrExtractNoteTooltipVisible(42, null, null)).toBe(false);
        expect(isIrExtractNoteTooltipVisible(42, 42, null)).toBe(true);
        expect(isIrExtractNoteTooltipVisible(42, null, 42)).toBe(true);
        expect(isIrExtractNoteTooltipVisible(42, 7, 9)).toBe(false);
    });

    test("places the note tooltip above the icon unless there is not enough viewport space", () => {
        expect(
            getIrExtractNoteTooltipPlacement({
                actionTop: 120,
                actionBottom: 140,
                tooltipHeight: 80,
                viewportHeight: 500,
                viewportPadding: 12,
                gap: 10,
            }),
        ).toBe("above");
        expect(
            getIrExtractNoteTooltipPlacement({
                actionTop: 70,
                actionBottom: 90,
                tooltipHeight: 80,
                viewportHeight: 500,
                viewportPadding: 12,
                gap: 10,
            }),
        ).toBe("below");
    });

    test("positions the note tooltip arrow at the info icon center", () => {
        expect(
            getIrExtractNoteTooltipPosition({
                actionLeft: 1180,
                actionTop: 600,
                actionRight: 1200,
                actionBottom: 620,
                tooltipWidth: 240,
                tooltipHeight: 80,
                viewportWidth: 1280,
                viewportHeight: 800,
                viewportPadding: 12,
                gap: 10,
            }),
        ).toEqual({
            placement: "above",
            top: 510,
            left: 1028,
            maxWidth: 240,
            arrowLeft: 158,
        });

        expect(
            getIrExtractNoteTooltipPosition({
                actionLeft: 4,
                actionTop: 50,
                actionRight: 24,
                actionBottom: 70,
                tooltipWidth: 240,
                tooltipHeight: 80,
                viewportWidth: 1280,
                viewportHeight: 800,
                viewportPadding: 12,
                gap: 10,
            }),
        ).toEqual({
            placement: "below",
            top: 80,
            left: 12,
            maxWidth: 240,
            arrowLeft: -2,
        });
    });

    test("keeps a pinned note tooltip open when clicking inside it", () => {
        const overlay = document.createElement("div");
        const tooltip = createIrExtractNoteTooltipElement();
        const textarea = tooltip.querySelector<HTMLTextAreaElement>("textarea");
        document.body.append(overlay, tooltip);

        expect(shouldCloseIrExtractPinnedTooltip(textarea, overlay, tooltip)).toBe(false);
        expect(shouldCloseIrExtractPinnedTooltip(tooltip, overlay, tooltip)).toBe(false);
        expect(shouldCloseIrExtractPinnedTooltip(document.body, overlay, tooltip)).toBe(true);
    });

    test("does not highlight the extract block only because its tooltip is pinned", () => {
        expect(shouldHighlightIrExtractBlock(42, 42, null)).toBe(true);
        expect(shouldHighlightIrExtractBlock(42, 42, 42)).toBe(false);
        expect(shouldHighlightIrExtractBlock(42, null, 42)).toBe(false);
    });

    test("detects visible info actions by pointer coordinates even when event target differs", () => {
        const element = createIrExtractBlockElement(42, {
            onPinTooltip: () => undefined,
            onTooltipHoverStart: () => undefined,
            onTooltipHoverEnd: () => undefined,
        });
        const action = element.querySelector<HTMLElement>(".sr-ir-info-action");
        if (!action) {
            throw new Error("Expected info action");
        }

        action.getBoundingClientRect = jest.fn(
            () =>
                ({
                    left: 10,
                    top: 20,
                    right: 30,
                    bottom: 40,
                    width: 20,
                    height: 20,
                    x: 10,
                    y: 20,
                    toJSON: () => undefined,
                }) as DOMRect,
        );

        expect(findIrExtractInfoActionStartAtClientPoint(new Map([[42, element]]), 15, 25)).toBe(
            null,
        );

        action.classList.add("is-visible");
        expect(findIrExtractInfoActionStartAtClientPoint(new Map([[42, element]]), 15, 25)).toBe(
            42,
        );
        expect(findIrExtractInfoActionStartAtClientPoint(new Map([[42, element]]), 5, 25)).toBe(
            null,
        );
    });

    test("stacks info actions left when a parent start token is on the previous start-only line", () => {
        const source = "{{ir::\n这{{ir::是}}一句话}}";
        const matches = parseIrExtracts(source);

        expect(getInfoRightOffsetEntries(source, [matches[1].start, matches[0].start])).toEqual([
            [matches[1].start, 0],
            [matches[0].start, 24],
        ]);
    });

    test("stacks multi-level info actions from the innermost start token", () => {
        const source = "{{ir::\n这{{ir::个{{ir::词}}}}}}";
        const matches = parseIrExtracts(source);

        expect(
            getInfoRightOffsetEntries(source, [
                matches[2].start,
                matches[1].start,
                matches[0].start,
            ]),
        ).toEqual([
            [matches[2].start, 0],
            [matches[1].start, 24],
            [matches[0].start, 48],
        ]);
    });

    test("keeps unrelated ancestors fixed while stacking only the overlapping start-token group", () => {
        const source = "{{ir::outer\nsome text\n{{ir::middle {{ir::inner}}}}}}";
        const matches = parseIrExtracts(source);

        expect(
            getInfoRightOffsetEntries(source, [
                matches[2].start,
                matches[1].start,
                matches[0].start,
            ]),
        ).toEqual([
            [matches[2].start, 0],
            [matches[1].start, 24],
            [matches[0].start, 0],
        ]);
    });

    test("separates nested extract vertical borders by depth", () => {
        expect([1, 2, 3].map((depth) => getIrExtractLayerVerticalInset(8, depth, 3))).toEqual([
            8, 5.33, 2.67,
        ]);
        expect([1, 2].map((depth) => getIrExtractLayerVerticalInset(1, depth, 2))).toEqual([
            1, 0.5,
        ]);
    });

    test("uses content container horizontal frame for extract blocks", () => {
        const frame = getIrExtractHorizontalFrameForMetrics(80, 500, 20, 5);

        expect(frame).toEqual({
            left: 65,
            width: 420,
        });
    });

    test("selects the smallest touched extract as the editing root", () => {
        const text = "{{ir::outer {{ir::inner}} text}}";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("inner");
        const editingRoot = findIrExtractEditingRoot(matches, cursor, cursor);

        expect(editingRoot?.rawMarkdown).toBe("inner");
    });

    test("shows source for every extract layer touched by the cursor", () => {
        const text = "{{ir::outer {{ir::inner}} text}}";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("inner");
        const sourceMatches = findIrExtractSourceMatches(text, matches, cursor, cursor);

        expect(sourceMatches.map((match) => match.rawMarkdown)).toEqual([
            "outer {{ir::inner}} text",
            "inner",
        ]);
    });

    test("selects the innermost active source wrapper for token highlighting", () => {
        const text = "{{ir::outer {{ir::inner}}}}";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("inner");
        const active = findActiveIrExtractSourceMatch(text, matches, cursor, cursor);

        expect(active?.rawMarkdown).toBe("inner");
        expect(active ? text.slice(active.innerEnd, active.end) : "").toBe("}}");
        expect(active?.end).toBeLessThan(text.length);
    });

    test("uses the matched IR close token instead of the nearest double brace", () => {
        const text = "{{ir::outer {{ir::inner {{c1::cloze}} and {{plain}} end}}}}";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("inner");
        const active = findActiveIrExtractSourceMatch(text, matches, cursor, cursor);

        expect(active?.rawMarkdown).toBe("inner {{c1::cloze}} and {{plain}} end");
        expect(active ? text.slice(active.innerEnd, active.end) : "").toBe("}}");
        expect(active?.end).toBe(text.length - 2);
    });

    test("shows source for every extract on the current source line", () => {
        const text = "prefix {{ir::one}} middle {{ir::two}} suffix";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("prefix");
        const sourceMatches = findIrExtractSourceMatches(text, matches, cursor, cursor);

        expect(sourceMatches.map((match) => match.rawMarkdown)).toEqual(["one", "two"]);
        expect(findActiveIrExtractSourceMatch(text, matches, cursor, cursor)).toBeNull();
    });

    test("shows source only for extract blocks hit by the cursor point", () => {
        const text = "prefix {{ir::one}} middle {{ir::two}} suffix";
        const matches = parseIrExtracts(text);
        const blocks = [
            { start: matches[0].start, left: 10, top: 0, width: 30, height: 20 },
            { start: matches[1].start, left: 60, top: 0, width: 30, height: 20 },
        ];

        expect(findIrExtractSourceMatchesAtPoint(matches, blocks, 45, 10)).toEqual([]);
        expect(
            findIrExtractSourceMatchesAtPoint(matches, blocks, 65, 10).map(
                (match) => match.rawMarkdown,
            ),
        ).toEqual(["two"]);
    });

    test("shows source for nested extract blocks hit by the cursor point", () => {
        const text = "{{ir::outer {{ir::inner}} text}}";
        const matches = parseIrExtracts(text);
        const blocks = [
            { start: matches[0].start, left: 0, top: 0, width: 100, height: 40 },
            { start: matches[1].start, left: 20, top: 10, width: 50, height: 20 },
        ];

        expect(
            findIrExtractSourceMatchesAtPoint(matches, blocks, 30, 20).map(
                (match) => match.rawMarkdown,
            ),
        ).toEqual(["outer {{ir::inner}} text", "inner"]);
    });

    test("keeps point source matches while selecting inside an extract block", () => {
        const text = "{{ir::outer {{ir::inner}} text}}";
        const matches = parseIrExtracts(text);
        const blocks = [
            { start: matches[0].start, left: 0, top: 0, width: 100, height: 40 },
            { start: matches[1].start, left: 20, top: 10, width: 50, height: 20 },
        ];
        const selectionFrom = text.indexOf("inner");
        const selectionTo = selectionFrom + "inn".length;

        expect(
            findIrExtractSourceStartsAtSelectionPoint(
                matches,
                { from: selectionFrom, to: selectionTo },
                blocks,
                { x: 30, y: 20 },
            ),
        ).toEqual([matches[0].start, matches[1].start]);
    });

    test("selects the outer extract when the selection crosses an inner extract", () => {
        const text = "{{ir::outer {{ir::inner}} text}}";
        const matches = parseIrExtracts(text);
        const selectionFrom = text.indexOf("outer");
        const selectionTo = text.indexOf(" text") + " text".length;
        const editingRoot = findIrExtractEditingRoot(matches, selectionFrom, selectionTo);

        expect(editingRoot?.rawMarkdown).toBe("outer {{ir::inner}} text");
    });

    test("render range uses extract text normally and full source while editing", () => {
        const text = "before {{ir::one}} after";
        const [match] = parseIrExtracts(text);
        const hidden: RenderExtract = { match, depth: 1, maxDepth: 1, showSource: false };
        const editing: RenderExtract = { match, depth: 1, maxDepth: 1, showSource: true };

        expect(getIrExtractRenderRange(hidden)).toEqual({
            from: match.innerStart,
            to: match.innerEnd,
        });
        expect(text.slice(match.innerStart, match.innerEnd)).toBe("one");
        expect(getIrExtractRenderRange(editing)).toEqual({ from: match.start, to: match.end });
        expect(text.slice(match.start, match.end)).toBe("{{ir::one}}");
    });

    test("detects legacy IR-wrapped heading and list block prefixes", () => {
        const headingText = "{{ir::#### Area C}}";
        const [heading] = parseIrExtracts(headingText);
        expect(getIrExtractWrappedHeading(headingText, heading)).toMatchObject({
            level: 4,
            markerFrom: heading.innerStart,
            markerTo: heading.innerStart + "#### ".length,
            textFrom: heading.innerStart + "#### ".length,
        });

        const bulletText = "    {{ir::* Forecast chart}}";
        const [bullet] = parseIrExtracts(bulletText);
        expect(getIrExtractWrappedBlockPrefix(bulletText, bullet)).toMatchObject({
            kind: "unordered-list",
            markerFrom: bullet.innerStart,
            markerTo: bullet.innerStart + "* ".length,
            textFrom: bullet.innerStart + "* ".length,
        });
    });

    test("line coverage expands a partial extract to the touched source lines", () => {
        const text = "before {{ir::one}} after\n  second {{ir::two}}\nthird";
        const matches = parseIrExtracts(text);
        const firstLineEnd = text.indexOf("\n");
        const secondLineStart = firstLineEnd + 1;
        const secondLineEnd = text.indexOf("\n", secondLineStart);

        expect(getIrExtractLineRanges(text, matches[0])).toEqual([
            { from: 0, to: firstLineEnd, line: 1 },
        ]);
        expect(getIrExtractLineRanges(text, matches[1])).toEqual([
            { from: secondLineStart, to: secondLineEnd, line: 2 },
        ]);
    });

    test("line coverage includes every line touched by a multiline extract", () => {
        const text = "a\n{{ir::b\n  c\nd}}\ne";
        const [match] = parseIrExtracts(text);
        const lines = getIrExtractLineRanges(text, match);

        expect(lines.map((line) => text.slice(line.from, line.to))).toEqual([
            "{{ir::b",
            "  c",
            "d}}",
        ]);
        expect(lines.map((line) => line.line)).toEqual([2, 3, 4]);
    });

    test("excludes the current outer extract block while keeping nested extract blocks", () => {
        const source = "before {{ir::outer {{ir::inner}} text}} after";
        const matches = parseIrExtracts(source);

        const renderExtracts = buildIrExtractRenderExtractsForTest(source, matches, {
            excludedStarts: new Set([matches[0].start]),
        });

        expect(renderExtracts.map((item) => item.start)).toEqual([matches[1].start]);
    });

    test("keeps extract source hidden when source reveal is disabled", () => {
        const source = "before {{ir::outer {{ir::inner}} text}} after";
        const matches = parseIrExtracts(source);

        const renderExtracts = buildIrExtractRenderExtractsForTest(source, matches, {
            revealSource: false,
            sourceStarts: new Set(matches.map((match) => match.start)),
        } as never);

        expect(renderExtracts.map((item) => item.showSource)).toEqual([false, false]);
    });

    test("keeps hidden inline extracts on their containing line without layout widgets", () => {
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: [
                    "11111111111111",
                    "111111111{{ir::11}}111",
                    "11111111111111",
                ].join("\n"),
                extensions: [
                    createIrExtractDecorationExtensions({
                        canRevealSource: () => false,
                        isLivePreviewHost: () => true,
                    }),
                ],
            }),
        });

        try {
            const lines = Array.from(view.dom.querySelectorAll<HTMLElement>(".cm-line"));
            const extractLine = lines[1];
            const isolatedExtractLine = lines.find((line) => line.textContent === "11");

            expect(extractLine).toBeTruthy();
            expect(extractLine?.textContent).toBe("11111111111111");
            expect(isolatedExtractLine).toBeUndefined();
            expect(extractLine?.querySelector(".sr-ir-extract-gap-anchor")).toBeNull();
            expect(view.dom.querySelector(".sr-ir-extract-gap-anchor")).toBeNull();
            expect(view.dom.querySelector(".sr-ir-extract-gap-top")).toBeNull();
            expect(view.dom.querySelector(".sr-ir-extract-gap-bottom")).toBeNull();
            expect(view.dom.querySelector(".sr-ir-extract-layout-line")).toBeNull();
            expect(extractLine?.style.marginTop).toBe("");
            expect(extractLine?.style.marginBottom).toBe("");
            expect(extractLine?.style.paddingTop).toBe("");
            expect(extractLine?.style.paddingBottom).toBe("");
        } finally {
            view.destroy();
        }
    });

    test("keeps inline extracts on the same line after source reveal turns off", () => {
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);

        let canRevealSource = true;
        const doc = [
            "11111111111111",
            "111111111{{ir::11}}111",
            "11111111111111",
        ].join("\n");

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc,
                extensions: [
                    createIrExtractDecorationExtensions({
                        canRevealSource: () => canRevealSource,
                        isLivePreviewHost: () => true,
                    }),
                ],
            }),
        });

        try {
            view.dispatch({
                selection: { anchor: doc.indexOf("{{ir::") + "{{ir::".length },
            });

            const revealedLines = Array.from(
                view.dom.querySelectorAll<HTMLElement>(".cm-line"),
            );
            expect(revealedLines[1]?.textContent).toBe("111111111{{ir::11}}111");

            canRevealSource = false;
            view.dispatch({
                selection: { anchor: doc.length },
            });

            const hiddenLines = Array.from(view.dom.querySelectorAll<HTMLElement>(".cm-line"));
            const hiddenExtractLine = hiddenLines[1];
            const isolatedExtractLine = hiddenLines.find((line) => line.textContent === "11");

            expect(hiddenExtractLine?.textContent).toBe("11111111111111");
            expect(isolatedExtractLine).toBeUndefined();
            expect(view.dom.querySelector(".sr-ir-extract-gap-anchor")).toBeNull();
            expect(view.dom.querySelector(".sr-ir-extract-gap-top")).toBeNull();
            expect(view.dom.querySelector(".sr-ir-extract-gap-bottom")).toBeNull();
            expect(view.dom.querySelector(".sr-ir-extract-layout-line")).toBeNull();
        } finally {
            view.destroy();
        }
    });
});
