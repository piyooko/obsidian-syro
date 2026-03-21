/**
 * Right-top sync progress tip styled to feel close to Obsidian notices.
 * Only shows text plus a progress bar, without any animated icon.
 */
export class SyncProgressTip {
    private containerEl: HTMLElement;
    private fillEl: HTMLElement;
    private countsEl: HTMLElement;
    private titleEl: HTMLElement;

    constructor(initialTitle: string = "正在同步...") {
        this.buildDOM(initialTitle);
    }

    private buildDOM(title: string) {
        this.containerEl = document.body.createDiv({ cls: "sr-sync-tip-container notice" });

        const header = this.containerEl.createDiv({ cls: "sr-sync-tip-header" });
        this.titleEl = header.createDiv({ cls: "sr-sync-tip-title", text: title });
        this.countsEl = header.createSpan({ cls: "sr-sync-tip-counts", text: "0 / 0" });

        const track = this.containerEl.createDiv({ cls: "sr-sync-tip-progress-track" });
        this.fillEl = track.createDiv({ cls: "sr-sync-tip-progress-fill" });
    }

    public show() {
        this.containerEl.offsetWidth;
        this.containerEl.addClass("is-visible");
    }

    public update(current: number, total: number, message?: string) {
        this.countsEl.innerText = `${current} / ${total}`;

        if (message) {
            this.titleEl.innerText = message;
        }

        const percentage = total === 0 ? 0 : Math.min(100, Math.max(0, (current / total) * 100));
        this.fillEl.style.width = `${percentage}%`;
    }

    public hide(delayMs: number = 800) {
        this.containerEl.addClass("is-complete");
        this.titleEl.innerText = "同步完成";

        setTimeout(() => {
            this.containerEl.removeClass("is-visible");
            setTimeout(() => {
                this.containerEl.remove();
            }, 300);
        }, delayMs);
    }
}
