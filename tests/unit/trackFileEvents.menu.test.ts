import { TFile } from "obsidian";
import { addFileMenuEvt } from "src/Events/trackFileEvents";
import { t } from "src/lang/helpers";

class FakeMenuItem {
    title = "";
    icon = "";
    checked = false;
    submenu = new FakeMenu();
    callback: (() => Promise<void> | void) | null = null;

    setTitle(title: string): this {
        this.title = title;
        return this;
    }

    setIcon(icon: string): this {
        this.icon = icon;
        return this;
    }

    setChecked(checked: boolean): this {
        this.checked = checked;
        return this;
    }

    setSubmenu(): FakeMenu {
        return this.submenu;
    }

    onClick(callback: () => Promise<void> | void): this {
        this.callback = callback;
        return this;
    }
}

class FakeMenu {
    items: Array<FakeMenuItem | { separator: true }> = [];

    addItem(callback: (item: FakeMenuItem) => void): this {
        const item = new FakeMenuItem();
        this.items.push(item);
        callback(item);
        return this;
    }

    addSeparator(): this {
        this.items.push({ separator: true });
        return this;
    }
}

function createMarkdownFile(path = "摘录测试.md"): TFile {
    return Object.assign(new TFile(), {
        path,
        name: path,
        basename: path.replace(/\.md$/, ""),
        extension: "md",
    });
}

describe("trackFileEvents auto extract menu", () => {
    test("shows all-heading item before H1-H6 with checked state", async () => {
        const file = createMarkdownFile();
        const plugin = {
            isSyroDataReady: jest.fn(() => true),
            noteReviewStore: { isTracked: jest.fn(() => false) },
            getAutoExtractRuleForPath: jest.fn(() => ({
                sourcePath: file.path,
                rule: "heading",
                headingLevels: [1, 2, 3, 4, 5, 6],
                allHeadingLevels: true,
                enabled: true,
                createdAt: 1,
                updatedAt: 1,
            })),
            hasAutoExtractRuleForFile: jest.fn(() => true),
            setAutoExtractAllHeadings: jest.fn(() => Promise.resolve()),
            setAutoExtractHeadingLevel: jest.fn(() => Promise.resolve()),
            disableAutoExtractRule: jest.fn(() => Promise.resolve(true)),
        };
        const menu = new FakeMenu();

        addFileMenuEvt(plugin as any, menu as any, file);

        const rootItem = menu.items.find(
            (item): item is FakeMenuItem =>
                item instanceof FakeMenuItem && item.title === t("AUTO_EXTRACT_MENU_TITLE"),
        );
        expect(rootItem).toBeDefined();
        const submenuItems = rootItem!.submenu.items.filter(
            (item): item is FakeMenuItem => item instanceof FakeMenuItem,
        );
        expect(submenuItems.slice(0, 7).map((item) => item.title)).toEqual([
            t("AUTO_EXTRACT_ALL_HEADINGS"),
            t("AUTO_EXTRACT_BY_HEADING_LEVEL", { level: 1 }),
            t("AUTO_EXTRACT_BY_HEADING_LEVEL", { level: 2 }),
            t("AUTO_EXTRACT_BY_HEADING_LEVEL", { level: 3 }),
            t("AUTO_EXTRACT_BY_HEADING_LEVEL", { level: 4 }),
            t("AUTO_EXTRACT_BY_HEADING_LEVEL", { level: 5 }),
            t("AUTO_EXTRACT_BY_HEADING_LEVEL", { level: 6 }),
        ]);
        expect(submenuItems.slice(0, 7).every((item) => item.checked)).toBe(true);

        await submenuItems[3].callback?.();

        expect(plugin.setAutoExtractHeadingLevel).toHaveBeenCalledWith(file, 3, false);
    });

    test("single heading level menu click enables that level", async () => {
        const file = createMarkdownFile();
        const plugin = {
            isSyroDataReady: jest.fn(() => true),
            noteReviewStore: { isTracked: jest.fn(() => false) },
            getAutoExtractRuleForPath: jest.fn(() => null),
            hasAutoExtractRuleForFile: jest.fn(() => false),
            setAutoExtractAllHeadings: jest.fn(() => Promise.resolve()),
            setAutoExtractHeadingLevel: jest.fn(() => Promise.resolve()),
            disableAutoExtractRule: jest.fn(() => Promise.resolve(true)),
        };
        const menu = new FakeMenu();

        addFileMenuEvt(plugin as any, menu as any, file);

        const rootItem = menu.items.find(
            (item): item is FakeMenuItem =>
                item instanceof FakeMenuItem && item.title === t("AUTO_EXTRACT_MENU_TITLE"),
        );
        const h2Item = rootItem!.submenu.items.filter(
            (item): item is FakeMenuItem => item instanceof FakeMenuItem,
        )[2];

        await h2Item.callback?.();

        expect(plugin.setAutoExtractHeadingLevel).toHaveBeenCalledWith(file, 2, true);
    });
});
