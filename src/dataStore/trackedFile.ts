/**
 * ============================================================================
 * 閺傚洣娆㈤敍姝峳ackedFile.ts
 * ============================================================================
 *
 * 閵嗘劕鍙忛弬鐗堢仸閺嬪嫸绱版禒銉﹀瘹缁鹃€涜礋閺嶇绺鹃惃鍕摕缁狙嗘嫹闊亞閮寸紒鐔粹偓?
 *
 * 鏉╂瑤閲滈弬鍥︽閺?閸楋紕澧栨潻鍊熼嚋"閻ㄥ嫭鐗宠箛鍐跨礉閸嬫矮绨℃稉銈勬婢堆傜皑閿?
 * 1. 缁狅紕鎮婇崫顏冪昂閺傚洣娆㈢悮顐ユ嫹闊亷绱橳rackedFile閿涘绱濋獮璺虹殺閺傚洣娆㈤崘鍛啇閹峰棜袙娑撶儤娓剁紒鍡欑煈鎼达妇娈戦垾婊冪摕閿涘湵rackedItem閿涘鈧縿鈧?
 * 2. 闁俺绻?閺勫孩鏋冮幐鍥╂睏閸栧綊鍘?+ 鐏炩偓闁劋绗傛稉瀣瀮濞戝牊顒?閻ㄥ嫭鏌熷蹇ョ礉閹跺﹥妫惃鍕槻娑旂姾顔囪ぐ鏇炴嫲閺傛壆娈戠€涙柨鍞寸€圭懓顕惔鏃囨崳閺夈儯鈧?
 *
 * ============================================================================
 * 閺嶇绺剧拋鎹愵吀閻炲棗搴烽敍鍫滅瑢閺冄呭閻ㄥ嫬灏崚顐礆閿?
 * ============================================================================
 *
 * 1. 閵嗘劕鐡熺痪褏鐭戞惔锔衡偓鎴窗
 *    娴犮儱澧犳稉鈧弶陇顔囪ぐ鏇氬敩鐞涖劉鈧粈绔撮弫纾嬵攽/濞堜絻鎯ら垾婵撶礄閸栧懎鎯堟径姘嚋鐎涙棑绱氶敍宀€骞囬崷銊ょ閺壜ゎ唶瑜版洩绱橳rackedItem閿涘褰ф禒锝堛€冮垾婊€绔存稉顏勭摕閳ユ繃鍨ㄩ垾婊€绔存稉顏嗙摕濡楀牃鈧縿鈧?
 *    婵″倹鐏夋稉鈧▓浣冪樈閺?娑擃亜锝炵粚鐚寸礉鐏忓彉绱伴悽鐔稿灇3閺夛紕瀚粩瀣畱 TrackedItem閵?
 *
 * 2. 閵嗘劖妲戦弬鍥ㄥ瘹缁剧櫢绱濋幏鎺旂卜閸濆牆绗囬妴鎴窗
 *    閹稿洨姹楅敍鍧抜ngerprint閿涘绗夐崘宥嗘Ц閸樺缂夐崥搴ｆ畱8娴ｅ秴鎼辩敮灞界摟缁楋讣绱濋懓灞炬Ц鐎?缁涙梹顢嶉惃?*缁绢垱妲戦弬?*閵?
 *    娓氬顩ч敍姝氶崡锛勫娣囶攣{c2::閹槅}` 閻ㄥ嫭瀵氱痪鐟版皑閺?`"閹?`閵?
 *    闂傤喚鐡熼崡锛勬畱閹稿洨姹楃亸杈ㄦЦ `"缁涙梹顢嶉崗銊︽瀮"`閵?
 *
 * 3. 閵嗘劕鐪柈銊ょ瑐娑撳鏋冮敍鍦昽ntext閿涘鈧埊绱?
 *    娑撳﹣绗呴弬鍥︾瑝閸愬秵妲搁弫缈犻嚋濞堜絻鎯ら惃鍕閸氬函绱濋懓灞炬Ц**缁毖嗗垱閹稿洨姹楅幍鈧崷銊ょ秴缂?*閻ㄥ嫬澧?0娑擃亜鐡х粭锕€鎷伴崥?0娑擃亜鐡х粭锔衡偓?
 *    鏉╂瑤濞囧妤€鎮撴稉鈧悰宀勫櫡閸戣櫣骞囨稉銈勯嚋閻╃鎮撻惃鍕槤閿涘牆顩ф稉銈勯嚋"閺?閿涘绡冮懗鍊燁潶鐎瑰瞼绶ㄩ崠鍝勫瀻閵?
 *
 * 4. 閵嗘劗绨跨涵顔兼綏閺嶅浄绱橲pan閿涘绗岄崶鐐衡偓鈧張鍝勫煑閵嗘埊绱?
 *    瀵洖鍙嗘禍?span閿涘牆鐡х粭锕€浜哥粔濠氬櫤閿涘顔囪ぐ鏇熷瘹缁剧懓婀弬鍥︽娑擃厾娈戠划鍓р€樻担宥囩枂閿涘本鏌熸笟鍨槻娑旂姵妞傛妯瑰瘨/闁喚鍍甸妴?
 *    婵″倹鐏夐崷銊ヮ槻娑旂姵妞傞崣鎴犲箛 span 婢跺嫮娈戦弬鍥х摟閸欐ü绨￠敍鍫㈡暏閹撮绱潏鎴滅啊閺傚洣娆㈢€佃壈鍤ч崑蹇曅╅敍澶涚礉
 *    缁崵绮烘导姘焺閻?RepetitionItem閿涘牆顦叉稊鐘虹殶鎼达附鏆熼幑顕嗙礆娑擃厺绻氱€涙娈?lastKnown(闁挎氨鍋? 闁插秵鏌婇幍鎾冲瀻閿?
 *    閹垫儳鍩岀€瑰啰骞囬崷銊ф畱閺傞缍呯純顕嗙礉楠炴儼鍤滈崝銊ゆ叏婢?span閵?
 *
 * ============================================================================
 */

import { SRSettings } from "src/settings";
import { CardType, QuestionText } from "src/Question";
import { parse, ParsedQuestionInfo } from "src/parser";
import { RPITEMTYPE } from "./repetitionItem";
import { DEFAULT_DECKNAME } from "src/constants";

// ============================================================================
// 缁鐎风€规矮绠熼崠鍝勭厵
// ============================================================================

/**
 * TrackedSpan 閳ユ柡鈧?缁墽鈥橀惃鍕⒖閻炲棗娼楅弽?
 *
 * 閻劋绨拋鏉跨秿鐠囥儲瀵氱痪鐟版躬 Markdown 閺傚洣娆㈡稉顓犳畱閸忚渹缍嬬€涙顑佺挧閿嬵剾娴ｅ秶鐤嗛妴?
 * - 娑撹桨绮堟稊鍫ｎ洣鐠佹澘缍?block 閻ㄥ嫬娼楅弽鍥风吹 娑撹桨绨℃径宥勭瘎閺冩儼鍏橀幎濠冩殻閸欍儴鐦?閺佺繝閲滈崸妤€褰囬崙鐑樻降鐏炴洜銇氶妴?
 * - 娑撹桨绮堟稊鍫ｎ洣鐠佹澘缍?start/end Offset閿?娑撹桨绨￠崷銊︽殻閸欍儴鐦介柌宀€绨块崙鍡楁勾閹跺﹨绻栨稉顏勭摕閹告牗甯€/妤傛ü瀵掗妴?
 */
export interface TrackedSpan {
    startOffset: number; // 閹稿洨姹?鐎?閺堫剝闊╅惃鍕崳婵鐡х粭锔惧偍瀵洩绱欓惄绋款嚠娴滃骸鍙忛弬鍥︽閿?
    endOffset: number; // 閹稿洨姹?鐎?閺堫剝闊╅惃鍕波閺夌喎鐡х粭锔惧偍瀵?
    blockStartOffset: number; // 鐠囥儱宕遍悧鍥ㄥ閸︺劍顔岄拃?閸ф娈戠挧宄邦潗鐎涙顑佺槐銏犵穿
    blockEndOffset: number; // 鐠囥儱宕遍悧鍥ㄥ閸︺劍顔岄拃?閸ф娈戠紒鎾存将鐎涙顑佺槐銏犵穿
}

/**
 * TrackedItem 閳ユ柡鈧?閺堚偓缂佸棛鐭戞惔锔炬畱鏉╁€熼嚋閸楁洖鍘撻敍鍫濈摕/缁涙梹顢嶉敍?
 *
 * 瑜拌绨抽崣鏍﹀敩娴滃棙妫惃?CardInfo閵?
 * 娑撯偓閺?TrackedItem = 娑撯偓娑擃亞瀚粩瀣畱婢跺秳绡勭€圭偘缍嬮妴?
 */
export class TrackedItem {
    fingerprint: string; // 閺嶇绺鹃敍姘閺傚洦瀵氱痪鐧哥礄婵?"娑?閵?闂傤喚鐡熼崡锛勬畱缁涙梹顢?閿?
    reviewId: number; // 閸忋劌鐪径宥勭瘎妞?ID閿?1 鐞涖劎銇氶弬鏉垮絺閻滄壆娈戦妴浣界箷濞屄ょ箻闂冪喎鍨惃鍕煀閸椻槄绱?
    lineNo: number; // 閹碘偓閸︺劏顢戦崣鍑ょ礄閻劋绨崚婵囶劄閹垫挸鍨庨崪灞界暰娴ｅ稄绱?
    context: string; // 鐏炩偓闁劋绗傛稉瀣瀮閿涘牏鎻ｇ拹瀛樺瘹缁惧湱娈戦崜?0 + 閸?0鐎涙顑侀敍?
    cardType: CardType; // 缁鐎烽敍娆矻OZE 閹?QA
    clozeId: string | null; // 娴犲懐鏁ゆ禍?CLOZE閿涘苯顩?"c1"閵?c2"閿涘本妯夌粈鐑樻娴ｈ法鏁ら敍灞肩瑝閸欏倷绗岄崠褰掑帳
    span: TrackedSpan; // 缁墽鈥橀惃鍕⒖閻炲棗娼楅弽?

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
 * ITrackedFile 閹恒儱褰涢敍鍫㈡暏娴?JSON 鎼村繐鍨崠鏍电礆
 */
export interface ITrackedFile {
    path: string;
    items: Record<string, number>; // 缁楁棁顔囩痪褍鍩嗛惃鍕槻娑?ID
    trackedItems?: TrackedItem[]; // 閸欐牔鍞禍鍡樻＋閻?cardItems
    tags: string[];
}

// ============================================================================
// TrackedFile 缁?閳ユ柡鈧?閺傚洣娆㈡潻鍊熼嚋閻ㄥ嫭鐗宠箛鍐
// ============================================================================

export interface CardItemSummary {
    lineNo: number;
    itemMap: Record<string, number>;
}

export class TrackedFile implements ITrackedFile {
    path: string;
    items: Record<string, number>;
    trackedItems?: TrackedItem[];
    tags: string[];

    get cardItems(): CardItemSummary[] {
        const groupedItems = new Map<number, Record<string, number>>();

        for (const trackedItem of this.trackedItems ?? []) {
            const itemMap = groupedItems.get(trackedItem.lineNo) ?? {};
            const fallbackKey = `c${Object.keys(itemMap).length + 1}`;
            const key = trackedItem.clozeId ?? (itemMap["c1"] === undefined ? "c1" : fallbackKey);
            itemMap[key] = trackedItem.reviewId;
            groupedItems.set(trackedItem.lineNo, itemMap);
        }

        return [...groupedItems.entries()]
            .sort(([left], [right]) => left - right)
            .map(([lineNo, itemMap]) => ({ lineNo, itemMap }));
    }

    static create(data: ITrackedFile): TrackedFile {
        let tf = new TrackedFile(data.path);
        const type = (data.tags?.[0] as RPITEMTYPE) || RPITEMTYPE.NOTE;
        const dname = data.tags?.[1];
        tf.setTracked(type, dname);
        tf.items = data.items || { file: -1 };

        // 鐎圭偘绶ラ崠?TrackedItems
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
     * 閼惧嘲褰囬幐鍥х暰鐞涘苯褰块崪?holeId 閻?TrackedItem閿涘牊鏌婇弸鑸电€悽銊ょ艾閺勭姴鐨犳径宥勭瘎鐎电钖勯惃鍕弳閸欙綇绱?
     */
    getTrackedItem(lineNo: number, clozeId: string): TrackedItem | undefined {
        if (!this.trackedItems) return undefined;
        // 閸忕厧顔愭径鍕倞閿涙艾顕禍搴㈡＋閺佺増宓侀幋鏍ㄧ梾閺堝鐡熸担宥囨畱闂傤喚鐡熼崡鈽呯礉鐎瑰啰娈?clozeId 閸欘垵鍏橀弰?null 閹?undefined閵嗗倻绮烘稉鈧惇瀣╃稊 "c1"
        const normCloze = (id: string | null | undefined) =>
            id === null || id === undefined ? "c1" : id;
        const targetCloze = normCloze(clozeId);

        // 閸忓牏绨跨涵顔煎爱闁板稄绱扮悰灞藉娇 + clozeId
        let item = this.trackedItems.find(
            (i) => i.lineNo === lineNo && normCloze(i.clozeId) === targetCloze,
        );

        // 婵″倹鐏夌€涙ê婀潪璇蹭簳闁挎瑨顢戦敍灞藉帒鐠侀晲绔寸€规俺瀵栭崶瀵告畱瀵鈧勭叀閹?
        // 閸忔娊鏁穱顔碱槻閿涙艾鑴婇幀褍鐪伴弻銉﹀韫囧懘銆忔稉銉︾壐閸栧綊鍘?clozeId閿涘苯鎯侀崚娆忔倱娑撯偓娑擃亪妫剁粵鏃堫暯閻ㄥ嫬顦挎稉顏呭缁岄缚顕Ч鍌欑窗閸忋劍灏嬮崚鏉挎倱娑撯偓娑?reviewId 娑撳绱欓崶鐘辫礋鐠烘繄顬囬惄鍝ョ搼閿?
        if (!item) {
            const candidates = this.trackedItems.filter(
                (i) => normCloze(i.clozeId) === targetCloze,
            );
            if (candidates.length > 0) {
                // 鐎电粯澹樼捄婵堫瀲閺堚偓鏉╂垹娈?
                item = candidates.reduce((a, b) =>
                    Math.abs(a.lineNo - lineNo) < Math.abs(b.lineNo - lineNo) ? a : b,
                );

                // 娑撹桨绨￠梼鍙夘剾婢舵岸鍣搁幐鏍敄閺冨墎娈戦幁鑸碘偓褍鎮庨獮璁圭礉婵″倹鐏夐幍鎯у煂閻ㄥ嫬顕挒陇绐涚粋鑽ゆ窗閺嶅洩顢戞径顏囩箼閿涘牆顩?> 5 鐞涘矉绱氶敍灞惧珕缂佹繂鎯涢梽?
                if (item && Math.abs(item.lineNo - lineNo) > 5) {
                    item = undefined;
                }
            }
        }
        return item;
    }

    /**
     * 閵嗘劖鐗宠箛鍐ㄥ弳閸欙絻鈧垵鎮撳銉︽瀮娴犳湹鑵戦惃鍕閺堝鐡熺痪褑顔囪ぐ?
     *
     * 1. 鐟欙絾鐎介弬鍥︽閼惧嘲褰囬弬鐗堟殶閹?-> expandToCandidates 鐏忓棙顔岄拃鑺ュ閸掑棙鍨氭稉鈧稉顏冮嚋閻ㄥ嫬鐡?
     * 2. 閺冄嗩唶瑜?vs 閺傛澘鈧瑩鈧姹?-> matchItems 閹笛嗩攽 閹稿洨姹楅崠褰掑帳+閹垫挸鍨庡☉鍫燁劆
     * 3. 鐠侊紕鐣婚崚鐘绘珟娴滃棗鎽㈡禍娑橆槻娑旂姾顔囪ぐ?
     *
     * @returns { hasChange, removedIds }
     */
    syncNoteCardsIndex(
        fileText: string,
        settings: SRSettings,
        callback?: (cardText: string, cardInfo: unknown) => void,
    ): { hasChange: boolean; removedIds: number[] } {
        // 1. 鐠佹澘缍嶉崥灞绢劄閸撳秶娈戦張澶嬫櫏婢跺秳绡?ID
        const oldIdSet = new Set<number>();
        if (this.trackedItems) {
            this.trackedItems.forEach((item) => {
                if (item.reviewId >= 0) oldIdSet.add(item.reviewId);
            });
        }

        // 2. 鐠嬪啰鏁?parser.ts 鐟欙絾鐎介敍鍫ｅ箯閸欐牗顔岄拃鐣岄獓閻ㄥ嫬宕遍悧鍥╃波閺嬪嫸绱?
        // 鏉╂瑩鍣峰▽璺ㄦ暏閺冄団偓鏄忕帆閿涘苯鐫嗛拕鎴掔啊 HTML 鐠嬪啫瀹冲▔銊╁櫞
        const parsedQuestions: ParsedQuestionInfo[] = parse(fileText, settings);

        // 3. 鐏忓棌鈧粍顔岄拃鐣岄獓閳ユ繄绮ㄩ弸婊愮礉鐏炴洖绱戞稉琛♀偓婊冪摕缁狙€鈧繄娈戦崐娆撯偓澶庘偓?(Candidate Items)
        const candidates = expandToCandidates(parsedQuestions, fileText, settings);

        if (!this.trackedItems) this.trackedItems = [];
        const oldCardCount = this.trackedItems.length;

        // 4. 閹笛嗩攽閺嶇绺鹃崠褰掑帳缁犳纭堕敍姘＋鐠佹澘缍?娑?閺傛澘鈧瑩鈧?鏉╂稖顢戦崠褰掑帳
        this.trackedItems = matchItems(this.trackedItems, candidates);

        // 閹稿顢戦崣閿嬪笓鎼村骏绱濇穱婵囧瘮閻椻晝鎮婃い鍝勭碍
        this.trackedItems.sort((a, b) => a.lineNo - b.lineNo);

        // 5. 鐠侊紕鐣荤悮顐㈠灩闂勩倗娈?ID閿涘牅浜掗崜宥嗘箒閿涘瞼骞囬崷銊ュ爱闁板秳绗夋稉濠佺啊 = 楠炵晫浼掗崡?瀹歌尪顫﹂崚鐙呯礆
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

        // 閸欐垹骞囬弬鏉垮幢閿涘澁eviewId == -1閿涘鍨ㄩ弫浼村櫤閸欐ê瀵查幋鏍ㄦ箒閸掔娀娅庨敍宀勫厴缁犳婀侀崣妯哄
        const hasNewCards = this.trackedItems.some((i) => i.reviewId === -1);
        const hasChange =
            oldCardCount !== this.trackedItems.length || hasNewCards || removedIds.length > 0;

        return { hasChange, removedIds };
    }
}

// ============================================================================
// 缁楊兛绔撮梼鑸殿唽閿涙艾鐨㈢憴锝嗙€界紒鎾寸亯鐏炴洖绱戞稉鍝勭摕缁狙嶇礄Candidate閿?
// ============================================================================

/**
 * 鐏忓棜袙閺嬫劕鍤惃鍕唽閽€鐣岄獓 Question 鐏炴洖绱戞稉杞扮娑擃亙閲滈悪顒傜彌閻ㄥ嫧鈧粌鐡熼崐娆撯偓澶庘偓鍛偓?
 */
function expandToCandidates(
    parsedQuestions: ParsedQuestionInfo[],
    fileText: string,
    settings: SRSettings,
): TrackedItem[] {
    const candidates: TrackedItem[] = [];

    // 濡偓濞村宕茬悰宀€顑侀梹鍨娴犮儳绨跨涵顔款吀缁犳浜哥粔?
    const lineBreakLen = fileText.includes("\r\n") ? 2 : 1;
    const lines = fileText.split(/\r?\n/);

    for (const question of parsedQuestions) {
        if (question.text.includes(settings.editLaterTag)) continue;

        // 鐠侊紕鐣绘潻娆庨嚋閸ф绱欏▓浣冩儰閿涘娈戠划鍓р€樼挧宄邦潗閸滃瞼绮ㄩ弶鐔蜂焊缁夊鍣?
        let blockStartOffset = 0;
        for (let i = 0; i < question.firstLineNum && i < lines.length; i++) {
            blockStartOffset += lines[i].length + lineBreakLen;
        }
        let blockEndOffset = blockStartOffset;
        for (let i = question.firstLineNum; i <= question.lastLineNum && i < lines.length; i++) {
            blockEndOffset += lines[i].length + lineBreakLen;
        }
        if (blockEndOffset > blockStartOffset) blockEndOffset -= lineBreakLen;

        const cleanText = QuestionText.splitText(question.text, settings)[1]; // 閸撱儳顬囩拫鍐ㄥ娣団剝浼?

        if (question.cardType === CardType.Cloze || question.cardType === CardType.AnkiCloze) {
            // 閹绘劕褰囬幍鈧張澶婏綖缁屽搫鐡熼妴鍌氫海鐠佹儳鍞撮柈銊ㄧ窡閸斺晛鍤遍弫鎷屽厴閹绘劕褰囬崙鍝勭摕閻ㄥ嫬鍞寸€圭懓鎷扮仦鈧柈銊ヤ焊缁?
            const holes = extractHolesWithOffsets(cleanText, settings);

            for (const hole of holes) {
                // 鐠侊紕鐣荤拠銉ョ摕閸︺劌鍙忛弬鍥﹁厬閻ㄥ嫮绮风€电懓浜哥粔?
                const startOffset = blockStartOffset + hole.localStart;
                const endOffset = blockStartOffset + hole.localEnd;

                candidates.push(
                    new TrackedItem(
                        hole.answerText, // 閹稿洨姹楅敍姘摕閻ㄥ嫭妲戦弬鍥у敶鐎?
                        question.firstLineNum,
                        extractContext(fileText, startOffset, endOffset), // 缁毖嗗垱鐎涙梻娈戦崜宥呮倵 50 鐎涙顑?
                        CardType.Cloze,
                        { startOffset, endOffset, blockStartOffset, blockEndOffset },
                        hole.clozeId,
                        -1, // 閺傛澘鈧瑩鈧鈧懎鐨婚張顏勫瀻闁?reviewId
                    ),
                );
            }
        } else {
            // 闂傤喚鐡熼崡?(QA / Reversed QA)
            // 閹稿洨姹楅惄瀛樺复娴ｈ法鏁ら垾婊呯摕濡楀牆鍙忛弬鍥ｂ偓?
            const answerText = extractQAAnswer(cleanText, settings, question.cardType);

            // 娑撹桨绨＄粻鈧崠鏍电礉闂傤喚鐡熼崡锛勬畱鐎涙柨娼楅弽鍥ф皑鐠佸彞璐熼弫缈犻嚋閸ф娈戦崥搴″磹闁劌鍨庨幋鏍ㄦ殻娴?
            // (婵″倹鐏夐棁鈧憰渚€鐝禍顔芥殻娑擃亞鐡熷鍫礉閸欘垯浜掗崷銊ㄧ箹闁插苯浠涚划鎯у櫙閺屻儲澹樼粵鏃€顢嶉幍鈧崷銊ф畱 localOffset)
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
// 缁楊兛绨╅梼鑸殿唽閿涙碍鐗宠箛鍐ㄥ爱闁板秵澧﹂崚鍡欑暬濞夋洩绱檓atchItems閿?
// ============================================================================

/**
 * 鐏忓棛骞囬張澶屾畱閺冄嗩唶瑜版洑绗岄弬鎷屝掗弸鎰畱閸婃瑩鈧顔囪ぐ鏇＄箻鐞涘苯灏柊宥忕礉缂佈勫婢跺秳绡勬潻娑樺閿涘澁eviewId閿?
 */
function matchItems(oldItems: TrackedItem[], candidates: TrackedItem[]): TrackedItem[] {
    // 1. 閸掑棗鍩嗛幐?fingerprint 鏉╂稖顢戦崚鍡欑矋
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

    // 2. 閸︺劌鎮撻幐鍥╂睏缂佸嫬鍞存潻娑滎攽閸栧綊鍘?
    for (const [fp, oldGroup] of oldByFp.entries()) {
        const newGroup = (newByFp.get(fp) || []).filter((c) => !usedNew.has(c));

        if (newGroup.length === 0) continue; // 閺冄呮畱鏉╂瑤閲滈幐鍥╂睏濞屸€茬啊 -> 楠炵晫浼掗崡鈥叉丢瀵?

        // 韫囶偊鈧喎灏柊宥忕窗1鐎?
        if (oldGroup.length === 1 && newGroup.length === 1) {
            const oldC = oldGroup[0];
            const newC = newGroup[0];
            usedNew.add(newC);
            newC.reviewId = oldC.reviewId; // 缂佈勫婢跺秳绡勬潻娑樺
            result.push(newC);
            continue;
        }

        // 閹垫挸鍨庨崠褰掑帳閿涙艾顦跨€电懓顦?閹?1鐎电懓顦?
        type Pair = { old: TrackedItem; cand: TrackedItem; score: number };
        const allPairs: Pair[] = [];

        for (const oldC of oldGroup) {
            const lineScores = calculateLineScores(oldC.lineNo, newGroup);
            for (const newC of newGroup) {
                // 娑撳﹣绗呴弬鍥╂祲娴肩厧瀹抽崡?50 閸?
                const ctxScore = stringSimilarity(oldC.context, newC.context) * 50;
                // 鐞涘苯褰块幒銉ㄧ箮鎼达箑宕?50 閸?
                const lineScore = lineScores.get(newC) || 0;

                // 楠炲啿鍨庨崚銈嗗祦閿涙艾顩ч弸?clozeId 娑旂喍绔撮弽鍑ょ礉缂佹瑥浜曠亸蹇撳閸掑棙澧﹂惍鏉戦挬鐞?(婢跺嫮鎮婇崥灞肩鐞涘本婀佺€瑰苯鍙忔稉鈧弽宄板敶鐎瑰湱娈戞稉銈勯嚋鐎?
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
            pair.cand.reviewId = pair.old.reviewId; // 缂佈勫
            result.push(pair.cand);
        }
    }

    // 3. 閹碘偓閺堝婀悮顐㈠爱闁板秶娈戦弬鏉库偓娆撯偓澶涚礉闁姤妲搁崗銊︽煀閻ㄥ嫬宕遍悧?
    for (const cand of candidates) {
        if (!usedNew.has(cand)) {
            // cand.reviewId 閻╊喖澧犻弰?-1閿涘奔绻氶幐浣稿斧閺嶅嘲濮為崗?
            result.push(cand);
        }
    }

    return result;
}

// ============================================================================
// 缁楊兛绗侀梼鑸殿唽閿涙艾顦叉稊鐘虫埂闂傚娈?Span 閺嶏繝鐛欐稉搴℃礀闁偓闁插秴鐣炬担?(閸╄桨绨柨姘卞仯)
// ============================================================================

/**
 * 閹恒儱褰涢敍姘辨暏娴滃骸顦叉稊鐘绘Е閸掓ぞ绱堕崗銉ф畱閳ユ粌宸婚崣鏌ユ晪閻愬厜鈧繐绱濇稊鐔锋皑閺勵垯缍樼拠纾嬬箖閻?lastKnown.context / lineNo
 */
// ============================================================================
// 瀹搞儱鍙块崙鑺ユ殶閿涙碍褰侀崣鏍祲閸?
// ============================================================================

/**
 * 閹绘劕褰囩仦鈧柈銊ょ瑐娑撳鏋冮敍姘辨彛鐠愬瓨瀵氱痪閫涚秴缂冾喚娈戦崜?50 閸?閸?50
 */
function extractContext(fileText: string, startOffset: number, endOffset: number): string {
    const preContext = fileText.substring(Math.max(0, startOffset - 50), startOffset);
    const postContext = fileText.substring(endOffset, Math.min(fileText.length, endOffset + 50));
    return preContext + postContext;
}

/**
 * 閸楃姳缍呭Ο鈩冨珯閹绘劕褰囨繅顐も敄鐎涙梻娈戞担宥囩枂閿涘牆鐤勯梽鍛存付鐟曚焦鐗撮幑?settings.clozePatterns 鏉╂劘顢戝锝呭灟閿?
 * 鏉╂柨娲栭弽鐓庣础閿涙 answerText: "娑?, localStart: 10, localEnd: 11, clozeId: "c1" }
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

    const ankiMatches = [...cleanText.matchAll(/\{\{c(\d+)(?:::|：：)(.*?)(?:::|：：)?\}\}/gi)];
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
}

/**
 * 閸楃姳缍呭Ο鈩冨珯閹绘劕褰囬梻顔剧摕閸楋紕娈戠粵鏃€顢嶉崘鍛啇
 */
function extractQAAnswer(cleanText: string, settings: SRSettings, type: CardType): string {
    // 闂傤喚鐡熼崡陇顫︾€电懓绨查惃鍕瀻闂呮梻顑侀崚鍡樺灇閸撳秴鎮楁稉銈夊劥閸掑棎鈧倸浜ｇ拋?parser.ts 閻ㄥ嫰鈧槒绶敍灞惧灉娴狀剙褰叉禒銉х暆閸栨牔璐熼敍?
    // 婵″倹鐏夐弰?QA閿涘瞼鐡熷鍫濇躬閸掑棝娈х粭锕€鎮楅棃顫偓鍌濈箹闁劌鍨庨棁鈧笟婵婄閸忚渹缍嬮崚鍡涙缁楋箑鐤勯悳甯礉鏉╂瑩鍣烽崑姘悏娴狅絿鐖滃鏃傘仛閿?
    const parts = cleanText.split(settings.singleLineCardSeparator);
    if (parts.length > 1) return parts[1].trim();
    return cleanText; // 閸忔粌绨?
}

// ============================================================================
// 瀹搞儱鍙块崙鑺ユ殶閿涙氨娴夋导鐓庡閹垫挸鍨庣拋锛勭暬
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

