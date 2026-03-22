/**
 * ============================================================================
 * 鏂囦欢锛歍rackedFile.ts
 * ============================================================================
 *
 * 銆愬叏鏂版灦鏋勶細浠ユ寚绾逛负鏍稿績鐨勫瓟绾ц拷韪郴缁熴€?
 *
 * 杩欎釜鏂囦欢鏄?鍗＄墖杩借釜"鐨勬牳蹇冿紝鍋氫簡涓や欢澶т簨锛?
 * 1. 绠＄悊鍝簺鏂囦欢琚拷韪紙TrackedFile锛夛紝骞跺皢鏂囦欢鍐呭鎷嗚В涓烘渶缁嗙矑搴︾殑鈥滃瓟锛圱rackedItem锛夆€濄€?
 * 2. 閫氳繃"鏄庢枃鎸囩汗鍖归厤 + 灞€閮ㄤ笂涓嬫枃娑堟"鐨勬柟寮忥紝鎶婃棫鐨勫涔犺褰曞拰鏂扮殑瀛斿唴瀹瑰搴旇捣鏉ャ€?
 *
 * ============================================================================
 * 鏍稿績璁捐鐞嗗康锛堜笌鏃х増鐨勫尯鍒級锛?
 * ============================================================================
 *
 * 1. 銆愬瓟绾х矑搴︺€戯細
 *    浠ュ墠涓€鏉¤褰曚唬琛ㄢ€滀竴鏁磋/娈佃惤鈥濓紙鍖呭惈澶氫釜瀛旓級锛岀幇鍦ㄤ竴鏉¤褰曪紙TrackedItem锛夊彧浠ｈ〃鈥滀竴涓瓟鈥濇垨鈥滀竴涓瓟妗堚€濄€?
 *    濡傛灉涓€娈佃瘽鏈?涓～绌猴紝灏变細鐢熸垚3鏉＄嫭绔嬬殑 TrackedItem銆?
 *
 * 2. 銆愭槑鏂囨寚绾癸紝鎷掔粷鍝堝笇銆戯細
 *    鎸囩汗锛坒ingerprint锛変笉鍐嶆槸鍘嬬缉鍚庣殑8浣嶅搱甯屽瓧绗︼紝鑰屾槸瀛?绛旀鐨?*绾槑鏂?*銆?
 *    渚嬪锛歚鍗＄墖淇{c2::鎭瘆}` 鐨勬寚绾瑰氨鏄?`"鎭?`銆?
 *    闂瓟鍗＄殑鎸囩汗灏辨槸 `"绛旀鍏ㄦ枃"`銆?
 *
 * 3. 銆愬眬閮ㄤ笂涓嬫枃锛圕ontext锛夈€戯細
 *    涓婁笅鏂囦笉鍐嶆槸鏁翠釜娈佃惤鐨勫墠鍚庯紝鑰屾槸**绱ц创鎸囩汗鎵€鍦ㄤ綅缃?*鐨勫墠50涓瓧绗﹀拰鍚?0涓瓧绗︺€?
 *    杩欎娇寰楀悓涓€琛岄噷鍑虹幇涓や釜鐩稿悓鐨勮瘝锛堝涓や釜"鏄?锛変篃鑳借瀹岀編鍖哄垎銆?
 *
 * 4. 銆愮簿纭潗鏍囷紙Span锛変笌鍥為€€鏈哄埗銆戯細
 *    寮曞叆浜?span锛堝瓧绗﹀亸绉婚噺锛夎褰曟寚绾瑰湪鏂囦欢涓殑绮剧‘浣嶇疆锛屾柟渚垮涔犳椂楂樹寒/閬僵銆?
 *    濡傛灉鍦ㄥ涔犳椂鍙戠幇 span 澶勭殑鏂囧瓧鍙樹簡锛堢敤鎴风紪杈戜簡鏂囦欢瀵艰嚧鍋忕Щ锛夛紝
 *    绯荤粺浼氬埄鐢?RepetitionItem锛堝涔犺皟搴︽暟鎹級涓繚瀛樼殑 lastKnown(閿氱偣) 閲嶆柊鎵撳垎锛?
 *    鎵惧埌瀹冪幇鍦ㄧ殑鏂颁綅缃紝骞惰嚜鍔ㄤ慨澶?span銆?
 *
 * ============================================================================
 */

import { SRSettings } from "src/settings";
import { CardType, QuestionText } from "src/Question";
import { parse, ParsedQuestionInfo } from "src/parser";
import { RPITEMTYPE } from "./repetitionItem";
import { DEFAULT_DECKNAME } from "src/constants";
import { Tags } from "src/tags";

// ============================================================================
// 绫诲瀷瀹氫箟鍖哄煙
// ============================================================================

/**
 * TrackedSpan 鈥斺€?绮剧‘鐨勭墿鐞嗗潗鏍?
 *
 * 鐢ㄤ簬璁板綍璇ユ寚绾瑰湪 Markdown 鏂囦欢涓殑鍏蜂綋瀛楃璧锋浣嶇疆銆?
 * - 涓轰粈涔堣璁板綍 block 鐨勫潗鏍囷紵 涓轰簡澶嶄範鏃惰兘鎶婃暣鍙ヨ瘽/鏁翠釜鍧楀彇鍑烘潵灞曠ず銆?
 * - 涓轰粈涔堣璁板綍 start/end Offset锛?涓轰簡鍦ㄦ暣鍙ヨ瘽閲岀簿鍑嗗湴鎶婅繖涓瓟鎸栨帀/楂樹寒銆?
 */
export interface TrackedSpan {
    startOffset: number; // 鎸囩汗(瀛?鏈韩鐨勮捣濮嬪瓧绗︾储寮曪紙鐩稿浜庡叏鏂囦欢锛?
    endOffset: number; // 鎸囩汗(瀛?鏈韩鐨勭粨鏉熷瓧绗︾储寮?
    blockStartOffset: number; // 璇ュ崱鐗囨墍鍦ㄦ钀?鍧楃殑璧峰瀛楃绱㈠紩
    blockEndOffset: number; // 璇ュ崱鐗囨墍鍦ㄦ钀?鍧楃殑缁撴潫瀛楃绱㈠紩
}

/**
 * TrackedItem 鈥斺€?鏈€缁嗙矑搴︾殑杩借釜鍗曞厓锛堝瓟/绛旀锛?
 *
 * 褰诲簳鍙栦唬浜嗘棫鐨?CardInfo銆?
 * 涓€鏉?TrackedItem = 涓€涓嫭绔嬬殑澶嶄範瀹炰綋銆?
 */
export class TrackedItem {
    fingerprint: string; // 鏍稿績锛氭槑鏂囨寚绾癸紙濡?"涔?銆?闂瓟鍗＄殑绛旀"锛?
    reviewId: number; // 鍏ㄥ眬澶嶄範椤?ID锛?1 琛ㄧず鏂板彂鐜扮殑銆佽繕娌¤繘闃熷垪鐨勬柊鍗★級
    lineNo: number; // 鎵€鍦ㄨ鍙凤紙鐢ㄤ簬鍒濇鎵撳垎鍜屽畾浣嶏級
    context: string; // 灞€閮ㄤ笂涓嬫枃锛堢揣璐存寚绾圭殑鍓?0 + 鍚?0瀛楃锛?
    cardType: CardType; // 绫诲瀷锛欳LOZE 鎴?QA
    clozeId: string | null; // 浠呯敤浜?CLOZE锛屽 "c1"銆?c2"锛屾樉绀烘椂浣跨敤锛屼笉鍙備笌鍖归厤
    span: TrackedSpan; // 绮剧‘鐨勭墿鐞嗗潗鏍?

    constructor(
        fingerprint: string,
        lineNo: number,
        context: string,
        cardType: CardType,
        span: TrackedSpan,
        clozeId: string | null = null,
        reviewId: number = -1,
    ) {
        this.fingerprint = fingerprint;
        this.lineNo = lineNo;
        this.context = context;
        this.cardType = cardType;
        this.span = span;
        this.clozeId = clozeId;
        this.reviewId = reviewId;
    }
}

export type CardInfo = TrackedItem;

/**
 * ITrackedFile 鎺ュ彛锛堢敤浜?JSON 搴忓垪鍖栵級
 */
export interface ITrackedFile {
    path: string;
    items: Record<string, number>; // 绗旇绾у埆鐨勫涔?ID
    trackedItems?: TrackedItem[]; // 鍙栦唬浜嗘棫鐨?cardItems
    tags: string[];
}

// ============================================================================
// TrackedFile 绫?鈥斺€?鏂囦欢杩借釜鐨勬牳蹇冪被
// ============================================================================

export class TrackedFile implements ITrackedFile {
    path: string;
    items: Record<string, number>;
    trackedItems?: TrackedItem[];
    tags: string[];

    static create(data: ITrackedFile): TrackedFile {
        let tf = new TrackedFile(data.path);
        const type = (data.tags?.[0] as RPITEMTYPE) || RPITEMTYPE.NOTE;
        const dname = data.tags?.[1];
        tf.setTracked(type, dname);
        tf.items = data.items || { file: -1 };

        // 瀹炰緥鍖?TrackedItems
        if (data.trackedItems) {
            tf.trackedItems = data.trackedItems.map(
                (item) =>
                    new TrackedItem(
                        item.fingerprint,
                        item.lineNo,
                        item.context,
                        item.cardType,
                        item.span,
                        item.clozeId,
                        item.reviewId,
                    ),
            );
        } else {
            tf.trackedItems = [];
        }

        tf.tags = data.tags || [];
        return tf;
    }

    constructor(path: string = "", type: RPITEMTYPE = RPITEMTYPE.NOTE, dname?: string) {
        this.path = path;
        this.items = {};
        if (type === RPITEMTYPE.CARD) {
            this.trackedItems = [];
        }
        this.setTracked(type, dname);
    }

    rename(newPath: string) {
        const old = this.path;
        this.path = newPath;
        console.debug(`[TrackedFile] Renamed: ${old} -> ${newPath}`);
    }

    get hasCards() {
        return Array.isArray(this.trackedItems) && this.trackedItems.length > 0;
    }

    get lastTag(): string | undefined {
        return this.tags?.[this.tags.length - 1];
    }

    get isDefault(): boolean {
        return this.tags?.includes(DEFAULT_DECKNAME) || this.tags?.length === 1;
    }

    get isTrackedNote(): boolean {
        return String(this.tags?.[0]) === String(RPITEMTYPE.NOTE);
    }

    get itemIDs(): number[] {
        const ids = [this.items.file];
        if (this.hasCards) {
            this.trackedItems.forEach((item) => {
                if (item.reviewId >= 0) ids.push(item.reviewId);
            });
        }
        return ids.filter((id) => id !== undefined && id >= 0);
    }

    setTracked(type: RPITEMTYPE, dname?: string) {
        this.tags = [type];
        if (dname !== undefined) {
            this.tags.push(dname);
        } else if (type === RPITEMTYPE.NOTE) {
            this.tags.push(DEFAULT_DECKNAME);
        }
    }

    setUnTracked() {
        this.tags = [this.tags[0]];
    }

    /**
     * 鑾峰彇鎸囧畾琛屽彿鍜?holeId 鐨?TrackedItem锛堟柊鏋舵瀯鐢ㄤ簬鏄犲皠澶嶄範瀵硅薄鐨勫叆鍙ｏ級
     */
    getTrackedItem(lineNo: number, clozeId: string): TrackedItem | undefined {
        if (!this.trackedItems) return undefined;
        // 鍏煎澶勭悊锛氬浜庢棫鏁版嵁鎴栨病鏈夊瓟浣嶇殑闂瓟鍗★紝瀹冪殑 clozeId 鍙兘鏄?null 鎴?undefined銆傜粺涓€鐪嬩綔 "c1"
        const normCloze = (id: string | null | undefined) =>
            id === null || id === undefined ? "c1" : id;
        const targetCloze = normCloze(clozeId);

        // 鍏堢簿纭尮閰嶏細琛屽彿 + clozeId
        let item = this.trackedItems.find(
            (i) => i.lineNo === lineNo && normCloze(i.clozeId) === targetCloze,
        );

        // 濡傛灉瀛樺湪杞诲井閿欒锛屽厑璁镐竴瀹氳寖鍥寸殑寮规€ф煡鎵?
        // 鍏抽敭淇锛氬脊鎬у眰鏌ユ壘蹇呴』涓ユ牸鍖归厤 clozeId锛屽惁鍒欏悓涓€涓棶绛旈鐨勫涓寲绌鸿姹備細鍏ㄦ尋鍒板悓涓€涓?reviewId 涓婏紙鍥犱负璺濈鐩哥瓑锛?
        if (!item) {
            const candidates = this.trackedItems.filter(
                (i) => normCloze(i.clozeId) === targetCloze,
            );
            if (candidates.length > 0) {
                // 瀵绘壘璺濈鏈€杩戠殑
                item = candidates.reduce((a, b) =>
                    Math.abs(a.lineNo - lineNo) < Math.abs(b.lineNo - lineNo) ? a : b,
                );

                // 涓轰簡闃叉澶氶噸鎸栫┖鏃剁殑鎭舵€у悎骞讹紝濡傛灉鎵惧埌鐨勫璞¤窛绂荤洰鏍囪澶繙锛堝 > 5 琛岋級锛屾嫆缁濆惛闄?
                if (item && Math.abs(item.lineNo - lineNo) > 5) {
                    item = undefined;
                }
            }
        }
        return item;
    }

    /**
     * 銆愭牳蹇冨叆鍙ｃ€戝悓姝ユ枃浠朵腑鐨勬墍鏈夊瓟绾ц褰?
     *
     * 1. 瑙ｆ瀽鏂囦欢鑾峰彇鏂版暟鎹?-> expandToCandidates 灏嗘钀芥媶鍒嗘垚涓€涓釜鐨勫瓟
     * 2. 鏃ц褰?vs 鏂板€欓€変汉 -> matchItems 鎵ц 鎸囩汗鍖归厤+鎵撳垎娑堟
     * 3. 璁＄畻鍒犻櫎浜嗗摢浜涘涔犺褰?
     *
     * @returns { hasChange, removedIds }
     */
    syncNoteCardsIndex(
        fileText: string,
        settings: SRSettings,
        callback?: (cardText: string, cardInfo: unknown) => void,
    ): { hasChange: boolean; removedIds: number[] } {
        // 1. 璁板綍鍚屾鍓嶇殑鏈夋晥澶嶄範 ID
        const oldIdSet = new Set<number>();
        if (this.trackedItems) {
            this.trackedItems.forEach((item) => {
                if (item.reviewId >= 0) oldIdSet.add(item.reviewId);
            });
        }

        // 2. 璋冪敤 parser.ts 瑙ｆ瀽锛堣幏鍙栨钀界骇鐨勫崱鐗囩粨鏋勶級
        // 杩欓噷娌跨敤鏃ч€昏緫锛屽睆钄戒簡 HTML 璋冨害娉ㄩ噴
        const parsedQuestions: ParsedQuestionInfo[] = parse(fileText, settings);

        // 3. 灏嗏€滄钀界骇鈥濈粨鏋滐紝灞曞紑涓衡€滃瓟绾р€濈殑鍊欓€夎€?(Candidate Items)
        const candidates = expandToCandidates(parsedQuestions, fileText, settings);

        if (!this.trackedItems) this.trackedItems = [];
        const oldCardCount = this.trackedItems.length;

        // 4. 鎵ц鏍稿績鍖归厤绠楁硶锛氭棫璁板綍 涓?鏂板€欓€?杩涜鍖归厤
        this.trackedItems = matchItems(this.trackedItems, candidates);

        // 鎸夎鍙锋帓搴忥紝淇濇寔鐗╃悊椤哄簭
        this.trackedItems.sort((a, b) => a.lineNo - b.lineNo);

        // 5. 璁＄畻琚垹闄ょ殑 ID锛堜互鍓嶆湁锛岀幇鍦ㄥ尮閰嶄笉涓婁簡 = 骞界伒鍗?宸茶鍒狅級
        const newIdSet = new Set<number>();
        this.trackedItems.forEach((item) => {
            if (item.reviewId >= 0) newIdSet.add(item.reviewId);
        });

        const removedIds: number[] = [];
        for (const id of oldIdSet) {
            if (!newIdSet.has(id)) removedIds.push(id);
        }

        if (callback && parsedQuestions.length > 0) {
            parsedQuestions.forEach((pq) => {
                const itemMap: Record<string, number> = {};
                const relatedItems = (this.trackedItems || []).filter(
                    (ti) => ti.lineNo === pq.firstLineNum,
                );
                relatedItems.forEach((ri) => {
                    if (ri.clozeId) itemMap[ri.clozeId] = ri.reviewId;
                    else itemMap["c1"] = ri.reviewId;
                });
                callback(pq.text, { lineNo: pq.firstLineNum, itemMap: itemMap });
            });
        }

        // 鍙戠幇鏂板崱锛坮eviewId == -1锛夋垨鏁伴噺鍙樺寲鎴栨湁鍒犻櫎锛岄兘绠楁湁鍙樺寲
        const hasNewCards = this.trackedItems.some((i) => i.reviewId === -1);
        const hasChange =
            oldCardCount !== this.trackedItems.length || hasNewCards || removedIds.length > 0;

        return { hasChange, removedIds };
    }
}

// ============================================================================
// 绗竴闃舵锛氬皢瑙ｆ瀽缁撴灉灞曞紑涓哄瓟绾э紙Candidate锛?
// ============================================================================

/**
 * 灏嗚В鏋愬嚭鐨勬钀界骇 Question 灞曞紑涓轰竴涓釜鐙珛鐨勨€滃瓟鍊欓€夎€呪€?
 */
function expandToCandidates(
    parsedQuestions: ParsedQuestionInfo[],
    fileText: string,
    settings: SRSettings,
): TrackedItem[] {
    const candidates: TrackedItem[] = [];

    // 妫€娴嬫崲琛岀闀垮害浠ョ簿纭绠楀亸绉?
    const lineBreakLen = fileText.includes("\r\n") ? 2 : 1;
    const lines = fileText.split(/\r?\n/);

    for (const question of parsedQuestions) {
        if (question.text.includes(settings.editLaterTag)) continue;

        // 璁＄畻杩欎釜鍧楋紙娈佃惤锛夌殑绮剧‘璧峰鍜岀粨鏉熷亸绉婚噺
        let blockStartOffset = 0;
        for (let i = 0; i < question.firstLineNum && i < lines.length; i++) {
            blockStartOffset += lines[i].length + lineBreakLen;
        }
        let blockEndOffset = blockStartOffset;
        for (let i = question.firstLineNum; i <= question.lastLineNum && i < lines.length; i++) {
            blockEndOffset += lines[i].length + lineBreakLen;
        }
        if (blockEndOffset > blockStartOffset) blockEndOffset -= lineBreakLen;

        const cleanText = QuestionText.splitText(question.text, settings)[1]; // 鍓ョ璋冨害淇℃伅

        if (question.cardType === CardType.Cloze || question.cardType === CardType.AnkiCloze) {
            // 鎻愬彇鎵€鏈夊～绌哄瓟銆傚亣璁惧唴閮ㄨ緟鍔╁嚱鏁拌兘鎻愬彇鍑哄瓟鐨勫唴瀹瑰拰灞€閮ㄥ亸绉?
            const holes = extractHolesWithOffsets(cleanText, settings);

            for (const hole of holes) {
                // 璁＄畻璇ュ瓟鍦ㄥ叏鏂囦腑鐨勭粷瀵瑰亸绉?
                const startOffset = blockStartOffset + hole.localStart;
                const endOffset = blockStartOffset + hole.localEnd;

                candidates.push(
                    new TrackedItem(
                        hole.answerText, // 鎸囩汗锛氬瓟鐨勬槑鏂囧唴瀹?
                        question.firstLineNum,
                        extractContext(fileText, startOffset, endOffset), // 绱ц创瀛旂殑鍓嶅悗 50 瀛楃
                        CardType.Cloze,
                        { startOffset, endOffset, blockStartOffset, blockEndOffset },
                        hole.clozeId,
                        -1, // 鏂板€欓€夎€呭皻鏈垎閰?reviewId
                    ),
                );
            }
        } else {
            // 闂瓟鍗?(QA / Reversed QA)
            // 鎸囩汗鐩存帴浣跨敤鈥滅瓟妗堝叏鏂団€?
            const answerText = extractQAAnswer(cleanText, settings, question.cardType);

            // 涓轰簡绠€鍖栵紝闂瓟鍗＄殑瀛斿潗鏍囧氨璁句负鏁翠釜鍧楃殑鍚庡崐閮ㄥ垎鎴栨暣浣?
            // (濡傛灉闇€瑕侀珮浜暣涓瓟妗堬紝鍙互鍦ㄨ繖閲屽仛绮惧噯鏌ユ壘绛旀鎵€鍦ㄧ殑 localOffset)
            const answerIndex = cleanText.indexOf(answerText);
            const startOffset =
                answerIndex !== -1 ? blockStartOffset + answerIndex : blockStartOffset;
            const endOffset = startOffset + answerText.length;

            candidates.push(
                new TrackedItem(
                    cleanText,
                    question.firstLineNum,
                    extractContext(fileText, startOffset, endOffset),
                    question.cardType,
                    { startOffset, endOffset, blockStartOffset, blockEndOffset },
                    "c1",
                    -1,
                ),
            );
        }
    }

    return candidates;
}

// ============================================================================
// 绗簩闃舵锛氭牳蹇冨尮閰嶆墦鍒嗙畻娉曪紙matchItems锛?
// ============================================================================

/**
 * 灏嗙幇鏈夌殑鏃ц褰曚笌鏂拌В鏋愮殑鍊欓€夎褰曡繘琛屽尮閰嶏紝缁ф壙澶嶄範杩涘害锛坮eviewId锛?
 */
function matchItems(oldItems: TrackedItem[], candidates: TrackedItem[]): TrackedItem[] {
    // 1. 鍒嗗埆鎸?fingerprint 杩涜鍒嗙粍
    const oldByFp = new Map<string, TrackedItem[]>();
    for (const old of oldItems) {
        if (!oldByFp.has(old.fingerprint)) oldByFp.set(old.fingerprint, []);
        oldByFp.get(old.fingerprint).push(old);
    }

    const newByFp = new Map<string, TrackedItem[]>();
    for (const cand of candidates) {
        if (!newByFp.has(cand.fingerprint)) newByFp.set(cand.fingerprint, []);
        newByFp.get(cand.fingerprint).push(cand);
    }

    const result: TrackedItem[] = [];
    const usedNew = new Set<TrackedItem>();

    // 2. 鍦ㄥ悓鎸囩汗缁勫唴杩涜鍖归厤
    for (const [fp, oldGroup] of oldByFp.entries()) {
        const newGroup = (newByFp.get(fp) || []).filter((c) => !usedNew.has(c));

        if (newGroup.length === 0) continue; // 鏃х殑杩欎釜鎸囩汗娌′簡 -> 骞界伒鍗′涪寮?

        // 蹇€熷尮閰嶏細1瀵?
        if (oldGroup.length === 1 && newGroup.length === 1) {
            const oldC = oldGroup[0];
            const newC = newGroup[0];
            usedNew.add(newC);
            newC.reviewId = oldC.reviewId; // 缁ф壙澶嶄範杩涘害
            result.push(newC);
            continue;
        }

        // 鎵撳垎鍖归厤锛氬瀵瑰 鎴?1瀵瑰
        type Pair = { old: TrackedItem; cand: TrackedItem; score: number };
        const allPairs: Pair[] = [];

        for (const oldC of oldGroup) {
            const lineScores = calculateLineScores(oldC.lineNo, newGroup);
            for (const newC of newGroup) {
                // 涓婁笅鏂囩浉浼煎害鍗?50 鍒?
                const ctxScore = stringSimilarity(oldC.context, newC.context) * 50;
                // 琛屽彿鎺ヨ繎搴﹀崰 50 鍒?
                const lineScore = lineScores.get(newC) || 0;

                // 骞冲垎鍒ゆ嵁锛氬鏋?clozeId 涔熶竴鏍凤紝缁欏井灏忓姞鍒嗘墦鐮村钩琛?(澶勭悊鍚屼竴琛屾湁瀹屽叏涓€鏍峰唴瀹圭殑涓や釜瀛?
                const tieBreaker = oldC.clozeId === newC.clozeId ? 1 : 0;

                allPairs.push({ old: oldC, cand: newC, score: ctxScore + lineScore + tieBreaker });
            }
        }

        allPairs.sort((a, b) => b.score - a.score);

        const matchedOld = new Set<TrackedItem>();
        for (const pair of allPairs) {
            if (matchedOld.has(pair.old) || usedNew.has(pair.cand)) continue;

            matchedOld.add(pair.old);
            usedNew.add(pair.cand);
            pair.cand.reviewId = pair.old.reviewId; // 缁ф壙
            result.push(pair.cand);
        }
    }

    // 3. 鎵€鏈夋湭琚尮閰嶇殑鏂板€欓€夛紝閮芥槸鍏ㄦ柊鐨勫崱鐗?
    for (const cand of candidates) {
        if (!usedNew.has(cand)) {
            // cand.reviewId 鐩墠鏄?-1锛屼繚鎸佸師鏍峰姞鍏?
            result.push(cand);
        }
    }

    return result;
}

// ============================================================================
// 绗笁闃舵锛氬涔犳湡闂寸殑 Span 鏍￠獙涓庡洖閫€閲嶅畾浣?(鍩轰簬閿氱偣)
// ============================================================================

/**
 * 鎺ュ彛锛氱敤浜庡涔犻槦鍒椾紶鍏ョ殑鈥滃巻鍙查敋鐐光€濓紝涔熷氨鏄綘璇磋繃鐨?lastKnown.context / lineNo
 */
/**
 * 鍦ㄥ涔犳椂锛屽垽鏂綋鍓嶇殑 Span 鏄惁宸茬粡澶辨晥锛堟瘮濡傚師鏂囪淇敼銆佸亸绉昏秺鐣屻€佹垨鑰?span 澶勭殑鏂囨湰璺熸寚绾瑰涓嶄笂锛?
 */
function isSpanValid(fileText: string, item: TrackedItem): boolean {
    const { startOffset, endOffset } = item.span;
    if (startOffset < 0 || endOffset > fileText.length) return false;

    // 鍒ゆ柇璇ヤ綅缃殑鏂囨湰锛屾槸鍚︿粛鐒剁瓑浜庢寚绾?
    const spanText = fileText.substring(startOffset, endOffset);
    return spanText === item.fingerprint;
}

/**
 * 銆愰噸瀹氫綅鍏滃簳鏂规銆?
 * 褰撳涔犳煇涓?dueItem 鏃讹紝鍙戠幇鍏?span 澶辨晥銆?
 * 杩欎釜鍑芥暟浼氶噸鏂拌В鏋愭枃浠讹紝骞跺湪鍚屾寚绾瑰€欓€変腑锛屽埄鐢ㄨ dueItem 璁板綍鐨勫巻鍙查敋鐐癸紙IAnchor锛夋墦鍒嗘秷姝э紝
 * 鎵惧嚭瀹冪幇鍦ㄧ殑鏂颁綅缃€?
 *
 * @param dueItemAnchor 澶嶄範璋冨害璁板綍涓繚瀛樼殑鍘嗗彶閿氱偣 (context + lineNo)
 * @param fingerprint   姝ｅ湪鎵剧殑澶嶄範鍐呭锛?涔?锛?
 * @param fileText      鏂囦欢鏈€鏂版枃鏈?
 * @param settings      璁剧疆
 * @returns 鎵惧洖鐨勬柊鍊欓€夊瓟 TrackedItem (鍖呭惈鏈€鏂扮殑 span/context/lineNo)
 */
function relocateItemByAnchor(
    dueItemAnchor: { lineNo: number; context: string },
    fingerprint: string,
    fileText: string,
    settings: SRSettings,
): TrackedItem | null {
    // 閲嶆柊鎶婃渶鏂版枃浠惰В鏋愭媶鍒嗘垚瀛?
    const questions = parse(fileText, settings);
    const allCandidates = expandToCandidates(questions, fileText, settings);

    // 杩囨护鍑烘墍鏈夋寚绾逛竴鑷寸殑鍊欓€変綅缃?
    const fpCandidates = allCandidates.filter((c) => c.fingerprint === fingerprint);
    if (fpCandidates.length === 0) return null; // 璇ユ寚绾瑰交搴曡浠庢枃浠堕噷鍒犻櫎浜?

    // 濡傛灉鍙湁涓€涓綅缃紝鐩存帴杩斿洖锛堣櫧鐒跺畠璺?anchor 鍙兘鏈変綅绉伙紝浣嗗畠鏄敮涓€鐨勫瓨娲昏€咃級
    if (fpCandidates.length === 1) return fpCandidates[0];

    // 濡傛灉鏈夊涓綅缃紝鍒╃敤 dueItem 鐨勫巻鍙查敋鐐硅繘琛屾墦鍒?
    let bestMatch: TrackedItem | null = null;
    let bestScore = -Infinity;

    const lineScores = calculateLineScores(dueItemAnchor.lineNo, fpCandidates);

    for (const cand of fpCandidates) {
        const ctxScore = stringSimilarity(dueItemAnchor.context, cand.context) * 50;
        const lineScore = lineScores.get(cand) || 0;
        const total = ctxScore + lineScore;

        if (total > bestScore) {
            bestScore = total;
            bestMatch = cand;
        }
    }

    return bestMatch;
}

// ============================================================================
// 宸ュ叿鍑芥暟锛氭彁鍙栫浉鍏?
// ============================================================================

/**
 * 鎻愬彇灞€閮ㄤ笂涓嬫枃锛氱揣璐存寚绾逛綅缃殑鍓?50 鍜?鍚?50
 */
function extractContext(fileText: string, startOffset: number, endOffset: number): string {
    const preContext = fileText.substring(Math.max(0, startOffset - 50), startOffset);
    const postContext = fileText.substring(endOffset, Math.min(fileText.length, endOffset + 50));
    return preContext + postContext;
}

/**
 * 鍗犱綅妯℃嫙鎻愬彇濉┖瀛旂殑浣嶇疆锛堝疄闄呴渶瑕佹牴鎹?settings.clozePatterns 杩愯姝ｅ垯锛?
 * 杩斿洖鏍煎紡锛歿 answerText: "涔?, localStart: 10, localEnd: 11, clozeId: "c1" }
 */
function extractHolesWithOffsets(
    cleanText: string,
    settings: SRSettings,
): Array<{ answerText: string; localStart: number; localEnd: number; clozeId: string }> {
    const holes: Array<{
        answerText: string;
        localStart: number;
        localEnd: number;
        clozeId: string;
    }> = [];

    const ankiMatches = [...cleanText.matchAll(/\{\{c(\d+)(?:::|锛氾細)(.*?)(?:::|锛氾細)?\}\}/gi)];
    ankiMatches.forEach((match) => {
        const raw = match[0];
        const answerText = match[2];
        const answerOffset = raw.indexOf(answerText);
        holes.push({
            answerText,
            localStart: match.index + answerOffset,
            localEnd: match.index + answerOffset + answerText.length,
            clozeId: `c${match[1]}`,
        });
    });

    if (settings.convertHighlightsToClozes) {
        const highlightMatches = [...cleanText.matchAll(/==(.*?)==/g)];
        highlightMatches.forEach((match, index) => {
            const answerText = match[1];
            holes.push({
                answerText,
                localStart: match.index + 2,
                localEnd: match.index + 2 + answerText.length,
                clozeId: `hl${index}`,
            });
        });
    }

    if (settings.convertBoldTextToClozes) {
        const boldMatches = [...cleanText.matchAll(/\*\*(.*?)\*\*/g)];
        boldMatches.forEach((match, index) => {
            const answerText = match[1];
            holes.push({
                answerText,
                localStart: match.index + 2,
                localEnd: match.index + 2 + answerText.length,
                clozeId: `bd${index}`,
            });
        });
    }

    return holes;
    // 绀轰緥姝ｅ垯琛ㄨ揪寮忥紝鍖归厤 {{c1::绛旀}}
    const clozeRegex = /{{(c\d+)::([^}]+)}}/g;
    let match;
    while ((match = clozeRegex.exec(cleanText)) !== null) {
        // match[1] = "c1", match[2] = "绛旀"
        holes.push({
            answerText: match[2],
            localStart: match.index + match[0].indexOf(match[2]), // 绮楃暐璁＄畻绛旀鏈綋鍦?block 涓殑浣嶇疆
            localEnd: match.index + match[0].indexOf(match[2]) + match[2].length,
            clozeId: match[1],
        });
    }
    return holes;
}

/**
 * 鍗犱綅妯℃嫙鎻愬彇闂瓟鍗＄殑绛旀鍐呭
 */
function extractQAAnswer(cleanText: string, settings: SRSettings, type: CardType): string {
    // 闂瓟鍗¤瀵瑰簲鐨勫垎闅旂鍒嗘垚鍓嶅悗涓ら儴鍒嗐€傚亣璁?parser.ts 鐨勯€昏緫锛屾垜浠彲浠ョ畝鍖栦负锛?
    // 濡傛灉鏄?QA锛岀瓟妗堝湪鍒嗛殧绗﹀悗闈€傝繖閮ㄥ垎闇€渚濊禆鍏蜂綋鍒嗛殧绗﹀疄鐜帮紝杩欓噷鍋氫吉浠ｇ爜婕旂ず锛?
    const parts = cleanText.split(settings.singleLineCardSeparator);
    if (parts.length > 1) return parts[1].trim();
    return cleanText; // 鍏滃簳
}

// ============================================================================
// 宸ュ叿鍑芥暟锛氱浉浼煎害鎵撳垎璁＄畻
// ============================================================================

function stringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length < 2 || str2.length < 2) return 0;
    const getBigrams = (str: string) => {
        const bigrams = new Map<string, number>();
        for (let i = 0; i < str.length - 1; i++) {
            const bigram = str.substring(i, i + 2);
            bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
        }
        return bigrams;
    };
    const b1 = getBigrams(str1),
        b2 = getBigrams(str2);
    let intersection = 0;
    for (const [bg, count] of b1) {
        if (b2.has(bg)) intersection += Math.min(count, b2.get(bg));
    }
    return (2 * intersection) / (str1.length - 1 + (str2.length - 1));
}

function calculateLineScores(
    targetLineNo: number,
    candidates: TrackedItem[],
): Map<TrackedItem, number> {
    const scores = new Map<TrackedItem, number>();
    if (candidates.length === 0) return scores;

    const distances = candidates.map((c) => ({ cand: c, dist: Math.abs(c.lineNo - targetLineNo) }));
    const allDists = distances.map((d) => d.dist);
    const minDist = Math.min(...allDists);
    const maxDist = Math.max(...allDists);

    if (maxDist === minDist) {
        for (const c of candidates) scores.set(c, 50);
        return scores;
    }

    const MIN_SCORE = 5;
    for (const { cand, dist } of distances) {
        const normalized = (dist - minDist) / (maxDist - minDist);
        scores.set(cand, MIN_SCORE + (50 - MIN_SCORE) * (1 - normalized));
    }
    return scores;
}

