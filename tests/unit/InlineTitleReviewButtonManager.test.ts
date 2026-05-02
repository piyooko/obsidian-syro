import { InlineTitleReviewButtonManager } from "src/ui/components/InlineTitleReviewButtonManager";
import { MarkdownView, TFile, WorkspaceLeaf } from "obsidian";

function createDeferredStats() {
    let resolve: (value: { reviewableCount: number; totalCount: number }) => void = () => {};
    const promise = new Promise<{ reviewableCount: number; totalCount: number }>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

describe("InlineTitleReviewButtonManager", () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("refreshes when extracts are updated", () => {
        const plugin = {
            app: {
                workspace: {
                    on: jest.fn(() => ({})),
                    getLeavesOfType: jest.fn(() => []),
                },
                vault: {
                    on: jest.fn(() => ({})),
                },
            },
            register: jest.fn(),
            registerEvent: jest.fn(),
            syncEvents: {
                on: jest.fn(() => jest.fn()),
            },
        };
        const manager = new InlineTitleReviewButtonManager(plugin as never);

        manager.register();

        expect(plugin.syncEvents.on).toHaveBeenCalledWith("extracts-updated", expect.any(Function));
        manager.destroy();
    });

    test("updates the inline title count from async note-local stats", async () => {
        const file = Object.assign(new TFile(), {
            path: "Syro 侧边栏复习教程.md",
            extension: "md",
        });
        const containerEl = document.createElement("div");
        containerEl.className = "markdown-source-view";
        Object.defineProperty(containerEl, "offsetWidth", {
            configurable: true,
            value: 100,
        });
        const titleParentEl = document.createElement("div");
        const inlineTitleEl = document.createElement("div");
        inlineTitleEl.className = "inline-title";
        inlineTitleEl.textContent = "Syro 侧边栏复习教程";
        titleParentEl.appendChild(inlineTitleEl);
        containerEl.appendChild(titleParentEl);
        document.body.appendChild(containerEl);

        const leaf = new WorkspaceLeaf();
        const view = new MarkdownView(leaf);
        view.file = file;
        view.containerEl = containerEl;
        Object.assign(leaf, { view });
        const plugin = {
            app: {
                workspace: {
                    on: jest.fn(() => ({})),
                    getLeavesOfType: jest.fn(() => [leaf]),
                    trigger: jest.fn(),
                },
                vault: {
                    on: jest.fn(() => ({})),
                },
            },
            register: jest.fn(),
            registerEvent: jest.fn(),
            syncEvents: {
                on: jest.fn(() => jest.fn()),
            },
            getReadonlyNoteLocalCardStats: jest.fn(() =>
                Promise.resolve({
                    reviewableCount: 1,
                    totalCount: 3,
                }),
            ),
            openFlashcardsInNoteReview: jest.fn(() => Promise.resolve()),
            buildInlineTitleCardMenu: jest.fn(),
        };
        const manager = new InlineTitleReviewButtonManager(plugin as never);

        try {
            manager.register();

            jest.advanceTimersByTime(0);
            await Promise.resolve();

            expect(plugin.getReadonlyNoteLocalCardStats).toHaveBeenCalledWith(file);
            expect(
                containerEl.querySelector(".syro-inline-title-progress-count")?.textContent,
            ).toBe("1/3");
        } finally {
            manager.destroy();
            containerEl.remove();
        }
    });

    test("ignores stale async note-local stats after the mounted file changes", async () => {
        const firstFile = Object.assign(new TFile(), {
            path: "旧笔记.md",
            extension: "md",
        });
        const secondFile = Object.assign(new TFile(), {
            path: "新笔记.md",
            extension: "md",
        });
        const containerEl = document.createElement("div");
        containerEl.className = "markdown-source-view";
        Object.defineProperty(containerEl, "offsetWidth", {
            configurable: true,
            value: 100,
        });
        const titleParentEl = document.createElement("div");
        const inlineTitleEl = document.createElement("div");
        inlineTitleEl.className = "inline-title";
        inlineTitleEl.textContent = "旧笔记";
        titleParentEl.appendChild(inlineTitleEl);
        containerEl.appendChild(titleParentEl);
        document.body.appendChild(containerEl);

        const leaf = new WorkspaceLeaf();
        const view = new MarkdownView(leaf);
        view.file = firstFile;
        view.containerEl = containerEl;
        Object.assign(leaf, { view });
        const firstStats = createDeferredStats();
        const secondStats = createDeferredStats();
        const plugin = {
            app: {
                workspace: {
                    on: jest.fn(() => ({})),
                    getLeavesOfType: jest.fn(() => [leaf]),
                    trigger: jest.fn(),
                },
                vault: {
                    on: jest.fn(() => ({})),
                },
            },
            register: jest.fn(),
            registerEvent: jest.fn(),
            syncEvents: {
                on: jest.fn(() => jest.fn()),
            },
            getReadonlyNoteLocalCardStats: jest
                .fn()
                .mockReturnValueOnce(firstStats.promise)
                .mockReturnValueOnce(secondStats.promise),
            openFlashcardsInNoteReview: jest.fn(() => Promise.resolve()),
            buildInlineTitleCardMenu: jest.fn(),
        };
        const manager = new InlineTitleReviewButtonManager(plugin as never);

        try {
            manager.register();
            jest.advanceTimersByTime(0);
            await Promise.resolve();

            view.file = secondFile;
            manager.refresh();
            jest.advanceTimersByTime(0);
            await Promise.resolve();

            secondStats.resolve({ reviewableCount: 1, totalCount: 3 });
            await Promise.resolve();
            await Promise.resolve();
            expect(
                containerEl.querySelector(".syro-inline-title-progress-count")?.textContent,
            ).toBe("1/3");

            firstStats.resolve({ reviewableCount: 9, totalCount: 9 });
            await Promise.resolve();
            await Promise.resolve();
            expect(
                containerEl.querySelector(".syro-inline-title-progress-count")?.textContent,
            ).toBe("1/3");
        } finally {
            manager.destroy();
            containerEl.remove();
        }
    });

    test("stops inline title context menu from bubbling to the Obsidian file header", async () => {
        const file = Object.assign(new TFile(), {
            path: "菜单测试.md",
            extension: "md",
        });
        const containerEl = document.createElement("div");
        containerEl.className = "markdown-source-view";
        Object.defineProperty(containerEl, "offsetWidth", {
            configurable: true,
            value: 100,
        });
        const titleParentEl = document.createElement("div");
        const inlineTitleEl = document.createElement("div");
        inlineTitleEl.className = "inline-title";
        inlineTitleEl.textContent = "菜单测试";
        titleParentEl.appendChild(inlineTitleEl);
        containerEl.appendChild(titleParentEl);
        document.body.appendChild(containerEl);

        const leaf = new WorkspaceLeaf();
        const view = new MarkdownView(leaf);
        view.file = file;
        view.containerEl = containerEl;
        Object.assign(leaf, { view });
        const menu = {
            showAtMouseEvent: jest.fn(),
            showAtPosition: jest.fn(),
        };
        const plugin = {
            app: {
                workspace: {
                    on: jest.fn(() => ({})),
                    getLeavesOfType: jest.fn(() => [leaf]),
                    trigger: jest.fn(),
                },
                vault: {
                    on: jest.fn(() => ({})),
                },
            },
            register: jest.fn(),
            registerEvent: jest.fn(),
            syncEvents: {
                on: jest.fn(() => jest.fn()),
            },
            getReadonlyNoteLocalCardStats: jest.fn(() =>
                Promise.resolve({
                    reviewableCount: 0,
                    totalCount: 0,
                }),
            ),
            openFlashcardsInNoteReview: jest.fn(() => Promise.resolve()),
            buildInlineTitleCardMenu: jest.fn(() => menu),
        };
        const manager = new InlineTitleReviewButtonManager(plugin as never);

        try {
            manager.register();
            jest.advanceTimersByTime(0);
            await Promise.resolve();

            const groupEl = containerEl.querySelector(".syro-inline-title-progress");
            expect(groupEl).toBeInstanceOf(HTMLElement);

            const contextEvent = new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
            });
            const stopPropagation = jest.fn();
            Object.defineProperty(contextEvent, "stopPropagation", {
                configurable: true,
                value: stopPropagation,
            });

            groupEl!.dispatchEvent(contextEvent);

            expect(contextEvent.defaultPrevented).toBe(true);
            expect(stopPropagation).toHaveBeenCalled();
            expect(menu.showAtMouseEvent).toHaveBeenCalledWith(contextEvent);
        } finally {
            manager.destroy();
            containerEl.remove();
        }
    });
});
