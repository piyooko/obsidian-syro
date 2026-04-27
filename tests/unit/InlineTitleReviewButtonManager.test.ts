import { InlineTitleReviewButtonManager } from "src/ui/components/InlineTitleReviewButtonManager";

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

        expect(plugin.syncEvents.on).toHaveBeenCalledWith(
            "extracts-updated",
            expect.any(Function),
        );
        manager.destroy();
    });
});
