/**
 * 这个文件主要是干什么的：
 * 管理每个笔记的"提交信息"记录。
 * 用户可以在侧边栏底部的抽屉里，给某个笔记写一段文字记录（类似 Git commit message），
 * 用来追踪自己什么时间复习了、有什么想法或心得。
 * 这些记录会按照时间线展示，方便回顾自己的学习历程。
 *
 * 所有数据以独立的 JSON 文件（review_commits.json）存储，
 * 和主数据文件 tracked_files.json 放在同一个目录下。
 *
 * 它在项目中属于：数据层
 *
 * 它会用到哪些文件：
 * 1. src/dataStore/dataLocation.ts — 获取存储路径
 * 2. src/settings.ts — 读取存储位置设置
 * 3. src/dataStore/adapter.ts — 使用 Obsidian 文件适配器读写文件
 *
 * 哪些文件会用到它：
 * 1. src/ui/views/ReactNoteReviewView.tsx — 桥接层调用它来读写提交记录
 */

import { Iadapter } from "./adapter";
import { getStorePath } from "./dataLocation";
import { SRSettings } from "src/settings";
import type { TimelineReviewResponse } from "src/ui/timeline/reviewResponseTimeline";
import type { TimelineDisplayDuration } from "src/ui/timeline/timelineMessage";

/**
 * 单条提交记录
 */
export interface ReviewCommitLog {
    /** 唯一标识（时间戳字符串） */
    id: string;
    /** 提交信息正文（支持多行） */
    message: string;
    /** 提交时间（Unix 毫秒时间戳） */
    timestamp: number;
    /** 最后编辑时间（Unix 毫秒时间戳，可选） */
    lastEdited?: number;
    /** 光标上下文锚点（可选） */
    contextAnchor?: {
        /** 光标前后的文本快照 */
        textSnippet: string;
        /** 光标在快照中的相对位置 */
        offset: number;
    };
    /** 滚动百分比（0-1，可选） */
    scrollPercentage?: number;
    entryType?: "manual" | "review-response";
    reviewResponse?: TimelineReviewResponse;
    displayDuration?: TimelineDisplayDuration;
}

/**
 * 所有笔记的提交记录集合
 * key = 笔记文件路径, value = 该文件的提交记录数组（按时间倒序）
 */
export interface ReviewCommitData {
    [filePath: string]: ReviewCommitLog[];
}

/**
 * 提交记录的数据管理器
 * 负责读写 review_commits.json 文件
 */
export class ReviewCommitStore {
    private data: ReviewCommitData = {};
    private dataPath: string;

    constructor(settings: SRSettings, manifestDir: string) {
        // 复用 DataStore 的路径逻辑，把文件名替换为 review_commits.json
        const trackedPath = getStorePath(manifestDir, settings);
        const lastSlash = trackedPath.lastIndexOf("/");
        const dir = lastSlash >= 0 ? trackedPath.substring(0, lastSlash + 1) : "./";
        this.dataPath = dir + "review_commits.json";
    }

    /**
     * 从 JSON 文件加载数据
     */
    async load(): Promise<void> {
        try {
            const adapter = Iadapter.instance.adapter;
            if (await adapter.exists(this.dataPath)) {
                const raw = await adapter.read(this.dataPath);
                if (raw) {
                    this.data = JSON.parse(raw);
                }
            }
        } catch (error) {
            console.log("[ReviewCommitStore] 加载失败，使用空数据:", error);
            this.data = {};
        }
    }

    /**
     * 将数据写入 JSON 文件
     */
    async save(): Promise<void> {
        try {
            await Iadapter.instance.adapter.write(
                this.dataPath,
                JSON.stringify(this.data, null, 2),
            );
        } catch (error) {
            console.error("[ReviewCommitStore] 保存失败:", error);
        }
    }

    /**
     * 获取指定文件的所有提交记录（按时间倒序）
     */
    getCommits(filePath: string): ReviewCommitLog[] {
        const commits = this.data[filePath] || [];
        return commits;
    }

    /**
     * 为指定文件添加一条新的提交记录
     */
    async addCommit(
        filePath: string,
        message: string,
        contextAnchor?: { textSnippet: string; offset: number },
        scrollPercentage?: number,
        metadata?: {
            entryType?: "manual" | "review-response";
            reviewResponse?: TimelineReviewResponse;
            displayDuration?: TimelineDisplayDuration;
        },
    ): Promise<ReviewCommitLog> {
        const now = Date.now();
        const log: ReviewCommitLog = {
            id: now.toString(),
            message: message.trim(),
            timestamp: now,
            contextAnchor,
            scrollPercentage,
            entryType: metadata?.entryType ?? "manual",
            reviewResponse: metadata?.reviewResponse,
            displayDuration: metadata?.displayDuration,
        };

        if (!this.data[filePath]) {
            this.data[filePath] = [];
        }
        // 新记录插入到数组最前面（时间倒序）
        this.data[filePath].unshift(log);

        await this.save();
        return log;
    }

    /**
     * 当笔记文件重命名时，同步更新 key
     */
    renameFile(oldPath: string, newPath: string): void {
        if (this.data[oldPath]) {
            this.data[newPath] = this.data[oldPath];
            delete this.data[oldPath];
        }
    }

    /**
     * 删除指定文件的所有提交记录
     */
    deleteFile(filePath: string): void {
        delete this.data[filePath];
    }

    /**
     * 删除指定文件的某一条提交记录
     */
    async deleteCommit(filePath: string, commitId: string): Promise<void> {
        if (!this.data[filePath]) return;
        this.data[filePath] = this.data[filePath].filter((log) => log.id !== commitId);
        // 如果该文件已无记录，清理 key
        if (this.data[filePath].length === 0) {
            delete this.data[filePath];
        }
        await this.save();
    }

    /**
     * 编辑指定文件的某一条提交记录的消息内容
     */
    async editCommit(filePath: string, commitId: string, newMessage: string): Promise<void> {
        if (!this.data[filePath]) return;
        const log = this.data[filePath].find((l) => l.id === commitId);
        if (log) {
            log.message = newMessage.trim();
            log.lastEdited = Date.now();
            await this.save();
        }
    }
}
