import { App, Component, MarkdownRenderer, Modal, Notice, moment, request } from "obsidian";
import { errorlog, isVersionNewerThanOther } from "src/util/utils_recall";
import SRPlugin from "src/main";
import README from "README.md";
import README_ZH from "docs/README_ZH.md";
import RELEASE_CHANGELOG from "docs/docs/changelog.md";

const local = moment.locale();
const README_LOC = local === "zh-cn" || local === "zh-tw" ? README_ZH : README;
const CHANGELOG_SECTIONS = RELEASE_CHANGELOG.match(/## \[(?:.|\r?\n)*?(?=\r?\n## \[|$)/gm) ?? [];

let PLUGIN_VERSION: string;

interface GitHubRelease {
    tag_name: string;
    published_at: string;
    body: string;
}

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
    private readonly markdownOwner: Component;

    constructor(app: App, plugin: SRPlugin, version: string) {
        super(app);
        this.plugin = plugin;
        this.version = version;
        PLUGIN_VERSION = plugin.manifest.version;
        this.name = "Syro";
        this.markdownOwner = new Component();
        this.markdownOwner.load();
    }

    onOpen(): void {
        this.containerEl.classList.add(`${this.name}-release`);
        this.titleEl.setText(`Welcome to ${this.name} ${this.version ?? ""}`);
        this.createForm();
    }

    onClose(): void {
        this.contentEl.empty();
        this.markdownOwner.unload();
        this.plugin.data.settings.previousRelease = PLUGIN_VERSION;
        void this.plugin.savePluginData();
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

        void MarkdownRenderer.render(this.plugin.app, intro, this.contentEl, "", this.markdownOwner);
        if (message) {
            void MarkdownRenderer.render(this.plugin.app, message, this.contentEl, "", this.markdownOwner);
        }

        this.contentEl.createEl("p", { text: "" }, (el) => {
            el.addClass("syro-release-notes-actions");
            const bOk = el.createEl("button", { text: "Close" });
            bOk.onclick = () => this.close();
        });
    }

    async getReleaseNote(): Promise<Array<{ version: string; published: Date; note: string }>> {
        const releaseUrl = "https://api.github.com/repos/baddoor/Syro/releases?per_page=5&page=1";

        let latestVersionInfo: Array<{ version: string; published: Date; note: string }> = [];
        try {
            const gitAPIrequest = async (url: string): Promise<GitHubRelease[]> => {
                return JSON.parse(
                    await request({
                        url,
                    }),
                ) as GitHubRelease[];
            };

            latestVersionInfo = (await gitAPIrequest(releaseUrl))
                .map((release: GitHubRelease) => {
                    return {
                        version: release.tag_name,
                        published: new Date(release.published_at),
                        note: release.body,
                    };
                })
                .filter((release) => release.version.match(/^[\d.]+$/))
                .sort((left, right) => right.published.getTime() - left.published.getTime());

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
