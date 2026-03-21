/* eslint-disable @typescript-eslint/no-explicit-any */
import { App, MarkdownRenderer, Modal, Notice, moment, request } from "obsidian";
import { errorlog, isVersionNewerThanOther } from "src/util/utils_recall";
import SRPlugin from "src/main";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import README from "README.md";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import README_ZH from "docs/README_ZH.md";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import RELEASE_CHANGELOG from "docs/docs/changelog.md";

const local = moment.locale();
const README_LOC = local === "zh-cn" || local === "zh-tw" ? README_ZH : README;
const CHANGELOG_SECTIONS = RELEASE_CHANGELOG.match(/## \[(?:.|\r?\n)*?(?=\r?\n## \[|$)/gm) ?? [];

let PLUGIN_VERSION: string;

function extractBeforeHeading(source: string, heading: string): string {
    const idx = source.indexOf(heading);
    return (idx >= 0 ? source.slice(0, idx) : source).trim();
}

function extractIntro(source: string): string {
    const match = source.match(/^([\s\S]*?)(?=\r?\n## )/m);
    return (match?.[1] ?? source).trim();
}

export class ReleaseNotes extends Modal {
    private plugin: SRPlugin;
    private version: string;
    private name: string;

    constructor(app: App, plugin: SRPlugin, version: string) {
        super(app);
        this.plugin = plugin;
        this.version = version;
        PLUGIN_VERSION = plugin.manifest.version;
        this.name = "Syro";
    }

    onOpen(): void {
        this.containerEl.classList.add(`${this.name}-release`);
        this.titleEl.setText(`Welcome to ${this.name} ${this.version ?? ""}`);
        this.createForm();
    }

    async onClose() {
        this.contentEl.empty();
        this.plugin.data.settings.previousRelease = PLUGIN_VERSION;
        await this.plugin.savePluginData();
    }

    createForm() {
        const stopHeading =
            local === "zh-cn" || local === "zh-tw" ? "\n## 安装" : "\n## Installation";
        const firstRun = extractBeforeHeading(README_LOC, stopHeading);
        let intro = extractIntro(firstRun);

        let prevRelease = this.plugin.data.settings.previousRelease;
        prevRelease = this.version === prevRelease ? "0.0.0" : prevRelease;

        let message = this.version
            ? CHANGELOG_SECTIONS.filter((value: string) => {
                  const ver = value.match(/(?:##\s+\[)([\d\w.]+)(?:\s|\])/m)?.[1];
                  return !!ver && isVersionNewerThanOther(ver, prevRelease);
              })
                  .slice(0, 10)
                  .join("\n\n---\n")
            : "";

        intro = this.version ? intro : firstRun;
        message = this.version && message ? `## What's New:\n---\n${message}` : message;

        MarkdownRenderer.render(this.plugin.app, intro, this.contentEl, "", this.plugin);
        if (message) {
            MarkdownRenderer.render(this.plugin.app, message, this.contentEl, "", this.plugin);
        }

        this.contentEl.createEl("p", { text: "" }, (el) => {
            el.style.textAlign = "right";
            const bOk = el.createEl("button", { text: "Close" });
            bOk.onclick = () => this.close();
        });
    }

    async getReleaseNote(): Promise<any[]> {
        const releaseUrl =
            "https://api.github.com/repos/piyooko/obsidian-syro/releases?per_page=5&page=1";

        let latestVersionInfo = null;
        try {
            const gitAPIrequest = async (url: string) => {
                return JSON.parse(
                    await request({
                        url,
                    }),
                );
            };

            latestVersionInfo = (await gitAPIrequest(releaseUrl))
                .map((el: any) => {
                    return {
                        version: el.tag_name,
                        published: new Date(el.published_at),
                        note: el.body,
                    };
                })
                .filter((el: any) => el.version.match(/^[\d.]+$/))
                .sort((el1: any, el2: any) => el2.published - el1.published);

            const latestVersion = latestVersionInfo[0]?.version;

            if (latestVersion && isVersionNewerThanOther(latestVersion, PLUGIN_VERSION)) {
                new Notice(
                    `A newer version of Syro is available in BRAT Plugins.\n\nYou are using ${PLUGIN_VERSION}.\nThe latest is ${latestVersion}`,
                );
            }
        } catch (e) {
            errorlog({ where: "Utils/checkVersion", error: e });
        }
        return latestVersionInfo;
    }
}
