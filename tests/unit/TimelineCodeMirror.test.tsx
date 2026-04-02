/** @jsxImportSource react */

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { TimelineCodeMirror } from "src/ui/components/TimelineCodeMirror";

jest.mock("obsidian", () => ({
    App: class App {},
}));

jest.mock("src/ui/timeline/timelineLivePreview", () => ({
    createTimelineLivePreviewExtensions: () => [],
}));

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TimelineCodeMirror", () => {
    it("renders a custom placeholder without CodeMirror widget buffers", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const placeholder = "提交复习记录，并记录当前光标位置";

        await act(async () => {
            root.render(
                <TimelineCodeMirror
                    app={{} as never}
                    value=""
                    onChange={jest.fn()}
                    placeholder={placeholder}
                    enableDurationPrefixSyntax={true}
                />,
            );
        });

        expect(container.querySelector(".sr-timeline-editor-placeholder")?.textContent).toBe(
            placeholder,
        );
        expect(container.querySelector(".cm-widgetBuffer")).toBeNull();
        expect(container.querySelector(".cm-content")?.getAttribute("aria-placeholder")).toBe(
            placeholder,
        );

        await act(async () => {
            root.render(
                <TimelineCodeMirror
                    app={{} as never}
                    value="已有内容"
                    onChange={jest.fn()}
                    placeholder={placeholder}
                    enableDurationPrefixSyntax={true}
                />,
            );
        });

        expect(container.querySelector(".sr-timeline-editor-placeholder")).toBeNull();
        expect(container.querySelector(".cm-widgetBuffer")).toBeNull();

        await act(async () => {
            root.unmount();
        });

        container.remove();
    });
});
