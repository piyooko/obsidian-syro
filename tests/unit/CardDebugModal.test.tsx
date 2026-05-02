import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CardDebugModal } from "src/ui/components/CardDebugModal";

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("framer-motion", () => {
    const React = require("react");
    const createMotionComponent = (tag: string) =>
        React.forwardRef(
            ({ children, ...props }: Record<string, unknown>, ref: React.Ref<Element>) => {
                const {
                    animate,
                    exit,
                    initial,
                    onAnimationComplete,
                    transition,
                    whileHover,
                    whileTap,
                    ...domProps
                } = props;
                return React.createElement(tag, { ...domProps, ref }, children);
            },
        );

    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) =>
            React.createElement(React.Fragment, null, children),
        motion: new Proxy(
            {},
            {
                get: (_target, prop: string) => createMotionComponent(prop),
            },
        ),
    };
});

describe("CardDebugModal", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    test("labels persisted FSRS due separately from Syro nextReview for new cards", () => {
        act(() => {
            root.render(
                React.createElement(CardDebugModal, {
                    isOpen: true,
                    onClose: () => undefined,
                    data: {
                        basic: {
                            ID: 255,
                            fileID: "f_g4sbsm",
                            itemType: "card",
                            deckName: "蝎子",
                            timesReviewed: 0,
                            timesCorrect: 0,
                            errorStreak: 0,
                            priority: 5,
                            queue: 0,
                            nextReview: 0,
                        },
                        data: {
                            due: "2026-05-01T20:14:34.935Z",
                            stability: 0,
                            difficulty: 0,
                            reps: 0,
                            lapses: 0,
                            state: 0,
                            elapsed_days: 0,
                        },
                    },
                }),
            );
        });

        const renderedText = container.textContent?.toLowerCase() ?? "";
        expect(renderedText).toContain("syro nextreview");
        expect(renderedText).toContain("fsrs due");
        expect(renderedText).not.toContain("next review");
    });
});
