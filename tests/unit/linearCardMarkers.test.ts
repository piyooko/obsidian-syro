import {
    postProcessMarkers,
    preTokenizeSrMarkers,
    toFallbackText,
} from "src/ui/components/linearCardMarkers";

async function mockRenderMarkdown(content: string, el: HTMLElement): Promise<void> {
    const html = content
        .replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            (_match, label: string, href: string) => `<a href="${href}">${label}</a>`,
        )
        .replace(/`([^`]+)`/g, (_match, code: string) => `<code>${code}</code>`)
        .replace(/\*\*([^*]+)\*\*/g, (_match, bold: string) => `<strong>${bold}</strong>`);

    el.innerHTML = html;
}

describe("linearCardMarkers", () => {
    test("renders markdown inside shown markers instead of leaking SR_S", async () => {
        const container = document.createElement("div");
        container.textContent =
            "Answer: \u00ab\u00abSR_S:%2A%2Abold%2A%2A%20%5Blink%5D(https%3A%2F%2Fexample.com)%20%60code%60\u00bb\u00bb";

        await postProcessMarkers(container, mockRenderMarkdown);

        const shown = container.querySelector(".sr-cloze-shown");
        expect(shown).not.toBeNull();
        expect(shown?.querySelector("strong")?.textContent).toBe("bold");
        expect(shown?.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
        expect(shown?.querySelector("code")?.textContent).toBe("code");
        expect(container.textContent).not.toContain("SR_S:");
    });

    test("renders markdown inside unified answer markers", async () => {
        const container = document.createElement("div");
        const payload = `${encodeURIComponent("[...]")}:${encodeURIComponent("**bold** [link](https://example.com)")}`;
        container.textContent = `Front: \u00ab\u00abSR_C:${payload}\u00bb\u00bb`;

        await postProcessMarkers(container, mockRenderMarkdown);

        const placeholder = container.querySelector(".sr-cloze-placeholder");
        const answer = container.querySelector(".sr-cloze-answer");
        expect(placeholder?.textContent).toBe("[...]");
        expect(answer?.querySelector("strong")?.textContent).toBe("bold");
        expect(answer?.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
        expect(container.textContent).not.toContain("SR_C:");
    });

    test("fallback text removes internal markers", () => {
        const fallback = toFallbackText(
            `Question \u00ab\u00abSR_H:${encodeURIComponent("[...]")}\u00bb\u00bb Answer \u00ab\u00abSR_S:${encodeURIComponent("**bold**")}\u00bb\u00bb`,
        );

        expect(fallback).toBe("Question [...] Answer **bold**");
        expect(fallback).not.toContain("SR_");
    });

    test("fallback text also accepts legacy mojibake markers", () => {
        const fallback = toFallbackText(
            `Question \u82a6\u82a6SR_H:${encodeURIComponent("[...]")}\u7984\u7984 Answer \u82a6\u82a6SR_C:${encodeURIComponent("[...]")}:${encodeURIComponent("text")}\u7984\u7984`,
        );

        expect(fallback).toBe("Question [...] Answer [...]");
        expect(fallback).not.toContain("SR_");
    });

    test("fallback text can show the active answer immediately on the back side", () => {
        const fallback = toFallbackText(
            `Front \u00ab\u00abSR_C:${encodeURIComponent("[...]")}:${encodeURIComponent("**answer**")}\u00bb\u00bb`,
            { showAnswer: true },
        );

        expect(fallback).toBe("Front **answer**");
    });

    test("pre-tokenizes unified markers outside math and code before markdown render", () => {
        const payload = `${encodeURIComponent("[...]")}:${encodeURIComponent("$x^2$ and **bold**")}`;
        const tokenized = preTokenizeSrMarkers(`Lead \u00ab\u00abSR_C:${payload}\u00bb\u00bb tail`);

        expect(tokenized.tokens).toHaveLength(1);
        expect(tokenized.tokens[0]).toMatchObject({
            type: "C",
            placeholderText: "[...]",
            answerText: "$x^2$ and **bold**",
        });
        expect(tokenized.content).toContain(tokenized.tokens[0].sentinel);
        expect(tokenized.content).not.toContain("SR_C:");
    });

    test("lets surrounding markdown wrap a sentinel before the cloze DOM is restored", async () => {
        const payload = `${encodeURIComponent("[...]")}:${encodeURIComponent("answer**")}`;
        const tokenized = preTokenizeSrMarkers(
            `**Lead \u00ab\u00abSR_C:${payload}\u00bb\u00bb tail`,
        );
        const container = document.createElement("div");

        await mockRenderMarkdown(tokenized.content, container);
        await postProcessMarkers(container, mockRenderMarkdown, tokenized.tokens);

        const strong = container.querySelector("strong");
        expect(strong).not.toBeNull();
        expect(strong?.querySelector(".sr-cloze-wrapper")).not.toBeNull();
        expect(strong?.querySelector(".sr-cloze-answer")?.textContent).toBe("answer");
        expect(container.textContent).not.toContain("SR_SENTINEL_");
        expect(container.textContent).not.toContain("SR_C:");
    });

    test("does not pre-tokenize markers inside math or code contexts", () => {
        const shown = encodeURIComponent("answer");
        const unified = `${encodeURIComponent("[...]")}:${encodeURIComponent("$x^2$")}`;
        const tokenized = preTokenizeSrMarkers(
            `Math $\u00ab\u00abSR_C:${unified}\u00bb\u00bb$ \`\u00ab\u00abSR_S:${shown}\u00bb\u00bb\` Plain \u00ab\u00abSR_S:${shown}\u00bb\u00bb`,
        );

        expect(tokenized.content).toContain("$\u00ab\u00abSR_C:");
        expect(tokenized.content).toContain("`\u00ab\u00abSR_S:");
        expect(tokenized.tokens).toHaveLength(1);
        expect(tokenized.tokens[0].type).toBe("S");
        expect(tokenized.content).toContain(tokenized.tokens[0].sentinel);
    });
});
