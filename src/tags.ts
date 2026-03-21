/**
 * 这个文件主要是干什么的：
 * [逻辑] 标签处理辅助类。
 * 包含与 Obsidian 标签 (`#tag`) 相关的辅助函数，例如判断一个笔记是否包含复习标签，获取笔记的标签列表等。
 *
 * 它在项目中属于：逻辑层 (Logic) / 标签 (Tags)
 *
 * 它会用到哪些文件：
 * 1. Obsidian API
 * 2. src/settings.ts
 *
 * 哪些文件会用到它：
 * 1. src/reviewNote/review-note.ts
 * 2. src/main.ts
 */
/**
 * [工具] 标签处理。
 */
import { TFile, getAllTags } from "obsidian";
import { SRSettings } from "./settings";
import { DEFAULT_DECKNAME } from "./constants";
import { Iadapter } from "./dataStore/adapter";

export class Tags {
    static isDefaultDackName(tag: string) {
        return tag === DEFAULT_DECKNAME;
    }

    static getFileTags(note: TFile) {
        const fileCachedData = Iadapter.instance.metadataCache.getFileCache(note) || {};
        const tags = getAllTags(fileCachedData) || [];
        return tags;
    }

    /**
     * @param {string} fileTags
     * @param {string} settingTags
     * @return {string | null} tag | null
     */
    static getTagFromSettingTags(fileTags: string[], settingTags: string[]): string {
        for (const tagToReview of settingTags) {
            if (fileTags.some((tag) => tag === tagToReview || tag.startsWith(tagToReview + "/"))) {
                return tagToReview;
            }
        }
        return null;
    }

    /**
     * if deckName of a note is in tagsToReview, return true.
     * @param deckName
     * @returns boolean
     */
    static isTagedNoteDeckName(deckName: string, settings: SRSettings) {
        const dn = this.getTagFromSettingTags([deckName], settings.tagsToReview);
        if (dn !== null) {
            return true;
        }
        return false;
    }

    /**
     * select a tag in tags , which is also in tagsToReview. If not, return null.
     * @param tags tags from note file.
     * @returns
     */
    static getNoteDeckName(note: TFile, settings: SRSettings): string | null {
        const tags = this.getFileTags(note);
        const dn = this.getTagFromSettingTags(tags, settings.tagsToReview);
        return dn;
    }
}
