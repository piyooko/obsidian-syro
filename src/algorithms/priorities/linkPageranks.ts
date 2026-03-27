import { MetadataCache, TFile } from "obsidian";
import graph from "pagerank.js";
import { NoteEaseList } from "src/NoteEaseList";
import { SRSettings } from "src/settings";
import { Iadapter } from "src/dataStore/adapter";

export interface LinkStat {
    sourcePath: string;
    linkCount: number;
}

type BaseEaseSettings = {
    baseEase?: number;
};

export class LinkRank {
    settings: SRSettings;

    incomingLinks: Record<string, LinkStat[]> = {};
    metadataCache: MetadataCache;

    private _pageranks: Record<string, number> = {};

    constructor(settings: SRSettings, metadataCache: MetadataCache) {
        this.settings = settings;
        this.metadataCache = metadataCache;
        graph.reset();
    }

    get pageranks() {
        return this._pageranks;
    }

    readLinks(notes: TFile[]) {
        notes.map((note) => this._readLink(note));
        this.calcPageRanks();
    }

    /**
     * should be called after this.update(), or after looping notes.
     * @param note
     * @param easeByPath
     * @returns
     */
    getContribution(note: TFile, easeByPath: NoteEaseList) {
        console.debug("[SR Debug LinkRank] ===== getContribution called =====");
        console.debug("[SR Debug LinkRank] note.path:", note.path);
        console.debug(
            "[SR Debug LinkRank] weightedMultiplierSettings:",
            this.settings.weightedMultiplierSettings,
        );

        const algoSettings = this.settings.weightedMultiplierSettings as BaseEaseSettings;
        const baseEase = algoSettings.baseEase;
        console.debug("[SR Debug LinkRank] baseEase:", baseEase);

        if (baseEase === undefined || isNaN(baseEase)) {
            console.error("[SR Debug LinkRank] ERROR: baseEase is", baseEase);
            throw new Error(`baseEase is ${String(baseEase)} for weightedMultiplierSettings`);
        }

        let linkTotal = 0,
            linkPGTotal = 0,
            totalLinkCount = 0;

        for (const statObj of this.incomingLinks[note.path] || []) {
            const ease: number = easeByPath.getEaseByPath(statObj.sourcePath);
            if (ease) {
                linkTotal += statObj.linkCount * this._pageranks[statObj.sourcePath] * ease;
                linkPGTotal += this._pageranks[statObj.sourcePath] * statObj.linkCount;
                totalLinkCount += statObj.linkCount;
            }
        }

        const outgoingLinks = this.metadataCache.resolvedLinks[note.path] || {};
        for (const linkedFilePath in outgoingLinks) {
            const ease: number = easeByPath.getEaseByPath(linkedFilePath);
            if (ease) {
                const prank = outgoingLinks[linkedFilePath] * this._pageranks[linkedFilePath];
                linkTotal += prank * ease;
                linkPGTotal += prank;
                totalLinkCount += outgoingLinks[linkedFilePath];
            }
        }

        // fix: settings.maxLinkFactor will be used in three algorithm, but not show in settings.
        const linkContribution: number =
            this.settings.maxLinkFactor *
            Math.min(1.0, Math.log(totalLinkCount + 0.5) / Math.log(64));

        let ease: number = baseEase;
        ease =
            (1.0 - linkContribution) * baseEase +
            (totalLinkCount > 0
                ? (linkContribution * linkTotal) / linkPGTotal
                : linkContribution * baseEase);
        // add note's average flashcard ease if available
        if (Object.prototype.hasOwnProperty.call(easeByPath, note.path)) {
            ease = (ease + easeByPath.getEaseByPath(note.path)) / 2;
        }
        ease = Math.round(ease * 100) / 100;

        console.debug("[SR Debug LinkRank] Calculated ease:", ease);

        if (isNaN(ease)) {
            console.error("[SR Debug LinkRank] ERROR: Final ease is NaN!");
            console.error("[SR Debug LinkRank] linkContribution:", linkContribution);
            console.error("[SR Debug LinkRank] linkTotal:", linkTotal);
            console.error("[SR Debug LinkRank] linkPGTotal:", linkPGTotal);
            console.error("[SR Debug LinkRank] totalLinkCount:", totalLinkCount);
            throw new Error("ease: NaN.");
        }

        return {
            linkContribution,
            totalLinkCount,
            linkTotal,
            linkPGTotal,
            ease,
        };
    }

    /**
     * just get single note links.
     * @param noteFile
     * @returns
     */
    _readLink(noteFile: TFile) {
        if (this.incomingLinks[noteFile.path] === undefined) {
            this.incomingLinks[noteFile.path] = [];
        }

        const links = Iadapter.instance.metadataCache.resolvedLinks[noteFile.path] || {};
        for (const targetPath in links) {
            if (this.incomingLinks[targetPath] === undefined) this.incomingLinks[targetPath] = [];

            // markdown files only
            if (targetPath.split(".").pop().toLowerCase() === "md") {
                this.incomingLinks[targetPath].push({
                    sourcePath: noteFile.path,
                    linkCount: links[targetPath],
                });

                graph.link(noteFile.path, targetPath, links[targetPath]);
            }
        }
        return this.incomingLinks;
    }

    calcPageRanks() {
        graph.rank(0.85, 0.000001, (node: string, rank: number) => {
            this._pageranks[node] = rank * 10000;
        });
    }
}
