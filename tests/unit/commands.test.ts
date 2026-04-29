jest.mock("src/dataStore/queue", () => ({
    Queue: {
        getInstance: jest.fn(() => ({
            buildQueue: jest.fn(),
        })),
    },
}));

import Commands from "src/commands";

describe("Commands", () => {
    test("registers the review edit-mode toggle command with an Obsidian hotkey", () => {
        const addCommand = jest.fn();
        const requestToggleReviewEditMode = jest.fn(() => true);
        const plugin: Record<string, unknown> = {
            addCommand,
            app: {
                workspace: {
                    getActiveFile: jest.fn(),
                },
            },
            data: { settings: {} },
            guardSyroDataReady: jest.fn(),
            isSyroDataReady: jest.fn(() => false),
            noteReviewStore: null,
            requestSync: jest.fn(),
            requestToggleReviewEditMode,
            store: null,
            syncLock: false,
        };

        new Commands(plugin as never).addCommands();

        const command = addCommand.mock.calls
            .map(([registered]) => registered)
            .find((registered) => registered.id === "srs-toggle-review-edit-mode");
        expect(command).toMatchObject({
            id: "srs-toggle-review-edit-mode",
            hotkeys: [{ modifiers: ["Alt"], key: "E" }],
        });

        command.callback();

        expect(requestToggleReviewEditMode).toHaveBeenCalledTimes(1);
    });
});
