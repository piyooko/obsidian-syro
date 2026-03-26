/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * 绠＄悊姣忎釜绗旇鐨?鎻愪氦淇℃伅"璁板綍銆?
 * 鐢ㄦ埛鍙互鍦ㄤ晶杈规爮搴曢儴鐨勬娊灞夐噷锛岀粰鏌愪釜绗旇鍐欎竴娈垫枃瀛楄褰曪紙绫讳技 Git commit message锛夛紝
 * 鐢ㄦ潵杩借釜鑷繁浠€涔堟椂闂村涔犱簡銆佹湁浠€涔堟兂娉曟垨蹇冨緱銆?
 * 杩欎簺璁板綍浼氭寜鐓ф椂闂寸嚎灞曠ず锛屾柟渚垮洖椤捐嚜宸辩殑瀛︿範鍘嗙▼銆?
 *
 * 鎵€鏈夋暟鎹互鐙珛鐨?JSON 鏂囦欢锛坮eview_commits.json锛夊瓨鍌紝
 * 鍜屼富鏁版嵁鏂囦欢 tracked_files.json 鏀惧湪鍚屼竴涓洰褰曚笅銆?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細鏁版嵁灞?
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * 1. src/dataStore/dataLocation.ts 鈥?鑾峰彇瀛樺偍璺緞
 * 2. src/settings.ts 鈥?璇诲彇瀛樺偍浣嶇疆璁剧疆
 * 3. src/dataStore/adapter.ts 鈥?浣跨敤 Obsidian 鏂囦欢閫傞厤鍣ㄨ鍐欐枃浠?
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 1. src/ui/views/ReactNoteReviewView.tsx 鈥?妗ユ帴灞傝皟鐢ㄥ畠鏉ヨ鍐欐彁浜よ褰?
 */

import { Iadapter } from "./adapter";
import { getStorePath } from "./dataLocation";
import { SRSettings } from "src/settings";
import type { TimelineReviewResponse } from "src/ui/timeline/reviewResponseTimeline";
import type { TimelineDisplayDuration } from "src/ui/timeline/timelineMessage";

/**
 * 鍗曟潯鎻愪氦璁板綍
 */
export interface ReviewCommitLog {
    /** 鍞竴鏍囪瘑锛堟椂闂存埑瀛楃涓诧級 */
    id: string;
    /** 鎻愪氦淇℃伅姝ｆ枃锛堟敮鎸佸琛岋級 */
    message: string;
    /** 鎻愪氦鏃堕棿锛圲nix 姣鏃堕棿鎴筹級 */
    timestamp: number;
    /** 鏈€鍚庣紪杈戞椂闂达紙Unix 姣鏃堕棿鎴筹紝鍙€夛級 */
    lastEdited?: number;
    /** 鍏夋爣涓婁笅鏂囬敋鐐癸紙鍙€夛級 */
    contextAnchor?: {
        /** 鍏夋爣鍓嶅悗鐨勬枃鏈揩鐓?*/
        textSnippet: string;
        /** 鍏夋爣鍦ㄥ揩鐓т腑鐨勭浉瀵逛綅缃?*/
        offset: number;
    };
    /** 婊氬姩鐧惧垎姣旓紙0-1锛屽彲閫夛級 */
    scrollPercentage?: number;
    entryType?: "manual" | "review-response";
    reviewResponse?: TimelineReviewResponse;
    displayDuration?: TimelineDisplayDuration;
}

export interface ReviewCommitEditPayload {
    message: string;
    entryType: "manual" | "review-response";
    reviewResponse?: TimelineReviewResponse;
    displayDuration?: TimelineDisplayDuration;
}

/**
 * 鎵€鏈夌瑪璁扮殑鎻愪氦璁板綍闆嗗悎
 * key = 绗旇鏂囦欢璺緞, value = 璇ユ枃浠剁殑鎻愪氦璁板綍鏁扮粍锛堟寜鏃堕棿鍊掑簭锛?
 */
export interface ReviewCommitData {
    [filePath: string]: ReviewCommitLog[];
}

/**
 * 鎻愪氦璁板綍鐨勬暟鎹鐞嗗櫒
 * 璐熻矗璇诲啓 review_commits.json 鏂囦欢
 */
export class ReviewCommitStore {
    private data: ReviewCommitData = {};
    private dataPath: string;

    constructor(settings: SRSettings, manifestDir: string) {
        // 澶嶇敤 DataStore 鐨勮矾寰勯€昏緫锛屾妸鏂囦欢鍚嶆浛鎹负 review_commits.json
        const trackedPath = getStorePath(manifestDir, settings);
        const lastSlash = trackedPath.lastIndexOf("/");
        const dir = lastSlash >= 0 ? trackedPath.substring(0, lastSlash + 1) : "./";
        this.dataPath = dir + "review_commits.json";
    }

    /**
     * 浠?JSON 鏂囦欢鍔犺浇鏁版嵁
     */
    async load(): Promise<void> {
        try {
            const adapter = Iadapter.instance.adapter;
            if (await adapter.exists(this.dataPath)) {
                const raw = await adapter.read(this.dataPath);
                if (raw) {
                    const parsed = JSON.parse(raw) as unknown;
                    this.data =
                        typeof parsed === "object" && parsed !== null
                            ? (parsed as ReviewCommitData)
                            : {};
                }
            }
        } catch (error) {
            console.debug("[ReviewCommitStore] 鍔犺浇澶辫触锛屼娇鐢ㄧ┖鏁版嵁:", error);
            this.data = {};
        }
    }

    /**
     * 灏嗘暟鎹啓鍏?JSON 鏂囦欢
     */
    async save(): Promise<void> {
        try {
            await Iadapter.instance.adapter.write(
                this.dataPath,
                JSON.stringify(this.data, null, 2),
            );
        } catch (error) {
            console.error("[ReviewCommitStore] 淇濆瓨澶辫触:", error);
        }
    }

    /**
     * 鑾峰彇鎸囧畾鏂囦欢鐨勬墍鏈夋彁浜よ褰曪紙鎸夋椂闂村€掑簭锛?
     */
    getCommits(filePath: string): ReviewCommitLog[] {
        const commits = this.data[filePath] || [];
        return commits;
    }

    getLatestScrollPercentage(filePath: string): number | undefined {
        const commits = this.getCommits(filePath);
        for (const commit of commits) {
            if (
                typeof commit.scrollPercentage !== "number" ||
                !Number.isFinite(commit.scrollPercentage)
            ) {
                continue;
            }

            return Math.min(1, Math.max(0, commit.scrollPercentage));
        }

        return undefined;
    }

    /**
     * 涓烘寚瀹氭枃浠舵坊鍔犱竴鏉℃柊鐨勬彁浜よ褰?
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
        // 鏂拌褰曟彃鍏ュ埌鏁扮粍鏈€鍓嶉潰锛堟椂闂村€掑簭锛?
        this.data[filePath].unshift(log);

        await this.save();
        return log;
    }

    /**
     * 褰撶瑪璁版枃浠堕噸鍛藉悕鏃讹紝鍚屾鏇存柊 key
     */
    renameFile(oldPath: string, newPath: string): void {
        if (this.data[oldPath]) {
            this.data[newPath] = this.data[oldPath];
            delete this.data[oldPath];
        }
    }

    /**
     * 鍒犻櫎鎸囧畾鏂囦欢鐨勬墍鏈夋彁浜よ褰?
     */
    deleteFile(filePath: string): void {
        delete this.data[filePath];
    }

    /**
     * 鍒犻櫎鎸囧畾鏂囦欢鐨勬煇涓€鏉℃彁浜よ褰?
     */
    async deleteCommit(filePath: string, commitId: string): Promise<void> {
        if (!this.data[filePath]) return;
        this.data[filePath] = this.data[filePath].filter((log) => log.id !== commitId);
        // 濡傛灉璇ユ枃浠跺凡鏃犺褰曪紝娓呯悊 key
        if (this.data[filePath].length === 0) {
            delete this.data[filePath];
        }
        await this.save();
    }

    /**
     * 缂栬緫鎸囧畾鏂囦欢鐨勬煇涓€鏉℃彁浜よ褰曠殑娑堟伅鍐呭
     */
    async editCommit(
        filePath: string,
        commitId: string,
        payload: ReviewCommitEditPayload,
    ): Promise<void> {
        if (!this.data[filePath]) return;
        const log = this.data[filePath].find((l) => l.id === commitId);
        if (log) {
            log.message = payload.message.trim();
            log.entryType = payload.entryType;
            log.reviewResponse = payload.reviewResponse;
            log.displayDuration = payload.displayDuration;
            log.lastEdited = Date.now();
            await this.save();
        }
    }
}
