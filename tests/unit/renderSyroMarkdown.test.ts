import { renderSyroMarkdownToElement } from "src/ui/markdown/renderSyroMarkdown";

describe("renderSyroMarkdownToElement", () => {
    test("uses the markdown renderer and hydrates Syro markers inside rendered output", async () => {
        const target = document.createElement("div");
        const encoded = encodeURIComponent("hidden answer");
        const renderMarkdown = jest.fn((content: string, el: HTMLElement) => {
            el.innerHTML = content.includes("| A | B |")
                ? `<table><tbody><tr><td>A</td><td>««SR_H:${encoded}»»</td></tr></tbody></table>`
                : content.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        });

        await renderSyroMarkdownToElement({
            markdown: `| A | B |\n| - | - |\n| 1 | ««SR_H:${encoded}»» |`,
            renderMarkdown,
            target,
        });

        expect(renderMarkdown).toHaveBeenCalled();
        expect(target.querySelector("table")).not.toBeNull();
        expect(target.querySelector(".sr-cloze-hidden")?.textContent).toBe("hidden answer");
        expect(target.textContent).not.toContain("SR_H");
    });

    test("falls back to readable text when no renderer is supplied", async () => {
        const target = document.createElement("div");

        await renderSyroMarkdownToElement({
            markdown: "front ««SR_H:hidden»»",
            target,
        });

        expect(target.textContent).toBe("front [...]");
    });
});
