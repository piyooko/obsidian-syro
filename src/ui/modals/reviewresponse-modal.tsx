// https://img.shields.io/github/v/release/chetachiezikeuzor/cMenu-Plugin
import { App, MarkdownView, Menu, MenuItem, Platform, TFile, setIcon, Notice } from "obsidian";
import { textInterval } from "src/scheduling";
import { SRSettings } from "src/settings";
import { t } from "src/lang/helpers";
// import { FlashcardModalMode } from "src/gui/flashcard-modal";
import { SrsAlgorithm } from "src/algorithms/algorithms";
import { RepetitionItem } from "src/dataStore/repetitionItem";
// import { debug } from "src/util/utils_recall";
import { TouchOnMobile } from "src/Events/touchEvent";
import { Iadapter } from "src/dataStore/adapter";
import SRPlugin from "src/main";
import * as MixQueSet from "src/dataStore/mixQueSet";
import { FlashcardReviewMode } from "src/FlashcardReviewSequencer";

/**
 * reviewResponseModal 缂?
 *
 * 闁哄鏅滈悷锕€危閸涘﹦鈻旈柍褜鍓氱粙澶愵敂閸涱厺澹曞┑鐐存儗閸犳艾鈻撻幋鐘冲珰闁告洦鍋勯悗濠氭煛?(Floating Bar)闂佹寧绋戦惉濂稿极閵堝棛顩查幖绮瑰墲闊剟鏌ｉ～顒€濡介柛鈺傜⊕瀵板嫬顓奸崟顓犳缂備焦顨嗗Λ渚€顢欓崶顒€绠ｉ柡宓啫鑰块梺缁橆殔濞诧箑顪冮崒娑欎氦婵炴垶绮犻弨浠嬫偣閸パ冾仼闁搞劌閰ｉ弫宥夊捶濮婃仩y, Good, Hard, Reset 缂備焦绋戦¨鈧紒杈ㄥ哺婵?
 * 闁诲海鎳撻崯鎾焵椤掍浇澹橀柣鏍х埣瀵即宕滆娴犳盯鏌涢敂鍝勫闁荤噥浜為幏瀣箥椤旇姤鐝梻鍌氱墑閸ㄨ鈻撻幋鐐村劅闁哄洢鍨归崝銉╂煙鐎涙澧柛娆戝亾缁傛帡寮介妸锔规灃闂佹垝鐒﹂妵鐐电礊閸涱垳纾炬い鏃囥€€閸?
 *
 * 闁诲海鎳撻崯顖炲极椤曗偓楠炴劖绗熸繝鍕崶
 * 1. 闂佸憡绻傜粔瀵歌姳閺屻儱绠板鑸靛姈鐏?(Hard, Good, Easy) 闂佹眹鍔岀€氼剚鎱ㄩ埡鍛畱濞达絿鍎ら弲鎼佹煙鐎涙ê濮傞柍?
 * 2. 缂備礁顦抽褎鎱ㄩ埡鍐崥妞ゆ牗绮抽弴銏犵闁告稑锕ら·渚€鏌涢弮鈧€笛囧极椤曗偓楠炴劖鎷呯喊妯轰壕?
 * 3. 闂佸搫瀚晶浠嬪Φ?闂傚倸鎳忛崝妯何涘畝鍕拻闁圭虎鍠楅楣冩煛閸愩劎鍩ｆ俊?(Intervals)闂?
 * 4. FSRS 闂佸憡绮岄惌鍌滃垝椤栨粍濯?Anki 缂備胶濮甸〃鍡欐兜閸洘鍎嶉柛鏇ㄥ灙閸嬫捇宕掗悙鎻掕祴闂?
 */
export class reviewResponseModal {
    private static instance: reviewResponseModal;
    private app: App;
    public plugin: SRPlugin;
    private settings: SRSettings;
    public submitCallback: (resp: number) => void;
    private algorithm: SrsAlgorithm;
    private ownerdoc: Document; // 闂佸湱顣介崑鎾绘倶閻愰潧浠﹂柡瀣暙椤╁ジ鏁愰崪浣告闁荤姷鍋愬Σ鍕濠靛鍋ㄩ柕濞垮€楅懝鎯瑰鍐惧剮婵炲棎鍨介幆鍕箣濠靛洤鍓?
    private vwcontainerEl: HTMLElement; // 闁荤喐鐟ュΛ妤€霉濡皷鍋撻崷顓熷殌婵?
    private containerEl: HTMLElement; // 闂佺厧顨庢禍锝夋閳哄啠鍋撻崷顓熷殌婵?
    private contentEl: HTMLElement;

    barId = "reviewResponseModalBar";
    private barItemId: string = "ResponseFloatBarCommandItem";
    answerBtn: HTMLButtonElement;
    buttons: HTMLButtonElement[];
    response: HTMLDivElement; // 闁荤姴娲ょ€氼剟宕规惔銊ョ濠㈣埖鍔栫亸锕傛煕閺嵮勬儓闁?
    controls: HTMLDivElement; // 闂佺鐭囬崘銊у幀闂佸湱顭堥ˇ鐢稿箰閹惰棄绀岄柛婵嗗閸?(闂佹椿娼块崝瀣姳椤掑嫬纭€闁挎稑瀚。?
    private notecontrols: HTMLDivElement; // 缂備焦顨嗗Λ渚€顢欓崶顒€绠崇憸宥夊春濡ゅ懎绠板鑸靛姈鐏忥箓鏌涢弽褎鎯堥柣?
    private skipButton: HTMLButtonElement;
    private responseInterval: number[]; // 闂佸憡鑹剧€氼亪鏌屽鍛珰闁告洦鍋勯悗濠氭倵閻㈠灚鍤€缂併劍鐓￠幆鍐礋椤忓棛鎲┑鐐叉閳ь剚鍓氬Σ璇测槈閺冨倸鈻堟俊顐㈡健濮?
    private item: RepetitionItem; // 閻熸粎澧楅幐鍛婃櫠閻樺啿绶炵€广儱瀚惁搴☆渻?
    private showInterval = true; // 闂佸搫瀚烽崹浼村箚娓氣偓瀵即宕滆娴犳盯姊婚崒娑欏唉婵炲爜鍥х睄闁割偅娲橀敍鐔兼煛閸屾碍澶勬繝鈧?
    private buttonTexts: string[];
    private options: string[]; // 闁荤姴娲ょ€氼剟宕规惔銊︾劵濠㈣埖鍔戦埀?(e.g. ['Reset', 'Hard', 'Good', 'Easy'])
    private _reviewMode: FlashcardReviewMode;

    // 闂佹悶鍎抽崑鐘绘儍閻旂厧绀勯柤鎭掑劜濞?
    respCallback: (resp: number) => Promise<void> | void;
    showAnsCB: () => void;
    public cardtotalCB: () => number;
    public notetotalCB: () => number;
    public openNextCardCB: () => void;
    public openNextNoteCB: () => void;
    public barCloseHandler: () => void;
    infoButton: HTMLButtonElement;

    // 闂佸憡顨嗗ú鎴犳閵夆晜鍤旂€瑰嫭婢樼徊?
    static getInstance() {
        return reviewResponseModal.instance;
    }

    constructor(plugin: SRPlugin, settings: SRSettings) {
        this.app = plugin.app;
        this.plugin = plugin;
        this.settings = settings;
        const algo = settings.algorithm;
        // 闂佸搫绉烽～澶婄暤娴ｈ櫣涓嶆俊銈勮兌閵嗗﹪寮堕悙鑸殿棄闁告瑥妫濋獮鎰緞閹邦厼鍞夐梺鍝勫€稿ú锕€锕?
        this.buttonTexts = settings.responseOptionBtnsText[algo];
        this.algorithm = SrsAlgorithm.getInstance();
        this.options = this.algorithm.srsOptions();
        reviewResponseModal.instance = this;
    }

    /**
     * 闂佸搫瀚晶浠嬪Φ濮樿鲸瀚氶柛鏇ㄥ亜閻庡鏌?
     * @param item 婵犮垼娉涚粔宕囧姬閸曨兙浜?
     * @param callback 闁荤姴娲ょ€氼剟宕规惔銊ョ倞闁绘劕澧庡▓?
     * @param front 闂佸搫瀚烽崹浼村箚娓氣偓瀵即宕滆娴犳稒鎱ㄥ┑鎾剁М婵為棿鍗抽弫宥夊醇濠垫劖鎼愰梺鍝勵儐缁秴危閹间礁纭€闁挎稑瀚。濠氭煥?
     */
    public display(
        item?: RepetitionItem,
        callback?: (resp: number) => Promise<void>,
        front?: boolean,
    ): void {
        const settings = this.settings;

        // 濠碘槅鍋€閸嬫捇鏌＄仦璇插姤妞ゆ梹娲滅槐鏃堫敊閼恒儛锕傛煕濮樺墽鐣遍柛妯诲灩閹峰宕ㄦ繝鍐ｆ灃缂備讲鍋?
        if (!settings.reviewResponseFloatBar || !settings.autoNextNote) return;

        if (item) {
            this.item = item;
            // 婵☆偅婢樼€氼垶顢橀崫銉т笉婵°倐鍋撻柟顔兼处缁嬪顢旈崶鈺傤潠闂佸憡甯掑Λ娑樷枔閹寸偟鈻旈悗锝傛櫇椤忚鲸绻涢崱蹇婂亾閹颁焦些婵炴垶姊绘繛鈧俊顐㈡健濮?
            this.responseInterval = this.algorithm.calcAllOptsIntervals(item);
        } else {
            this.item = undefined;
            this.responseInterval = null;
        }

        // 婵犵鈧啿鈧綊鎮樻径瀣氦婵☆垵宕靛楣冩煕閹烘挾鈽夌紓?DOM闂佹寧绋戦懟顖炲储濞戙垹鍑犻柛鏇ㄥ亞缁?
        if (!this.hasBar() || !this.buttons) {
            this.build();
        }
        this.containerEl.show();

        if (callback) {
            this.respCallback = callback;
        }

        // 闂佺粯顭堥崺鏍焵椤戣法鍔嶆繛鎻掓健瀵剛鏁鍓х崶闂佸搫瀚晶浠嬪Φ濮樿埖鈷掓い鏇楀亾妞わ綀濮ゅ璇参熺紒妯烇妇绱掑☉娆愨拹妞?
        if (this.item.isCard && front !== false) {
            this.showQuestion();
        } else {
            this.showAnswer();
        }
    }

    /**
     * 闂佸搫顑呯€氼剛绱?DOM 缂傚倷鐒﹂幐濠氭倵?
     */
    build() {
        if (this.isDisplay()) return;

        const optBtnCounts = this.options.length;
        let btnCols = 4;
        // 缂備礁顦抽褎鎱ㄩ埡鍐崥妞ゆ牜鍋愰崑鎾诲磼閻愭彃璧?
        if (!Platform.isMobile && optBtnCounts > btnCols) {
            btnCols = optBtnCounts;
        }

        this.containerEl = createEl("div");
        this.containerEl.setAttribute("id", this.barId);
        this.containerEl.hide();

        // 闂佸湱绮敮鎺楀矗閸℃稑绀嗛柡澶庢硶缁夊ジ鏌涢幘宕囆ｇ紒鍝勬惈鐓ら柤濮愬€栭悾?Markdown 闁荤喐鐟ュΛ妤€霉濡崵鈻?
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        view?.containerEl?.appendChild(this.containerEl);

        if (view) {
            this.vwcontainerEl = view.containerEl;
            this.ownerdoc = view.containerEl.ownerDocument;
            this.addKeysEvent(); // 缂傚倷鐒﹂崹鐢告偩妤ｅ啯鐓ユい鏃傚亾绾剧霉濠婂喚鍎庢繛?

            // 闁荤喐鐟ュΛ妤€霉濮椻偓瀹曗€愁潰鐏炲墽銈伴梺鍝勫暢閸╂牜绮╂繝姘仩闁糕剝鑹惧▓浼存?
            view.onunload = () => {
                this.close();
                view.containerEl.removeChild(this.containerEl);
            };
        }

        // 闂佸憡甯楃粙鎴犵磽閹捐绀冮柛娑卞弾閸熷洭鎮楅崷顓熷殌婵?
        this.contentEl = this.containerEl.createDiv("sr-show-response");
        this.contentEl.addClass("sr-modal-content");
        this.contentEl.addClass("sr-flashcard");

        // 闂佺鐭囬崘銊у幀闂佸憡鐗曢幖顐︽偂?
        this.notecontrols = this.contentEl.createDiv();
        this.controls = this.contentEl.createDiv();

        // 闂佸憡绻傜粔瀵歌姳閺屻儱绀岄柛婵嗗閸?(Grid 闁汇埄鍨伴崯顐︽儑?
        this.response = this.contentEl.createDiv("sr-show-response");
        this.response.setAttribute("style", `grid-template-columns: ${"1fr ".repeat(btnCols)}`);

        this.buttons = [];
        this._createNoteControls();
        this.createButtons_responses(); // 闂佸憡甯楃粙鎴犵磽閹捐埖瀚氶柛鏇ㄥ亜閻庡鏌熺粙娆炬█闁?
        this.createButton_showAnswer(); // 闂佸憡甯楃粙鎴犵磽閹捐鐏虫繝濠傚閳绘梻绱掗埀顒勬惞閸︻厽鎲板┑鈩冾殔閻楀啴鍩€椤掍胶绠栭悗鍨矒閺?

        this.addMenuEvent(); // 缂傚倷鐒﹂崹鐢告偩妤ｅ啯鍤曟繝濠傚暙缁€?
        this.addTouchEvent(); // 缂傚倷鐒﹂崹鐢告偩閸撗勫枂闁挎棁濮ら崵?
        this._autoClose();
    }

    set reviewMode(reviewMode: FlashcardReviewMode) {
        this._reviewMode = reviewMode;
    }

    /**
     * 闂佸湱顭堥ˇ鐢稿箰閹惰姤鍊烽柣鐔告緲濮ｅ﹤顭跨捄鍝勵伀闁?
     * @param s 闂備緡鍋勯ˇ顕€鎳欓幋锔藉剭闁告洦鍨崑鎾村緞閹扳斁鍋撳鍥ｅ亾濞戞瑯娈樻い鎴滅劍缁?
     */
    private async buttonClick(s: string) {
        this.hideControls();
        let mqs: ReturnType<typeof MixQueSet.getInstance> | undefined;
        const iscard = this.item.isCard;

        // 濠电儑绲介崲鏌ュ箖鎼淬劍鈷撻柣鏂垮槻閻忔瑩姊洪锝嗩潡缂?(Card/Note 濠电儑绲介崲鏌ュ箖鎼淬垹绶炵€广儱瀚惁?
        if (
            this._reviewMode === FlashcardReviewMode.Review &&
            this.settings.mixCardNote &&
            this.openNextCardCB &&
            this.openNextNoteCB
        ) {
            mqs = MixQueSet.getInstance();
            MixQueSet.arbitrateCardNote(this.item, this.cardtotalCB(), this.notetotalCB());
        }

        // 闁荤姴顑呴崯浼村极閵堝洠鍋撻悽鍨殌缂併劍鐓￠幆鍐礋椤愶絿顦ラ柣?
        if (iscard && this.respCallback) {
            await Promise.resolve(this.respCallback(this.options.indexOf(s)));
        } else if (!iscard && this.submitCallback) {
            this.submitCallback(this.options.indexOf(s));
        }

        // 闂佺厧顨庢禍婊勬叏閳哄啯宕夐悗鍦У缁侇喖鈽夐幘鎰佸剮缂佹柨鐡ㄧ粙?
        if (mqs) {
            if (!iscard && MixQueSet.isCard()) {
                this.openNextCardCB();
                this._updateControls(true);
            } else if (iscard && !MixQueSet.isCard()) {
                this.openNextNoteCB();
                this._updateControls(false);
            }
        }
    }

    private _createNoteControls() {
        this.notecontrols.addClass("sr-header");
        this._createCloseButton(this.notecontrols);

        const div = this.notecontrols.createDiv();
        this._createIntervalButton(div); // 闂傚倸鍊归幐鍐测枔瑜斿浼村礈瑜嬫禒娑㈡煕閹烘垶澶勭€规洘鐓￠獮鎰緞閹邦厼鍞?
        this._createResetButton(div); // 闂備焦褰冪粔鍫曟偪閸℃稑绠板鑸靛姈鐏?
        this._createCardInfoButton(div); // 闁荤姴娴勯梽鍕磿韫囨稑绠板鑸靛姈鐏?
        this._createSkipButton(div); // 闁荤姴鎼悿鍥╂崲閸愵喖绠板鑸靛姈鐏?
        div.addClass("sr-controls");
        this.notecontrols.hide();
    }

    private _createResetButton(containerEl: HTMLElement) {
        const btn = containerEl.createEl("button");
        btn.addClasses(["sr-button", "sr-reset-button"]);
        setIcon(btn, "refresh-cw");
        btn.setAttribute("aria-label", t("RESET_CARD_PROGRESS"));
        btn.addEventListener("click", () => {
            void this.buttonClick(this.options[0]); // 闁稿娲╅鏇犵箔椤戣法顏卞☉鎿冧邯閳ь剙顦甸妴宥夊及?Reset
        });
    }

    private createButtons_responses() {
        this.options.forEach((opt: string, index) => {
            const btn = this.response.createEl("button");
            btn.setAttribute("id", "sr-" + opt.toLowerCase() + "-btn");
            btn.addClasses(["sr-response-button", "sr-is-hidden"]);

            // 闂佸吋鍎抽崲鑼躲亹閸モ晜鏆滈柨鏇炲€归敍鐔兼⒒閸涱喗鈷愭俊鐐插€垮鑽も偓闈涙啞閻ｉ亶鏌￠崒姘婵犫偓?
            const text = this.getTextWithInterval(index);
            btn.setText(text);
            btn.addEventListener("click", () => {
                void this.buttonClick(opt);
            });
        });
    }

    private createButton_showAnswer() {
        this.answerBtn = this.response.createEl("button");
        this.answerBtn.setAttribute("id", "sr-show-answer");
        this.answerBtn.addClasses(["sr-response-button", "sr-show-answer-button", "sr-bg-blue"]);
        this.answerBtn.setText(t("SHOW_ANSWER"));
        this.answerBtn.addEventListener("click", () => {
            this.hideControls();
            this.showAnsCB();
            this.showAnswer();
        });
        this.answerBtn.addClass("sr-is-hidden");
    }

    // ... (闂佺绻戝﹢鍦垝椤掑嫭鍎?createButton 闂佸搫鍊介～澶屾兜閸撲胶灏甸悹浣芥珪婵⊙囨煥濞戞鐏遍柡鍡樺姈濞煎宕堕宥呮疁缂傚倷绀佸Λ娆撳极閻愮儤鐓?

    /**
     * 闂備焦顑欓崰姘鸿箛鏃傤洸閻庯絺鏅滈钘夘熆鐠哄搫顏柟?
     * 闂佽　鍋撴い鏍ㄧ☉閻?Numpad 闂?Digit 闂備焦顑欓崰娑氭崲濡吋鍋樼€光偓閸愵亝顫栭梺?
     */
    private _keydownHandler = (e: KeyboardEvent) => {
        // 缂佺虎鍙庨崰鏇犳崲濮橆厾鈻旂€广儱瀚粣妤呮煕閿斿搫濡跨紒槌栦簼濞煎繘骞嬪┑鍥╁綔闁哄鐗婇幐鎼佸矗閸℃稑绫嶉柟顖炴緩閺囥垹鐭?
        const bar = this.vwcontainerEl.querySelector("#" + this.barId);

        if (
            bar &&
            bar.checkVisibility() &&
            this.isDisplay() &&
            Iadapter.instance.app.workspace.getActiveViewOfType(MarkdownView).getMode() ===
                "preview" && // 婵炲濮撮幊搴★耿椤忓拑绱ｉ柛鏇ㄥ櫘濞兼梹淇婇妞诲亾瀹曞洨顢呴梺姹囧灮閸犳劙寮查妷鈺傛櫖鐎光偓閸曨儷鈺傛叏濠靛嫬鐏辨い鏇樺€楅幉?
            this.answerBtn.hasClass("sr-is-hidden") // 婵炲濮撮幊搴★耿椤忓牆鍙婇柛鎾椾椒绮电紓浣圭⊕濮婂綊銆佸澶婅Е閹兼惌鍨崇粈鍕偣閸パ冾仼闁搞劌閰ｅ濂告嚋濞堝灝鏂€闂佹寧绋戦ˇ閬嶅极閹捐鏋?
        ) {
            const consume = () => {
                e.preventDefault();
                e.stopPropagation();
            };
            this.options.some((_opt, idx) => {
                const num = "Numpad" + idx;
                const dig = "Digit" + idx;
                if (e.code === num || e.code === dig) {
                    void this.buttonClick(this.options[idx]);
                    consume();
                    return true;
                }
            });
        }
    };

    /**
     * 闂佸憡甯掑ú锕€鐣烽弻銉ュ強妞ゆ牗纰嶉崕濠囨煛閸曨偄鈷旈柕鍥ㄧ缁嬪鈧綆鍋掗崑褍顭跨捄铏剐＄紒鈥冲閹啴宕熼娑崇吹闂傚倸鎳忓鐟邦渻閸岀偞鈷?
     */
    private toggleShowInterval() {
        this.showInterval = this.showInterval ? false : true;
    }

    /**
     * 闂佸憡甯掑ú锕€鐣烽弻銉ョ闁瑰灚鏋奸崑鎾愁煥閸曨兘鏋栫紓浣插亾闁惧繐婀遍幗鏇熶繆濡も偓閻楀啴鍩€椤掍胶绠栭懚鈺冣偓?
     * 闂傚倸鎳忛崝妯何?Show Answer 闂佸湱顭堥ˇ鐢稿箰閹惰姤鏅悘鐐靛亾閳绘梻绱掗埀顒併偊鐠恒劍顫栭梺鍛婂笒濡瑧鈧灚绮撻弻?
     */
    private showAnswer() {
        this.answerBtn.addClass("sr-is-hidden");
        this.response.removeClass("sr-is-hidden");

        let _stIndx = 1;
        if (this.item.isCard) {
            _stIndx = 1; // Card 闂備緡鍋呴懝楣冩偉閼哥數顩烽幖杈剧到閸嬪秶鈧?閻庢鍠掗崑鎾斥攽?闂婎偄娲ㄩ弲顐﹀汲閹櫝set?)闂佹寧绋戦惌鍌氥€掗崜浣虹＜闁规崘娅曢崐銈夋煕韫囨碍鑵圭紓宥咁儑缁螖娴ｆ亽鈧﹪姊洪弶璺ㄐら柣?
        }

        // 闂佸搫娲ら悺銊╁蓟婵犲洤绠板鑸靛姈鐏忥箓鏌￠崒姘婵犫偓娴煎瓨鏅柛顐ｇ箓鐠佹煡鏌ら崗鍛煓婵炴挸澧庨幉鐗堟媴鐟欏嫮鍑介梺?Intervals闂?
        this.options.slice(_stIndx).forEach((opt, index) => {
            const btn =
                this.vwcontainerEl.querySelector("#sr-" + opt.toLowerCase() + "-btn") ??
                this.buttons[_stIndx + index];
            const text = this.getTextWithInterval(_stIndx + index);
            btn.setText(text);
            if (!this.item.isCard) {
                btn.removeClass("sr-is-hidden");
            }
        });
    }

    /**
     * 闂佸憡甯掑ú锕€鐣烽弻銉ョ闁瑰灚鏋奸崑鎾愁煥閸曨兘鏋栫紓浣插亾婵炲樊浜濋敍鏍涢悧鍩辨岸鍩€椤掍胶绠栭懚鈺冣偓?
     * 闂傚倸鎳忛崝妯何涘畝鈧幏鐘诲礋椤愩垻鈧鏌熺粙娆炬█闁瑰憡濞婇弫宥囦沪閻愵兘鏋栫紓浣插亾?Show Answer 闂佸湱顭堥ˇ鐢稿箰?
     */
    private showQuestion() {
        this.answerBtn.removeClass("sr-is-hidden");
        this.buttons.forEach((btn, _index) => {
            btn.addClass("sr-is-hidden");
        });
    }

    /**
     * 闂佸吋鍎抽崲鑼躲亹閸モ晜鏆滈柨鏇炲€归敍鐔兼⒒閸涱喗鈷愭俊鐐插€垮鑽も偓闈涙啞閻ｉ亶鏌熺粙娆炬█闁瑰憡濞婂顒勫炊閵婏附瀚?
     * @param index 闂備緡鍋勯ˇ鐢稿Υ瀹ュ洦顫曢柕蹇曞Х缁?
     */
    private getTextWithInterval(index: number) {
        let text = this.buttonTexts[index];
        if (this.showInterval) {
            text =
                this.responseInterval == null
                    ? `${text}`
                    : Platform.isMobile
                      ? textInterval(this.responseInterval[index], true) // 缂備礁顦抽褎鎱ㄩ埡鍐崥妞ゆ牗绮庨弳鍡涙煕閺嶃劎澧俊顖氼槺缁?
                      : `${text} - ${textInterval(this.responseInterval[index], false)}`; // 濠碘剝顨呴惌鍌氼焽閹殿喚鍗氭い鏍ㄧ⊕閳绘梻绱掗埀顒勫传閸曨厽娈梺?
        }
        return text;
    }

    public hasBar() {
        return this.vwcontainerEl?.querySelector("#" + this.barId) != null;
    }

    public isDisplay() {
        return this.hasBar() && this.containerEl?.isShown();
    }

    hide() {
        if (this.containerEl?.isShown()) {
            this.containerEl.hide();
        }
    }

    close() {
        const rrBar = this.vwcontainerEl?.querySelector("#" + this.barId);
        if (rrBar) {
            this.removeKeysEvent();
            if (rrBar.firstChild) {
                rrBar.removeChild(rrBar.firstChild);
            }
            rrBar.remove();
        }
    }

    private _autoClose() {
        // ... 婵炲濯寸徊鍧楁偉濠婂懏鍋栨い鎰剁稻閺嗗牓姊洪幓鎺炴敾闁搞劊鍔戦幆鍕偓娑櫭径?return闂佹寧绋戦張顒€鈻撹箛鏃傗枖鐎广儱鐗婂畷鍐裁归敐鍡欑煂闁?
        return;
    }

    /**
     * 濠电儑缍€椤曆勬叏閻愮儤鐓ユい鏃傚亾绾剧霉濠婂喚鍎庢繛鍡愬灲閹嫰骞嬪┑鍥у壎
     */
    addKeysEvent() {
        if (this.ownerdoc && this._keydownHandler) {
            this.ownerdoc.addEventListener("keydown", this._keydownHandler);
        }
    }

    /**
     * 缂備礁顦…宄扳枍鎼淬劍鐓ユい鏃傚亾绾剧霉濠婂喚鍎庢繛鍡愬灲閹嫰骞嬪┑鍥у壎
     */
    removeKeysEvent() {
        if (this.ownerdoc && this._keydownHandler) {
            this.ownerdoc.removeEventListener("keydown", this._keydownHandler);
        }
    }

    /**
     * 濠电儑缍€椤曆勬叏閻愮儤鍤曟繝濠傚暙缁€瀣瑰鍐惧剮婵?
     */
    addMenuEvent() {
        // 婵犵鈧啿鈧綊鎮樻径鎰梿闁逞屽墰閹茬増鎷呯粙璺槮闂備焦顑欓崰娑溿亹瀹ュ纭€闁哄浂浜炵粈澶愭煕濞嗘ê鐏熷ù婊勫浮瀹曠兘濡搁妸褏顔愰梻浣瑰絻閺堫剟宕告繝鍥х?
    }

    /**
     * 濠电儑缍€椤曆勬叏閻愬灚鍠嗛柨鏃囧Г閸ゅ霉濠婂喚鍎庢繛鍡愬灲閺佸秹宕奸埗搴撴櫊瀹曟繈濡歌娴煎倿鏌?
     */
    addTouchEvent() {
        if (Platform.isMobile && this.contentEl) {
            TouchOnMobile.create();
        }
    }

    /**
     * 闂傚倸鎳忛崝妯何涘畝鍕鐟滃秹宕哄Δ鍛濠㈣埖鍔栫亸?
     */
    hideControls() {
        if (this.notecontrols) {
            this.notecontrols.hide();
        }
        if (this.controls) {
            this.controls.hide();
        }
    }

    /**
     * 闂佸搫娲ら悺銊╁蓟婵犲洤绠崇憸宥夊春濡ゅ懎绠板鑸靛姈鐏忥箓鏌￠崟顐⑩挃闁?
     */
    private _updateControls(isCard: boolean) {
        if (isCard) {
            this.notecontrols.hide();
            this.controls.show();
        } else {
            this.controls.hide();
            this.notecontrols.show();
        }
    }

    /**
     * 闂佸憡甯楃粙鎴犵磽閹捐绀傞柟鎯板Г閿涙棃鏌熺粙娆炬█闁?
     */
    private _createCloseButton(containerEl: HTMLElement) {
        const btn = containerEl.createEl("button");
        btn.addClasses(["sr-button", "sr-close-button"]);
        setIcon(btn, "x");
        btn.setAttribute("aria-label", t("CLOSE"));
        btn.addEventListener("click", () => {
            this.hide();
            if (this.barCloseHandler) {
                this.barCloseHandler();
            }
        });
    }

    /**
     * 闂佸憡甯楃粙鎴犵磽閹剧粯鈷掗柟缁㈠枟椤撻箖鏌￠崟顐⑩挃闁靛洦宀稿畷姘跺炊閵娿儱绨ラ梺鍦焾椤︾敻骞?
     */
    private _createIntervalButton(containerEl: HTMLElement) {
        const btn = containerEl.createEl("button");
        btn.addClasses(["sr-button"]);
        setIcon(btn, "clock");
        btn.setAttribute("aria-label", "Toggle interval display");
        btn.addEventListener("click", () => {
            this.toggleShowInterval();
            this.showAnswer(); // 闂佸憡甯￠弨閬嶅蓟婵犲洤绠板鑸靛姈鐏忥箓鏌￠崒姘婵犫偓?
        });
    }

    /**
     * 闂佸憡甯楃粙鎴犵磽閹捐埖瀚氶柨鏃囨閸撲即鏌熺粙娆炬█闁?
     */
    private _createCardInfoButton(containerEl: HTMLElement) {
        this.infoButton = containerEl.createEl("button");
        this.infoButton.addClasses(["sr-button"]);
        setIcon(this.infoButton, "info");
        this.infoButton.setAttribute("aria-label", "Show card info");
        this.infoButton.addEventListener("click", () => {
            // 闂佸搫瀚晶浠嬪Φ濮樼偨浜归柟鎯у暱椤ゅ懎顪冮妶鍛础婵炲弶澹嗛幏鐘绘晜閽樺澹?
            if (this.item) {
                new Notice(`Times reviewed: ${this.item.timesReviewed}`);
            }
        });
    }

    /**
     * 闂佸憡甯楃粙鎴犵磽閹捐埖宕夐悗鍦Х缁犳牠鏌熺粙娆炬█闁?
     */
    private _createSkipButton(containerEl: HTMLElement) {
        this.skipButton = containerEl.createEl("button");
        this.skipButton.addClasses(["sr-button"]);
        setIcon(this.skipButton, "skip-forward");
        this.skipButton.setAttribute("aria-label", "Skip");
        this.skipButton.addEventListener("click", () => {
            this.hide();
        });
    }
}
