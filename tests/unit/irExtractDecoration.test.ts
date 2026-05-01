import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { readFileSync } from "fs";
import { join } from "path";
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
    IR_EXTRACT_INFO_NOTE_COLOR,
    getIrExtractInfoActionColor,
    getIrExtractInfoVisibleStarts,
    getIrExtractInfoOffsetIndexes,
    getIrExtractInfoState,
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
    shouldUseIrExtractTextColumnFrame,
    syncIrExtractInfoCursorAtClientPoint,
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

    function installIrExtractMeasureMocks(): () => void {
        const originalCreateRange = document.createRange;
        const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
        const originalDOMRect = globalThis.DOMRect;
        const rect = (left: number, top: number, width: number, height: number): DOMRect => {
            const right = left + width;
            const bottom = top + height;
            return {
                x: left,
                y: top,
                left,
                top,
                right,
                bottom,
                width,
                height,
                toJSON: () => undefined,
            } as DOMRect;
        };
        Object.defineProperty(globalThis, "DOMRect", {
            configurable: true,
            value: class MockDOMRect {
                x: number;
                y: number;
                left: number;
                top: number;
                right: number;
                bottom: number;
                width: number;
                height: number;

                constructor(left = 0, top = 0, width = 0, height = 0) {
                    this.x = left;
                    this.y = top;
                    this.left = left;
                    this.top = top;
                    this.width = width;
                    this.height = height;
                    this.right = left + width;
                    this.bottom = top + height;
                }

                toJSON(): undefined {
                    return undefined;
                }
            },
        });
        document.createRange = jest.fn(
            () =>
                ({
                    setStart: jest.fn(),
                    setEnd: jest.fn(),
                    detach: jest.fn(),
                    getClientRects: jest.fn(() => [rect(10, 10, 120, 20)]),
                }) as unknown as Range,
        );
        HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
            if ((this as HTMLElement).classList?.contains("cm-scroller")) {
                return rect(0, 0, 500, 500);
            }
            if ((this as HTMLElement).classList?.contains("cm-content")) {
                return rect(0, 0, 500, 500);
            }
            if ((this as HTMLElement).classList?.contains("sr-ir-info-action")) {
                return rect(110, 10, 20, 20);
            }
            if ((this as HTMLElement).classList?.contains("sr-ir-note-tooltip")) {
                return rect(0, 0, 240, 80);
            }
            return originalGetBoundingClientRect.call(this);
        };

        return () => {
            document.createRange = originalCreateRange;
            HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
            if (originalDOMRect) {
                Object.defineProperty(globalThis, "DOMRect", {
                    configurable: true,
                    value: originalDOMRect,
                });
            } else {
                delete (globalThis as typeof globalThis & { DOMRect?: typeof DOMRect }).DOMRect;
            }
        };
    }

    function installIrExtractMeasureMocksWithDynamicRangeTop(
        getRangeTop: () => number,
    ): () => void {
        const originalCreateRange = document.createRange;
        const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
        const originalDOMRect = globalThis.DOMRect;
        const rect = (left: number, top: number, width: number, height: number): DOMRect => {
            const right = left + width;
            const bottom = top + height;
            return {
                x: left,
                y: top,
                left,
                top,
                right,
                bottom,
                width,
                height,
                toJSON: () => undefined,
            } as DOMRect;
        };
        Object.defineProperty(globalThis, "DOMRect", {
            configurable: true,
            value: class MockDOMRect {
                x: number;
                y: number;
                left: number;
                top: number;
                right: number;
                bottom: number;
                width: number;
                height: number;

                constructor(left = 0, top = 0, width = 0, height = 0) {
                    this.x = left;
                    this.y = top;
                    this.left = left;
                    this.top = top;
                    this.width = width;
                    this.height = height;
                    this.right = left + width;
                    this.bottom = top + height;
                }

                toJSON(): undefined {
                    return undefined;
                }
            },
        });
        document.createRange = jest.fn(
            () =>
                ({
                    setStart: jest.fn(),
                    setEnd: jest.fn(),
                    detach: jest.fn(),
                    getClientRects: jest.fn(() => [rect(10, getRangeTop(), 120, 20)]),
                }) as unknown as Range,
        );
        HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
            if ((this as HTMLElement).classList?.contains("cm-scroller")) {
                return rect(0, 0, 500, 500);
            }
            if ((this as HTMLElement).classList?.contains("cm-content")) {
                return rect(0, 0, 500, 500);
            }
            if ((this as HTMLElement).classList?.contains("sr-ir-info-action")) {
                return rect(110, 10, 14, 14);
            }
            if ((this as HTMLElement).classList?.contains("sr-ir-note-tooltip")) {
                return rect(0, 0, 240, 80);
            }
            return originalGetBoundingClientRect.call(this);
        };

        return () => {
            document.createRange = originalCreateRange;
            HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
            if (originalDOMRect) {
                Object.defineProperty(globalThis, "DOMRect", {
                    configurable: true,
                    value: originalDOMRect,
                });
            } else {
                delete (globalThis as typeof globalThis & { DOMRect?: typeof DOMRect }).DOMRect;
            }
        };
    }

    async function waitForIrExtractMeasure(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 60));
    }

    async function waitForInitialIrExtractLayoutTracking(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 80));
    }

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

    test("keeps noted info actions visible and accented", () => {
        expect(getIrExtractInfoState(42, new Set([42]), new Set())).toEqual({
            visible: true,
            hasNote: false,
        });
        expect(getIrExtractInfoState(42, new Set(), new Set([42]))).toEqual({
            visible: true,
            hasNote: true,
        });
    });

    test("uses a bright green note color distinct from the editing accent", () => {
        expect(IR_EXTRACT_INFO_NOTE_COLOR).toBe("#44cf6e");
        expect(IR_EXTRACT_INFO_NOTE_COLOR).not.toBe("var(--interactive-accent)");
        expect(getIrExtractInfoActionColor(true, false, false)).toBe(IR_EXTRACT_INFO_NOTE_COLOR);
        expect(getIrExtractInfoActionColor(true, true, true)).toBe(IR_EXTRACT_INFO_NOTE_COLOR);
        expect(getIrExtractInfoActionColor(false, true, false)).toBe("var(--interactive-accent)");
        expect(getIrExtractInfoActionColor(false, false, true)).toBe("var(--interactive-accent)");
        expect(getIrExtractInfoActionColor(false, false, false)).toBeUndefined();
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
        const submit = jest.fn();
        const element = createIrExtractBlockElement(42, {
            onPinTooltip: (blockStart: number) => pinnedStarts.push(blockStart),
            onTooltipHoverStart: (blockStart: number) => hoverStarts.push(blockStart),
            onTooltipHoverEnd: (blockStart: number) => hoverEnds.push(blockStart),
        });

        const action = element.querySelector<HTMLElement>(".sr-ir-info-action");
        const tooltip = createIrExtractNoteTooltipElement({ onSubmit: submit });
        const textarea = tooltip.querySelector<HTMLTextAreaElement>("textarea");

        expect(action).toBeTruthy();
        expect(action?.classList.contains("sr-ir-info-action")).toBe(true);
        expect(tooltip).toBeTruthy();
        expect(tooltip?.classList.contains("sr-note-path-tooltip")).toBe(true);
        expect(tooltip?.classList.contains("is-below")).toBe(true);
        expect(textarea?.classList.contains("sr-ir-note-tooltip-input")).toBe(true);
        expect(action?.querySelector(".sr-ir-note-tooltip")).toBeNull();
        expect(textarea?.placeholder).toBe("输入备注...");
        expect(textarea?.hasAttribute("aria-label")).toBe(false);
        expect(textarea?.getAttribute("title")).toBe("");
        const importanceWidget = tooltip.querySelector<HTMLElement>(".sr-ir-importance-widget");
        expect(importanceWidget).not.toBeNull();
        expect(importanceWidget?.hasAttribute("title")).toBe(false);
        expect(importanceWidget?.querySelector(".sr-scroll-hint-icon")).not.toBeNull();
        expect(importanceWidget?.textContent?.replace(/\s/g, "")).toBe("W:5");

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

        const enterEvent = new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
        });
        textarea.dispatchEvent(enterEvent);
        expect(enterEvent.defaultPrevented).toBe(true);
        expect(submit).toHaveBeenCalledTimes(1);

        const shiftEnterEvent = new KeyboardEvent("keydown", {
            key: "Enter",
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        });
        textarea.dispatchEvent(shiftEnterEvent);
        expect(shiftEnterEvent.defaultPrevented).toBe(false);
        expect(submit).toHaveBeenCalledTimes(1);
    });

    test("saves tooltip note priority when using the importance wheel", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const saveExtractTooltipNotePriority = jest.fn(() => Promise.resolve());

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: "{{ir::one}}",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNote: () =>
                            Promise.resolve({ uuid: "extract-uuid-1", memo: "备注", priority: 5 }),
                        saveExtractTooltipNotePriority,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            document
                .querySelector<HTMLElement>(".sr-ir-info-action")
                ?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
            await waitForIrExtractMeasure();

            const widget = document.querySelector<HTMLElement>(".sr-ir-importance-widget");
            const value = document.querySelector<HTMLElement>(".sr-ir-importance-value");
            expect(value?.textContent).toBe("5");

            const event = new WheelEvent("wheel", {
                deltaY: -1,
                bubbles: true,
                cancelable: true,
            });
            widget?.dispatchEvent(event);
            await waitForIrExtractMeasure();

            expect(event.defaultPrevented).toBe(true);
            expect(value?.textContent).toBe("6");
            expect(widget?.classList.contains("tick-up")).toBe(true);
            expect(saveExtractTooltipNotePriority).toHaveBeenCalledWith("extract-uuid-1", 6);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("shows the importance hover treatment while touch dragging", () => {
        const tooltip = createIrExtractNoteTooltipElement();
        const widget = tooltip.querySelector<HTMLElement>(".sr-ir-importance-widget");

        const pointerDown = new MouseEvent("pointerdown", {
            clientY: 100,
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(pointerDown, "pointerId", { value: 1 });
        widget?.dispatchEvent(pointerDown);

        expect(widget?.classList.contains("is-touch-active")).toBe(true);

        const pointerCancel = new MouseEvent("pointercancel", {
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(pointerCancel, "pointerId", { value: 1 });
        widget?.dispatchEvent(pointerCancel);

        expect(widget?.classList.contains("is-touch-active")).toBe(false);
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

    test("extract tooltip importance styles stay scoped to the note tooltip", () => {
        const css = readFileSync(join(process.cwd(), "src/ui/styles/editor.css"), "utf8");

        expect(css).toMatch(
            /\.sr-ir-note-tooltip\s+\.sr-ir-importance-widget\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*4px;[^}]*right:\s*4px/s,
        );
        expect(css).toMatch(
            /\.sr-ir-note-tooltip\s+textarea\s*\{[^}]*padding:\s*0 4px 24px 0\s*!important/s,
        );
        expect(css).toMatch(
            /\.sr-ir-note-tooltip\s+\.sr-ir-importance-widget:hover,\s*\.sr-ir-note-tooltip\s+\.sr-ir-importance-widget\.is-touch-active\s*\{[^}]*color:\s*var\(--text-normal\);[^}]*background:\s*rgba\(128,\s*128,\s*128,\s*0\.15\)/s,
        );
        expect(css).not.toMatch(/(^|\n)\.sr-ir-importance-widget\s*\{/);
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

    test("keeps computed info action positions while hiding to avoid a last-frame jump", () => {
        const source = "{{ir::这{{ir::是}} 一句话}}";
        const matches = parseIrExtracts(source);
        const blocks = [
            {
                start: matches[1].start,
                left: 14,
                top: 0,
                width: 232,
                height: 20,
                depth: 2,
                maxDepth: 2,
            },
            {
                start: matches[0].start,
                left: 2,
                top: 0,
                width: 256,
                height: 20,
                depth: 1,
                maxDepth: 2,
            },
        ];
        const offsets = getIrExtractInfoOffsetIndexes(
            source,
            new Map(matches.map((match) => [match.start, match])),
            new Map(blocks.map((block) => [block.start, block])),
        );

        expect(offsets.get(matches[1].start)?.rightOffset).toBe(0);
        expect(offsets.get(matches[0].start)?.rightOffset).toBe(36);
    });

    test("forces the pointer cursor across the editor while the pointer is over a visible info action", () => {
        const scrollDOM = document.createElement("div");
        const element = createIrExtractBlockElement(42, {
            onPinTooltip: () => undefined,
            onTooltipHoverStart: () => undefined,
            onTooltipHoverEnd: () => undefined,
        });
        const action = element.querySelector<HTMLElement>(".sr-ir-info-action");
        if (!action) {
            throw new Error("Expected info action");
        }
        action.classList.add("is-visible");
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

        expect(
            syncIrExtractInfoCursorAtClientPoint(
                scrollDOM,
                new Map([[42, element]]),
                15,
                25,
            ),
        ).toBe(true);
        expect(scrollDOM.style.cursor).toBe("pointer");
        expect(scrollDOM.classList.contains("sr-ir-info-cursor-pointer")).toBe(true);

        expect(
            syncIrExtractInfoCursorAtClientPoint(
                scrollDOM,
                new Map([[42, element]]),
                5,
                25,
            ),
        ).toBe(false);
        expect(scrollDOM.style.cursor).toBe("");
        expect(scrollDOM.classList.contains("sr-ir-info-cursor-pointer")).toBe(false);
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

    test("uses extract context text column frame inside padded review content", () => {
        const frame = getIrExtractHorizontalFrameForMetrics(80, 500, 20, 5, {
            useTextColumn: true,
            paddingLeft: 40,
            paddingRight: 40,
        });

        expect(frame).toEqual({
            left: 105,
            width: 340,
        });
    });

    test("uses the text column frame for hybrid review editor content", () => {
        const officialEditor = document.createElement("div");
        officialEditor.className = "markdown-source-view mod-cm6 is-live-preview";
        const extractContextEditor = document.createElement("div");
        extractContextEditor.className = "sr-extract-context-editor";
        const hybridReviewEditor = document.createElement("div");
        hybridReviewEditor.className =
            "sr-hybrid-markdown-source markdown-source-view cm-s-obsidian mod-cm6 is-live-preview";

        expect(shouldUseIrExtractTextColumnFrame(officialEditor)).toBe(false);
        expect(shouldUseIrExtractTextColumnFrame(extractContextEditor)).toBe(true);
        expect(shouldUseIrExtractTextColumnFrame(hybridReviewEditor)).toBe(true);
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

    test("loads a persisted tooltip note when the extract tooltip is pinned", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const resolveExtractTooltipNote = jest.fn(() =>
            Promise.resolve({ uuid: "extract-uuid-1", memo: "后端已有备注", priority: 5 }),
        );
        const doc = "{{ir::one}}";

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc,
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNote,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            const action = document.querySelector<HTMLElement>(".sr-ir-info-action");
            if (!action) {
                throw new Error("Expected info action");
            }

            action.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
            await waitForIrExtractMeasure();

            const textarea = document.querySelector<HTMLTextAreaElement>(
                ".sr-ir-note-tooltip-input",
            );
            expect(resolveExtractTooltipNote).toHaveBeenCalledWith(view, doc.indexOf("{{ir::"));
            expect(textarea?.value).toBe("后端已有备注");
            expect(action.classList.contains("has-note")).toBe(true);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("saves a pinned persisted tooltip note on submit", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const saveExtractTooltipNote = jest.fn(() => Promise.resolve());

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: "{{ir::one}}",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNote: () =>
                            Promise.resolve({ uuid: "extract-uuid-1", memo: "", priority: 5 }),
                        saveExtractTooltipNote,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            document
                .querySelector<HTMLElement>(".sr-ir-info-action")
                ?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
            await waitForIrExtractMeasure();

            const textarea = document.querySelector<HTMLTextAreaElement>(
                ".sr-ir-note-tooltip-input",
            );
            if (!textarea) {
                throw new Error("Expected tooltip textarea");
            }
            textarea.value = "新的摘录备注";
            textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
            textarea.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                }),
            );
            await waitForIrExtractMeasure();

            expect(saveExtractTooltipNote).toHaveBeenCalledTimes(1);
            expect(saveExtractTooltipNote).toHaveBeenCalledWith("extract-uuid-1", "新的摘录备注");
            expect(
                document.querySelector<HTMLElement>(".sr-ir-info-action")?.classList.contains(
                    "has-note",
                ),
            ).toBe(true);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("resolves the tooltip note during submit when the user types before backend resolve finishes", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        let resolvePendingNote:
            | ((note: { uuid: string; memo: string; priority: number }) => void)
            | null = null;
        const pendingNote = new Promise<{ uuid: string; memo: string; priority: number }>(
            (resolve) => {
                resolvePendingNote = resolve;
            },
        );
        const resolveExtractTooltipNote = jest.fn(() => pendingNote);
        const saveExtractTooltipNote = jest.fn(() => Promise.resolve());

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: "{{ir::one}}",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNote,
                        saveExtractTooltipNote,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            document
                .querySelector<HTMLElement>(".sr-ir-info-action")
                ?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
            await waitForIrExtractMeasure();

            const textarea = document.querySelector<HTMLTextAreaElement>(
                ".sr-ir-note-tooltip-input",
            );
            if (!textarea) {
                throw new Error("Expected tooltip textarea");
            }
            textarea.value = "立刻输入的备注";
            textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
            textarea.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                }),
            );

            resolvePendingNote?.({ uuid: "extract-uuid-1", memo: "", priority: 5 });
            await waitForIrExtractMeasure();

            expect(resolveExtractTooltipNote).toHaveBeenCalledWith(view, 0);
            expect(saveExtractTooltipNote).toHaveBeenCalledTimes(1);
            expect(saveExtractTooltipNote).toHaveBeenCalledWith(
                "extract-uuid-1",
                "立刻输入的备注",
            );
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("saves an empty persisted tooltip note as no note", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const saveExtractTooltipNote = jest.fn(() => Promise.resolve());

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: "{{ir::one}}",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNote: () =>
                            Promise.resolve({
                                uuid: "extract-uuid-1",
                                memo: "后端已有备注",
                                priority: 5,
                            }),
                        saveExtractTooltipNote,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            const action = document.querySelector<HTMLElement>(".sr-ir-info-action");
            action?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
            await waitForIrExtractMeasure();

            const textarea = document.querySelector<HTMLTextAreaElement>(
                ".sr-ir-note-tooltip-input",
            );
            if (!textarea) {
                throw new Error("Expected tooltip textarea");
            }
            textarea.value = "";
            textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
            textarea.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                }),
            );
            await waitForIrExtractMeasure();

            expect(saveExtractTooltipNote).toHaveBeenCalledWith("extract-uuid-1", "");
            expect(action?.classList.contains("has-note")).toBe(false);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("keeps the tooltip draft when persisted note save fails", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const saveError = new Error("save failed");
        const onExtractTooltipNoteSaveError = jest.fn();

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: "{{ir::one}}",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNote: () =>
                            Promise.resolve({ uuid: "extract-uuid-1", memo: "", priority: 5 }),
                        saveExtractTooltipNote: () => Promise.reject(saveError),
                        onExtractTooltipNoteSaveError,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            const action = document.querySelector<HTMLElement>(".sr-ir-info-action");
            action?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
            await waitForIrExtractMeasure();

            const textarea = document.querySelector<HTMLTextAreaElement>(
                ".sr-ir-note-tooltip-input",
            );
            if (!textarea) {
                throw new Error("Expected tooltip textarea");
            }
            textarea.value = "失败时保留";
            textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
            textarea.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                }),
            );
            await waitForIrExtractMeasure();

            expect(onExtractTooltipNoteSaveError).toHaveBeenCalledWith(saveError);
            expect(textarea.value).toBe("失败时保留");
            expect(action?.classList.contains("has-note")).toBe(true);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("loads hover tooltip notes per extract instead of reusing the previous textarea value", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const doc = "{{ir::one}} {{ir::two}}";
        const firstStart = doc.indexOf("{{ir::one}}");
        const secondStart = doc.indexOf("{{ir::two}}");
        const resolveExtractTooltipNote = jest.fn(
            (_view: EditorView, sourceStart: number) =>
                Promise.resolve(
                    sourceStart === firstStart
                        ? { uuid: "extract-uuid-1", memo: "第一条备注", priority: 5 }
                        : { uuid: "extract-uuid-2", memo: "", priority: 5 },
                ),
        );

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc,
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNote,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            const actions = Array.from(
                document.querySelectorAll<HTMLElement>(".sr-ir-info-action"),
            );
            expect(actions).toHaveLength(2);

            actions[0]?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
            await waitForIrExtractMeasure();

            const textarea = document.querySelector<HTMLTextAreaElement>(
                ".sr-ir-note-tooltip-input",
            );
            expect(textarea?.value).toBe("第一条备注");
            expect(actions[0]?.classList.contains("has-note")).toBe(true);

            actions[0]?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
            actions[1]?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
            await waitForIrExtractMeasure();

            expect(textarea?.value).toBe("");
            expect(actions[1]?.classList.contains("has-note")).toBe(false);
            expect(resolveExtractTooltipNote).toHaveBeenCalledWith(view, firstStart);
            expect(resolveExtractTooltipNote).toHaveBeenCalledWith(view, secondStart);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("loads tooltip notes when scroll mousemove detects an info icon hover", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const doc = "{{ir::one}}";
        const resolveExtractTooltipNote = jest.fn(() =>
            Promise.resolve({ uuid: "extract-uuid-1", memo: "坐标悬浮备注", priority: 5 }),
        );

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc,
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNote,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            const action = document.querySelector<HTMLElement>(".sr-ir-info-action");
            if (!action) {
                throw new Error("Expected info action");
            }
            action.classList.add("is-visible");

            view.scrollDOM.dispatchEvent(
                new MouseEvent("mousemove", {
                    bubbles: true,
                    clientX: 112,
                    clientY: 12,
                }),
            );
            await waitForIrExtractMeasure();

            const textarea = document.querySelector<HTMLTextAreaElement>(
                ".sr-ir-note-tooltip-input",
            );
            expect(resolveExtractTooltipNote).toHaveBeenCalledWith(view, 0);
            expect(textarea?.value).toBe("坐标悬浮备注");
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("hydrates a hovered tooltip note after the editor is recreated", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const doc = "{{ir::one}}";
        const resolveExtractTooltipNote = jest.fn(() =>
            Promise.resolve({ uuid: "extract-uuid-1", memo: "重开后备注", priority: 5 }),
        );

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc,
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNote,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            document
                .querySelector<HTMLElement>(".sr-ir-info-action")
                ?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
            await waitForIrExtractMeasure();

            const textarea = document.querySelector<HTMLTextAreaElement>(
                ".sr-ir-note-tooltip-input",
            );
            expect(textarea?.value).toBe("重开后备注");
            expect(
                document.querySelector<HTMLElement>(".sr-ir-info-action")?.classList.contains(
                    "has-note",
                ),
            ).toBe(true);
            expect(resolveExtractTooltipNote).toHaveBeenCalledWith(view, 0);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("hydrates noted info action state on initial render", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const doc = "{{ir::one}} {{ir::two}}";
        const firstStart = doc.indexOf("{{ir::one}}");
        const secondStart = doc.indexOf("{{ir::two}}");
        const resolveExtractTooltipNotes = jest.fn(
            (_view: EditorView, sourceStarts: readonly number[]) =>
                Promise.resolve(
                    sourceStarts.map((sourceStart) =>
                        sourceStart === firstStart
                            ? {
                                  sourceStart,
                                  uuid: "extract-uuid-1",
                                  memo: "首屏已有备注",
                                  priority: 5,
                              }
                            : {
                                  sourceStart,
                                  uuid: "extract-uuid-2",
                                  memo: "",
                                  priority: 5,
                              },
                    ),
                ),
        );

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc,
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNotes,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            const actions = Array.from(
                document.querySelectorAll<HTMLElement>(".sr-ir-info-action"),
            );
            expect(actions).toHaveLength(2);
            expect(actions[0]?.classList.contains("has-note")).toBe(true);
            expect(actions[1]?.classList.contains("has-note")).toBe(false);
            expect(resolveExtractTooltipNotes).toHaveBeenCalledTimes(1);
            expect(resolveExtractTooltipNotes).toHaveBeenCalledWith(view, [firstStart, secondStart]);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("hydrates automatic heading memo actions on initial render", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const resolveExtractTooltipNotes = jest.fn(
            (_view: EditorView, sourceStarts: readonly number[]) =>
                Promise.resolve(
                    sourceStarts.map((sourceStart) => ({
                        sourceStart,
                        uuid: "auto-extract-uuid-1",
                        memo: "标题备注",
                        priority: 5,
                        sourceMode: "auto-slice" as const,
                    })),
                ),
        );

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: "# 自动摘录标题\n正文",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNotes,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();

            const action = parent.querySelector<HTMLElement>(".sr-ir-heading-note-action");
            expect(action).not.toBeNull();
            expect(action?.dataset.srIrExtractStart).toBe("0");
            expect(action?.classList.contains("is-visible")).toBe(true);
            expect(action?.classList.contains("has-note")).toBe(true);
            expect(resolveExtractTooltipNotes).toHaveBeenCalledWith(view, [0]);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("opens and saves the existing memo tooltip from an automatic heading action", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const resolveExtractTooltipNote = jest.fn(() =>
            Promise.resolve({ uuid: "auto-extract-uuid-1", memo: "标题备注", priority: 5 }),
        );
        const resolveExtractTooltipNotes = jest.fn(
            (_view: EditorView, sourceStarts: readonly number[]) =>
                Promise.resolve(
                    sourceStarts.map((sourceStart) => ({
                        sourceStart,
                        uuid: "auto-extract-uuid-1",
                        memo: "",
                        priority: 5,
                        sourceMode: "auto-slice" as const,
                    })),
                ),
        );
        const saveExtractTooltipNote = jest.fn(() => Promise.resolve());

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: "# 自动摘录标题\n正文",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNote,
                        resolveExtractTooltipNotes,
                        saveExtractTooltipNote,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            const action = parent.querySelector<HTMLElement>(".sr-ir-heading-note-action");
            if (!action) {
                throw new Error("Expected heading note action");
            }

            action.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
            action.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            await waitForIrExtractMeasure();

            const textarea = document.querySelector<HTMLTextAreaElement>(
                ".sr-ir-note-tooltip-input",
            );
            expect(resolveExtractTooltipNote).toHaveBeenCalledWith(view, 0);
            expect(textarea?.value).toBe("标题备注");
            expect(
                document
                    .querySelector<HTMLElement>(".sr-ir-note-tooltip")
                    ?.classList.contains("is-visible"),
            ).toBe(true);

            if (!textarea) {
                throw new Error("Expected tooltip textarea");
            }
            textarea.value = "新的标题备注";
            textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
            textarea.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                }),
            );
            await waitForIrExtractMeasure();

            expect(saveExtractTooltipNote).toHaveBeenCalledWith(
                "auto-extract-uuid-1",
                "新的标题备注",
            );
            expect(action.classList.contains("has-note")).toBe(true);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("keeps the existing memo tooltip open while hovering an automatic heading action", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const resolveExtractTooltipNote = jest.fn(() =>
            Promise.resolve({ uuid: "auto-extract-uuid-1", memo: "标题备注", priority: 5 }),
        );
        const resolveExtractTooltipNotes = jest.fn(
            (_view: EditorView, sourceStarts: readonly number[]) =>
                Promise.resolve(
                    sourceStarts.map((sourceStart) => ({
                        sourceStart,
                        uuid: "auto-extract-uuid-1",
                        memo: "标题备注",
                        priority: 5,
                        sourceMode: "auto-slice" as const,
                    })),
                ),
        );

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: "# 自动摘录标题\n正文",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNote,
                        resolveExtractTooltipNotes,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            const action = parent.querySelector<HTMLElement>(".sr-ir-heading-note-action");
            if (!action) {
                throw new Error("Expected heading note action");
            }

            action.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
            await waitForIrExtractMeasure();
            action.dispatchEvent(
                new MouseEvent("mousemove", {
                    bubbles: true,
                    clientX: 12,
                    clientY: 12,
                }),
            );
            await waitForIrExtractMeasure();

            expect(resolveExtractTooltipNote).toHaveBeenCalledWith(view, 0);
            expect(
                document
                    .querySelector<HTMLElement>(".sr-ir-note-tooltip")
                    ?.classList.contains("is-visible"),
            ).toBe(true);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("refreshes automatic heading memo actions when the heading line changes at the same offset", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const resolveExtractTooltipNotes = jest.fn(
            (viewArg: EditorView, sourceStarts: readonly number[]) => {
                if (!viewArg.state.doc.toString().startsWith("# ")) {
                    return Promise.resolve([]);
                }
                return Promise.resolve(
                    sourceStarts.map((sourceStart) => ({
                        sourceStart,
                        uuid: "auto-extract-uuid-1",
                        memo: "标题备注",
                        priority: 5,
                        sourceMode: "auto-slice" as const,
                    })),
                );
            },
        );

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: "# 自动摘录标题\n正文",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        resolveExtractTooltipNotes,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            expect(
                parent
                    .querySelector<HTMLElement>(".sr-ir-heading-note-action")
                    ?.classList.contains("is-visible"),
            ).toBe(true);

            view.dispatch({ changes: { from: 0, to: 1, insert: "##" } });
            await waitForIrExtractMeasure();

            const action = parent.querySelector<HTMLElement>(".sr-ir-heading-note-action");
            expect(resolveExtractTooltipNotes).toHaveBeenCalledTimes(2);
            expect(action?.dataset.srIrExtractStart).toBe("0");
            expect(action?.classList.contains("is-visible")).toBe(false);
            expect(action?.getAttribute("aria-hidden")).toBe("true");
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("tracks initial layout changes and remeasures each editor when requested", async () => {
        const restoreMeasureMocks = installIrExtractMeasureMocks();
        const firstParent = document.createElement("div");
        firstParent.className = "is-live-preview";
        const secondParent = document.createElement("div");
        secondParent.className = "is-live-preview";
        document.body.append(firstParent, secondParent);
        const trackInitialLayout = jest.fn(() => true);

        const firstView = new EditorView({
            parent: firstParent,
            state: EditorState.create({
                doc: "{{ir::one}}",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        trackInitialLayout,
                    }),
                ],
            }),
        });
        const secondView = new EditorView({
            parent: secondParent,
            state: EditorState.create({
                doc: "{{ir::two}}",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        trackInitialLayout,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();

            expect(trackInitialLayout).toHaveBeenCalledTimes(2);
            expect(firstParent.querySelector(".sr-ir-extract-block")).toBeTruthy();
            expect(secondParent.querySelector(".sr-ir-extract-block")).toBeTruthy();

            await waitForInitialIrExtractLayoutTracking();
            expect(firstParent.querySelector(".sr-ir-extract-block")).toBeTruthy();
            expect(secondParent.querySelector(".sr-ir-extract-block")).toBeTruthy();
        } finally {
            firstView.destroy();
            secondView.destroy();
            restoreMeasureMocks();
        }
    });

    test("initial layout tracking follows range position changes after first render", async () => {
        let rangeTop = 10;
        const restoreMeasureMocks = installIrExtractMeasureMocksWithDynamicRangeTop(() => rangeTop);
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: "{{ir::one}}",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        trackInitialLayout: () => true,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            const block = parent.querySelector<HTMLElement>(".sr-ir-extract-block");
            expect(block?.style.top).toBe("10px");

            rangeTop = 18;
            await waitForInitialIrExtractLayoutTracking();

            expect(parent.querySelector<HTMLElement>(".sr-ir-extract-block")?.style.top).toBe(
                "18px",
            );
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("restarts initial layout tracking when a reused editor receives a replacement document", async () => {
        let rangeTop = 10;
        const restoreMeasureMocks = installIrExtractMeasureMocksWithDynamicRangeTop(() => rangeTop);
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const trackInitialLayout = jest.fn(() => true);

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: "{{ir::one}}",
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        trackInitialLayout,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            await waitForInitialIrExtractLayoutTracking();
            expect(parent.querySelector<HTMLElement>(".sr-ir-extract-block")?.style.top).toBe(
                "10px",
            );
            expect(trackInitialLayout).toHaveBeenCalledTimes(1);

            rangeTop = 20;
            view.dispatch({
                changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: "{{ir::two}}",
                },
            });
            await waitForIrExtractMeasure();
            expect(parent.querySelector<HTMLElement>(".sr-ir-extract-block")?.style.top).toBe(
                "20px",
            );
            expect(trackInitialLayout).toHaveBeenCalledTimes(2);

            rangeTop = 28;
            await waitForInitialIrExtractLayoutTracking();

            expect(parent.querySelector<HTMLElement>(".sr-ir-extract-block")?.style.top).toBe(
                "28px",
            );
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });

    test("does not restart initial layout tracking for small edits in the same document", async () => {
        let rangeTop = 10;
        const restoreMeasureMocks = installIrExtractMeasureMocksWithDynamicRangeTop(() => rangeTop);
        const parent = document.createElement("div");
        parent.className = "is-live-preview";
        document.body.appendChild(parent);
        const trackInitialLayout = jest.fn(() => true);
        const doc = "prefix {{ir::one}} suffix";

        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc,
                extensions: [
                    createIrExtractDecorationExtensions({
                        isLivePreviewHost: () => true,
                        trackInitialLayout,
                    }),
                ],
            }),
        });

        try {
            await waitForIrExtractMeasure();
            await waitForInitialIrExtractLayoutTracking();
            expect(trackInitialLayout).toHaveBeenCalledTimes(1);

            view.dispatch({
                changes: {
                    from: 0,
                    insert: "x",
                },
            });
            await waitForIrExtractMeasure();

            expect(trackInitialLayout).toHaveBeenCalledTimes(1);
        } finally {
            view.destroy();
            restoreMeasureMocks();
        }
    });
});
