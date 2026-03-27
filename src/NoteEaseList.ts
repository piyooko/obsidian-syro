/**
 * 这个文件主要是干什么的：
 * 维护一个缓存列表，记录不同笔记路径对应的 Average Ease。
 * 这是一个辅助数据结构，用于快速查找某个文件的平均难度。
 *
 * 它在项目中属于：数据层 (Data Layer)
 *
 * 它会用到哪些文件：
 * 1. src/settings.ts
 *
 * 哪些文件会用到它：
 * 1. src/dataStore/data.ts (查询 Ease)
 * 2. src/main.ts (初始化和构建列表)
 */
import { SRSettings } from "./settings";
import { hasOwn } from "./util/typeGuards";

export interface INoteEaseList {
    hasEaseForPath(path: string): boolean;
    getEaseByPath(path: string): number | null;
    setEaseForPath(path: string, ease: number): void;
}

export class NoteEaseList implements INoteEaseList {
    settings: SRSettings;
    dict: Record<string, number> = {};

    constructor(settings: SRSettings) {
        this.settings = settings;
    }

    get baseEase() {
        return this.settings.weightedMultiplierSettings.baseEase;
    }

    hasEaseForPath(path: string): boolean {
        return hasOwn(this.dict, path);
    }

    getEaseByPath(path: string): number | null {
        let ease: number | null = null;
        if (this.hasEaseForPath(path)) {
            ease = Math.round(this.dict[path]);
        }
        return ease;
    }

    setEaseForPath(path: string, ease: number): void {
        if (this.hasEaseForPath(path)) {
            const currentEase = this.getEaseByPath(path);
            ease = ((currentEase ?? ease) + ease) / 2;
        }
        this.dict[path] = ease;
    }
}
