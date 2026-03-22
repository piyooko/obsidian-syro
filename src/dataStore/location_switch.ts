/**
 * 闁哄鏅滈悷銈夋煂濠婂牆妫橀柛銉檮椤愯棄鈽夐幘瀛橆潡妞も晪绠撳浼搭敍濮橆剙褰欐繛瀵稿Л閸嬫挸鈽夐弬璺ㄥⅱ婵炲牊鍨块弫?
 * [闂佽桨鑳舵晶妤€鐣垫担杞版勃濞?闂佽桨鑳舵晶妤€鐣垫担瑙勪氦濞达絿娲呴埡鍐笉闁挎稑瀚崐鐐烘煕閿濆啫濡搁柍?
 * 闁荤姵鍔楅崰鏇㈡儗濡ゅ懎鎹堕柕濞垮€楅悷婵嬫煕濮橆剛鐏辨繛鍫熷灴瀵偊鎮ч崼婵堛偊闁诲孩绋掗敋闁稿绉磋灒闁炽儱纾涵鈧繛鎴炴煥椤戝螞閸ф鏅柛顐ｇ矌娴兼劕鈹戦垾鍐蹭喊缂佽京澧楃粋?JSON 闂佸搫鍊稿ú锝呪枎閵忊剝浜ゅù锝囨磪閳哄懎绀?Note Frontmatter闂佹寧绋戦張顒勫垂閵娾晛鐭楃€广儱瀚娲煥濞戞﹩妲肩紒楦垮亹缁梻绱掑Ο缁橆啀闂佺顕栭崰鎾诲焵?
 * 闁诲海鎳撻崯鈺冩娴兼潙绠ョ憸鐗堝笒濞呫倝鎮归崶顏嶅殭鐟滄澘娲ㄧ划顓㈠籍閸ヨ泛鏁归梺鍝勫€稿ú锝呪枎閵忋倖鏅悘鐐插悑閸欏繘鏌￠埀顒傛喆閸曨偆浠愰梺鍛婂笧婵炩偓婵炲懎閰ｅ畷妤呭嫉娴ｅ啫骞€闂佹眹鍔岀€氼垶鎯冮悢鍛婂劅闁挎柨銇樼换鍡涙煙椤撗冪仩闁靛洦妫冮弫宥夊捶缁嬬兂L闂佹寧绋戦ˇ顖炲箯?HTML 濠电偛顦崝鎴﹀闯閹绢喖违?
 *
 * 闁诲海鎳撻崯顐耿椤忓懌浜滈柛锔诲幗缁愭鈽夐幙鍐ㄥ箹闁活偅蓱缁傚秵鎯旈婊呯崶闂佽桨鑳舵晶妤€鐣垫担杞版勃?(Data Layer) / 闁哄鏅欓懗鏈电昂闂備緡鍋呭Σ鎺旀?(Migration)
 *
 * 闁诲海鎳撻崯鈺冩娴煎瓨鍋ㄩ柕濞垮劚閻撳倿鏌涘┑鎰胺缂併劍妞藉顒勫炊閿旂瓔鍋ㄩ梺?
 * 1. src/dataStore/data.ts
 * 2. src/dataStore/trackedFile.ts
 * 3. src/SRFile.ts
 *
 * 闂佸憡绻嶆禍娆戣姳濞差亜妫橀柛銉檮椤愯棄霉閸忓吋鐨戦柡浣靛€濆畷姘跺级鐠恒劍娈滈梺?
 * 1. src/settings.ts (闂佹椿娼块崝宥夊春濞戙垹鎹堕柕濠庣厛閸熷海绱撻崘鎯ф灓闁哄拋鍋婂Λ鍐閻樿尙鈧ジ鏌熼獮鍨仼闁宦板姂瀹曟帡濡搁妶鍥┬㈢紓鍌氬枤閸犳顪冮崒婊勫闁告劦浜濋弳?
 */
/**
 * [闂佽桨鑳舵晶妤€鐣垫担杞版勃闁稿矉濡囩粣妤呮偣閹邦喖鏋欓柣顓燁殜瀵偊鎮ч崼婵堛偊闂佹眹鍔岀€氼厾鈧灚姊圭粙濠囧川椤撶儐鍤欓梺闈涙濞村洭顢氭导鏉戠煑闁哄诞鍕伅闂佸憡鍔曢幊搴ㄦ偤閵娾晜鍋愰柤鍝ヮ暯閸嬫挻鎷呮笟顖氭倎闂佽崵鍋涢幗?[闁哄鏅欓懗鏈电昂] 闁荤姵鍔楅崰鏇㈡儗濡ゅ懎鎹堕柕濞垮€楅悷婵嬫煕濮橆剚婀伴柡鍡欏枛楠炴垿顢欓懖鈺傛喖闂佺琚崝瀣礊閸涱垳纾炬い鏃囧吹椤撴椽姊婚崒婊庢缂侀缚鍋愮划鏃傜磼濡粯顔嶉梺纭咁嚃閸犳艾鈻撻幋锔界劵闁哄嫬绻掔敮鍡涙煏?
 */
import { CachedMetadata, FrontMatterCache, Notice, TFile } from "obsidian";
import { TopicPath } from "src/TopicPath";
import {
    DEFAULT_DECKNAME,
    LEGACY_SCHEDULING_EXTRACTOR,
    MULTI_SCHEDULING_EXTRACTOR,
    SCHEDULING_INFO_REGEX,
    SR_HTML_COMMENT_BEGIN,
    SR_HTML_COMMENT_END,
    YAML_FRONT_MATTER_REGEX,
    YAML_TAGS_REGEX,
} from "src/constants";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { SRSettings } from "src/settings";
import { escapeRegexString } from "src/util/utils";
import { DataStore } from "./data";
import { Tags } from "src/tags";

import { Stats } from "src/stats";
import { BlockUtils, DateUtils, isIgnoredPath } from "src/util/utils_recall";
import { RPITEMTYPE } from "./repetitionItem";
import deepcopy from "deepcopy";
import { NoteCardScheduleParser } from "src/CardSchedule";
import { DataLocation, getStorePath } from "./dataLocation";
import { globalDateProvider } from "src/util/DateProvider";
import { Iadapter } from "./adapter";

export class LocationSwitch {
    public plugin: SRPlugin;
    private settings: SRSettings;
    public beforenoteStats: Stats;
    public afternoteStats: Stats;
    public beforecardStats: Stats;
    public aftercardStats: Stats;
    private revTag: string;

    constructor(plugin: SRPlugin, settings: SRSettings) {
        this.plugin = plugin;
        this.settings = settings;
        this.revTag = this.converteTag();
    }

    /**
     * getStorePath.
     *
     * @returns {string}
     */
    getStorePath(): string {
        return getStorePath(this.plugin.manifest.dir, this.settings);
    }

    /**
     * moveStoreLocation.
     *
     * @returns {boolean}
     */
    async moveStoreLocation(): Promise<boolean> {
        const adapter = Iadapter.instance.adapter;
        const store = DataStore.getInstance();

        const newPath = this.getStorePath();
        if (newPath === store.dataPath) {
            return false;
        }
        const exist = await store.verify(newPath);
        if (exist) {
            const suffix = "-" + new Date().toISOString().replace(/[:.]/g, "");
            await adapter.rename(newPath, newPath + suffix);
            if (this.settings.showSchedulingDebugMessages) {
                console.debug("orginal file: " + newPath + " renamed to: " + newPath + suffix);
            }
        }

        try {
            await store.save(newPath);
            await adapter.remove(store.dataPath).then(
                () => {
                    store.setdataPath(newPath);
                    new Notice(t("DATA_FILE_MOVED_SUCCESS"));
                    return true;
                },
                (e) => {
                    store.setdataPath(newPath);
                    new Notice(t("DATA_FILE_DELETE_OLD_FAILED"));
                    console.error(e);
                    return true;
                },
            );
        } catch (e) {
            new Notice(t("DATA_FILE_MOVE_FAILED"));
            console.error(e);
            return false;
        }
    }

    converteTag(tag?: string): string {
        if (tag == undefined) {
            tag = DEFAULT_DECKNAME;
        }
        return [this.settings.tagsToReview[0], tag].join("/").substring(1);
    }

    /**
     * converteNoteSchedToTrackfile
     *
     */
    async converteNoteSchedToTrackfile(dryrun: boolean = false, newLocation?: DataLocation) {
        const plugin = this.plugin;
        // const store = plugin.store;
        const store = DataStore.getInstance();
        const settings = plugin.data.settings;
        this.initStats();
        this.setBeforeStats();
        if (dryrun) {
            if (newLocation) {
                settings.dataLocation = newLocation;
            }
        }
        settings.tagsToReview.push(this.revTag);

        await store.save();

        // await plugin.sync_Algo();

        let notes: TFile[] = Iadapter.instance.vault.getMarkdownFiles();
        notes = notes.filter(
            (noteFile) =>
                !isIgnoredPath(settings.noteFoldersToIgnore, noteFile.path) &&
                plugin.createSrTFile(noteFile).getAllTagsFromCache().length > 0,
        );
        for (const noteFile of notes) {
            let deckname = Tags.getNoteDeckName(noteFile, this.settings);
            const srfile = plugin.createSrTFile(noteFile);
            let topicPath: TopicPath = TopicPath.getFolderPathFromFilename(srfile, settings);
            let fileText: string = await noteFile.vault.read(noteFile);
            let fileChanged = false;

            // delet removed tag
            if (topicPath.hasPath) {
                // fileText = await noteFile.vault.read(noteFile);
                if (
                    topicPath.path.length === 2 &&
                    settings.tagsToReview.includes(topicPath.path[1])
                ) {
                    deckname = topicPath.path[1];
                    topicPath = new TopicPath([deckname]);
                    const revtag = this.converteTag(deckname);
                    fileText = delDefaultTag(fileText, revtag);
                    fileChanged = true;
                }
            }

            // delete review/default tag
            if (
                (topicPath.hasPath && topicPath.formatAsTag().includes(this.revTag)) ||
                srfile.getAllTagsFromCache().includes("#" + this.revTag)
            ) {
                deckname = DEFAULT_DECKNAME;
                topicPath = new TopicPath([deckname]);
                fileText = delDefaultTag(fileText, this.revTag);
                fileChanged = true;
            }

            if (deckname !== null) {
                const fileCachedData = Iadapter.instance.metadataCache.getFileCache(noteFile) || {};
                fileText = _convertFrontMatter(noteFile, fileCachedData, deckname, fileText);
                if (fileText == null) {
                    console.warn("_convertFrontMatter: fileText null: ");
                    // throw new Error("_convertFrontMatter fileText null: " + fileText);
                }
                if (SCHEDULING_INFO_REGEX.test(fileText)) {
                    console.warn(
                        "still have SCHEDULING_INFO_REGEX in fileText:\n",
                        noteFile.path,
                        fileText,
                    );
                    // throw new Error("_convertFrontMatter failed: \n" + fileText);
                }
                fileChanged = true;
            }

            if (topicPath.hasPath) {
                fileText = _convertCardsSched(noteFile, fileText, topicPath.path[0]);
                if (fileText == null) {
                    console.warn("fileText null");
                    throw new Error(fileText);
                }
                if (
                    MULTI_SCHEDULING_EXTRACTOR.test(fileText) ||
                    LEGACY_SCHEDULING_EXTRACTOR.test(fileText)
                ) {
                    console.error("still have cardsched in fileText:\n", noteFile.path, fileText);
                    // throw new Error("_convertCardsSched failed: \n" + fileText);
                }
                fileChanged = true;
            }

            if (!dryrun && fileChanged) {
                if (fileText == null) {
                    console.error("fileText null");
                    throw new Error(fileText);
                }
                await noteFile.vault.modify(noteFile, fileText);
                // console.debug("_convert fileChanged end :\n", fileText);
            }
        }

        settings.tagsToReview.pop();

        const msg = "converteNoteSchedToTrackfile success!";
        if (dryrun) {
            await plugin.sync();
            this.setAfterStats();
            // await store.load();
            settings.dataLocation = DataLocation.SaveOnNoteFile;
            this.resultCheck(
                this.beforenoteStats,
                this.beforecardStats,
                this.afternoteStats,
                this.aftercardStats,
            );
        } else {
            await store.save();
            new Notice(msg);
        }

        function _convertCardsSched(note: TFile, fileText: string, deckName: string) {
            // console.debug("_convertCardsSched: ", note.basename);
            const trackedFile = store.getTrackedFile(note.path);
            // let fileText: string = await note.vault.read(note);
            // let fileChanged = false;
            trackedFile.syncNoteCardsIndex(fileText, this.settings, (cardText, cardinfo) => {
                let scheduling: RegExpMatchArray[] = [
                    ...cardText.matchAll(MULTI_SCHEDULING_EXTRACTOR),
                ];
                if (scheduling.length === 0)
                    scheduling = [...cardText.matchAll(LEGACY_SCHEDULING_EXTRACTOR)];
                if (scheduling.length > 0) {
                    const normalizedCardInfo = normalizeCardIndexInfo(cardinfo);
                    if (!normalizedCardInfo) {
                        return;
                    }

                    const relatedItems = (trackedFile.trackedItems || [])
                        .filter((item) => item.lineNo === normalizedCardInfo.lineNo)
                        .slice(0, scheduling.length);
                    relatedItems.forEach((item) => {
                        store.updateCardItems(trackedFile, item, deckName);
                    });
                    const schedInfoList = NoteCardScheduleParser.createInfoList_algo(scheduling);
                    const itemMap = normalizedCardInfo.itemMap || {};
                    const keys = Object.keys(itemMap);
                    scheduling.forEach((sched: RegExpMatchArray, index) => {
                        if (!schedInfoList[index].isDummyScheduleForNewCard) {
                            const id = keys[index] ? itemMap[keys[index]] : -1;
                            if (id >= 0) store.getItembyID(id)?.updateSched(sched, true);
                        }
                    });

                    // console.debug(cardinfo.lineNo, scheduling);

                    const newCardText = updateCardSchedXml(
                        cardText,
                        settings.cardCommentOnSameLine,
                    );
                    fileText = cardTextReplace(fileText, cardText, newCardText);
                    // fileChanged = true;
                }
            });

            // if (fileChanged) {
            //     // await note.vault.modify(note, fileText);
            //     console.debug("_convertCardsSched end :\n", fileText);
            // }
            return fileText;
        }

        function _convertFrontMatter(
            note: TFile,
            fileCachedData: CachedMetadata,
            deckname: string,
            fileText: string,
        ) {
            // console.debug("_convertFrontMatter");
            // const fileCachedData = Iadapter.instance.metadataCache.getFileCache(note) || {};
            const frontmatter: FrontMatterCache | Record<string, unknown> =
                fileCachedData.frontmatter || {};
            const sched = getReviewNoteHeaderData(frontmatter);
            if (sched != null) {
                if (!store.getTrackedFile(note.path)?.tags.includes(RPITEMTYPE.NOTE)) {
                    store.trackFile(note.path, deckname, false);
                }
                const tkFile = store.getTrackedFile(note.path);
                const item = store.getItembyID(tkFile.items.file);
                // const id = store.getTrackedFile(note.path).items.file
                // store.reviewId(id, opts[1]);
                item.updateSched(sched, true);
                fileText = updateNoteSchedFrontHeader(fileText);
                // console.debug("_convertFrontMatter end :\n", fileText);
            }
            return fileText;
        }
    }

    /**
     *converteTrackfileToNoteSched
     */
    async converteTrackfileToNoteSched(dryrun: boolean = false) {
        const plugin = this.plugin;
        const store = plugin.store;
        this.initStats();
        this.setBeforeStats();
        plugin.syncLock = true;

        await store.pruneData();

         
        let tracked_files = Object.values(store.data.trackedFiles);
        const dueIds: number[] = [];
        await Promise.all(
            tracked_files
                .filter((tkfile) => tkfile != null)
                .filter((tkfile) => !isIgnoredPath(this.settings.noteFoldersToIgnore, tkfile.path))
                .map(async (tkfile) => {
                    const item = store.getItembyID(tkfile.items.file);
                    const noteEntry = Iadapter.instance.vault.getAbstractFileByPath(
                        tkfile.path,
                    );
                    if (!(noteEntry instanceof TFile)) {
                        return;
                    }
                    const note = noteEntry;
                    const deckPath: string[] = TopicPath.getFolderPathFromFilename(
                        plugin.createSrTFile(note),
                        this.settings,
                    ).path;
                    let fileText: string = await note.vault.read(note);
                    let fileChanged = false;
                    if (deckPath.length !== 0) {
                        tkfile.syncNoteCardsIndex(fileText, this.settings, (cardText, cardinfo) => {
                            const normalizedCardInfo = normalizeCardIndexInfo(cardinfo);
                            if (normalizedCardInfo?.itemMap == null) {
                                return;
                            }
                            const itemMap = normalizedCardInfo.itemMap;
                            const scheduling: RegExpMatchArray[] = [];
                            (Object.values(itemMap))
                                .filter((id): id is number => typeof id === "number" && id >= 0)
                                .map((id) => store.getItembyID(id))
                                .filter((citem) => citem?.isTracked)
                                .forEach((citem) => {
                                    // const citem = store.getItembyID(id);
                                    // if (citem.isTracked) {
                                    const sched = citem.getSchedDurAsStr();
                                    if (citem.hasDue && sched != null) {
                                        scheduling.push(sched);
                                        dueIds.push(citem.ID);
                                    }
                                    this.aftercardStats.updateStats(
                                        citem,
                                        globalDateProvider.endofToday.valueOf(),
                                    );
                                    // }
                                });
                            const newCardText = updateCardSchedXml(
                                cardText,
                                this.settings.cardCommentOnSameLine,
                                scheduling,
                            );
                            fileText = cardTextReplace(fileText, cardText, newCardText);
                            // const replacementRegex = new RegExp(escapeRegexString(cardText), "gm");
                            // fileText = fileText.replace(replacementRegex, () => newCardText);
                            fileChanged = true;
                        });
                    }
                    // console.debug("_convert CardsSched end :\n", fileText);
                    if (
                        item?.isTracked &&
                        (tkfile.isDefault || Tags.isTagedNoteDeckName(item.deckName, this.settings))
                    ) {
                        if (item?.hasDue) {
                            // let due: str, ease: number, interval: number;
                            const ret = item.getSchedDurAsStr();
                            if (ret != null) {
                                fileText = updateNoteSchedFrontHeader(fileText, ret);
                                fileChanged = true;
                                // console.debug("converteTrackfileToNoteSched: " + tkfile.path, fileText);
                            }
                            // console.debug(tkfile.path, this.afternoteStats.youngCount);
                        }
                        this.afternoteStats.updateStats(
                            item,
                            globalDateProvider.endofToday.valueOf(),
                        );
                        //update tag to note
                        if (item?.itemType === RPITEMTYPE.NOTE) {
                            const noteTag = Tags.getNoteDeckName(note, this.settings);
                            if (tkfile.isDefault) {
                                fileText = addDefaultTagtoNote(fileText, this.revTag);
                                fileChanged = true;
                            } else if (
                                noteTag == null &&
                                this.settings.tagsToReview.includes(item.deckName)
                            ) {
                                const tag = this.converteTag(item.deckName);
                                fileText = addDefaultTagtoNote(fileText, tag);
                                fileChanged = true;
                            }
                        }
                    }
                    if (!dryrun && fileChanged) {
                        if (fileText == null) {
                            console.error("fileText null");
                            throw new Error(fileText);
                        }
                        await note.vault.modify(note, fileText);
                    }
                }),
        );
        await store.save();
        plugin.syncLock = false;
        const msg = "converteTrackfileToNoteSched success!";
        if (this.settings.showSchedulingDebugMessages) {
            console.debug("dueids after: ", dueIds, store.data.trackedFiles, store.data.items);
        }
        if (dryrun) {
            // const settings = plugin.data.settings;
            // const orgLocation = settings.dataLocation;
            // settings.dataLocation = DataLocation.SaveOnNoteFile;
            // await plugin.sync();
            // settings.dataLocation = orgLocation;
            this.resultCheck(
                this.beforenoteStats,
                this.beforecardStats,
                this.afternoteStats,
                this.aftercardStats,
            );
        } else {
            new Notice(msg);
        }
    }

    private initStats() {
        this.beforenoteStats = new Stats();
        this.beforecardStats = new Stats();
        this.afternoteStats = new Stats();
        this.aftercardStats = new Stats();
    }

    private setBeforeStats() {
        this.beforenoteStats = deepcopy(this.plugin.noteStats);
        this.beforecardStats = deepcopy(this.plugin.cardStats);
    }
    private setAfterStats() {
        this.afternoteStats = deepcopy(this.plugin.noteStats);
        this.aftercardStats = deepcopy(this.plugin.cardStats);
    }

    resultCheck(noteStats: Stats, cardStats: Stats, afternoteStats: Stats, aftercardStats: Stats) {
        if (
            this.compare(noteStats, afternoteStats, "note") ||
            this.compare(cardStats, aftercardStats, "card")
        ) {
            console.debug(
                "before chang noteStats, cardStats:\n",
                noteStats,
                cardStats,
                "\nafter change:\n",
                afternoteStats,
                aftercardStats,
            );
            new Notice(t("DATA_LOST_WARNING"));
        }
    }
    compare(before: Stats, after: Stats, prefix: string) {
        let ntc = false;
        for (const keyS in before) {
            const key = keyS as keyof typeof before;
            if (!(before[key] instanceof Object) && before[key] !== after[key]) {
                console.warn("%s %s before: %d, after: %d", prefix, key, before[key], after[key]);
                ntc = true;
            }
        }
        return ntc;
    }

    createTable(Stats: Stats, afterStats: Stats): string {
        const title =
            "Location | new | onDue | yung | mature \n\
            ---|---|---|---|---\n";
        const before = `before|${Stats.newCount} |${Stats.onDueCount} |${Stats.youngCount} |${Stats.matureCount}\n`;
        const after = `after|${afterStats.newCount} |${afterStats.onDueCount} |${afterStats.youngCount} |${afterStats.matureCount}\n`;
        return title + before + after;
    }
}

export function cardTextReplace(fileText: string, cardText: string, newCardText: string) {
    const replacementRegex = new RegExp(escapeRegexString(cardText), "gm");
    if (fileText.indexOf(cardText) === fileText.lastIndexOf(cardText)) {
        return fileText.replace(replacementRegex, () => newCardText);
    } else {
        const blanLine = "(\n\\s*?\n)";
        let rpreg = new RegExp(blanLine + escapeRegexString(cardText), "gm");
        if (fileText.match(rpreg) !== null) {
            return fileText.replace(rpreg, `$1${newCardText}`);
        } else {
            rpreg = new RegExp(escapeRegexString(cardText) + blanLine, "gm");
            return fileText.replace(rpreg, `${newCardText}$1`);
        }
    }
}

/**
 *  get ReviewNote frontmatter Data from notefile.
 *
 * @param frontmatter
 * @returns number[] | [0, due, interval, ease];
 */
function getReviewNoteHeaderData(frontmatter: FrontMatterCache): number[] {
    // file has scheduling information
    if (
        Object.prototype.hasOwnProperty.call(frontmatter, "sr-due") &&
        Object.prototype.hasOwnProperty.call(frontmatter, "sr-interval") &&
        Object.prototype.hasOwnProperty.call(frontmatter, "sr-ease")
    ) {
        const dueUnix: number = window
            .moment(frontmatter["sr-due"], ["YYYY-MM-DD", "DD-MM-YYYY", "ddd MMM DD YYYY"])
            .valueOf();
        const interval: number = frontmatter["sr-interval"] as number;
        const ease: number = frontmatter["sr-ease"] as number;
        const sched = [null, dueUnix, interval, ease];
        return sched;
    } else {
        // console.debug(
        //     "getReviewNoteHeaderData --> note: %s doesn't have sr frontmatter. ",
        //     frontmatter,
        // );
        return null;
    }
}

/**
 * updateNoteSchedFrontHeader, if sched == null, delete sched info in frontmatter.
 * @param note TFile
 * @param fileText: string
 * @param sched [, due, interval, ease] | null
 */
export function updateNoteSchedFrontHeader(fileText: string, sched?: RegExpMatchArray) {
    // update yaml schedule
    // const plugin = this.plugin;
    let schedString = "";
    if (sched != null) {
        const [, dueString, interval, ease] = sched;
        // const dueString: string = window.moment(due).format("YYYY-MM-DD");
        schedString = `sr-due: ${dueString}\nsr-interval: ${interval}\n` + `sr-ease: ${ease}\n`;
    } else {
        schedString = "";
    }

    // check if scheduling info exists
    if (SCHEDULING_INFO_REGEX.test(fileText)) {
        const schedulingInfo = SCHEDULING_INFO_REGEX.exec(fileText);
        if (schedulingInfo[1].length || schedulingInfo[5].length) {
            fileText = fileText.replace(
                SCHEDULING_INFO_REGEX,
                `---\n${schedulingInfo[1]}${schedString}` + `${schedulingInfo[5]}---\n`,
            );
        } else if (schedString.length > 0) {
            fileText = fileText.replace(SCHEDULING_INFO_REGEX, `---\n${schedString}---\n`);
        } else {
            fileText = fileText.replace(SCHEDULING_INFO_REGEX, "");
        }
    } else if (YAML_FRONT_MATTER_REGEX.test(fileText)) {
        // new note with existing YAML front matter
        const existingYaml = YAML_FRONT_MATTER_REGEX.exec(fileText);
        fileText = fileText.replace(
            YAML_FRONT_MATTER_REGEX,
            `---\n${existingYaml[1]}${schedString}---`,
        );
    } else {
        fileText = `---\n${schedString}---\n${fileText}`;
    }
    return fileText;
}

/**
 * updateCardSchedXml, if have scheduling, update card sched in note. else delete it.
 * @param cardText
 * @param scheduling
 * @param cardCount
 * @returns
 */
export function updateCardSchedXml(
    cardText: string,
    cardCommentOnSameLine: boolean = true,
    scheduling?: RegExpMatchArray[],
    cardCount?: number,
) {
    let sep: string = cardCommentOnSameLine ? " " : "\n";
    let newCardText: string = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
    let schedString: string = "";
    if (newCardText.endsWith("```") && sep !== "\n") {
        sep = "\n";
    }
    if (scheduling != null && scheduling.every((sched) => sched == null)) {
        return newCardText;
    }
    if (scheduling != null && scheduling.length > 0) {
        schedString = sep + SR_HTML_COMMENT_BEGIN;

        if (cardCount == null) {
            cardCount = scheduling.length;
        } else {
            cardCount = Math.min(cardCount, scheduling.length);
        }
        for (let i = 0; i < cardCount; i++) {
            schedString += `!${scheduling[i][1]},${Number(scheduling[i][2]).toFixed(0)},${Number(
                scheduling[i][3],
            ).toFixed(0)}`;
        }
        schedString += SR_HTML_COMMENT_END;
    } else {
        schedString = "";
    }

    newCardText += schedString;
    // console.debug("newCardText: \n", newCardText);
    return newCardText;
}

function addDefaultTagtoNote(fileText: string, revTag: string) {
    // check if scheduling info exists
    if (YAML_TAGS_REGEX.test(fileText)) {
        const tags = YAML_TAGS_REGEX.exec(fileText);

        const originTags = tags[2];
        let newTags = "";
        if (!originTags.includes(revTag)) {
            if (originTags.includes("\n")) {
                newTags = [originTags, revTag].join("\n  - ");
            } else {
                newTags = [originTags, revTag].join(", ");
            }
            fileText = fileText.replace(
                YAML_TAGS_REGEX,
                `---\n${tags[1]}tags:${newTags}\n` + `${tags[3]}---`,
            );
        }
    } else if (YAML_FRONT_MATTER_REGEX.test(fileText)) {
        // new note with existing YAML front matter
        const existingYaml = YAML_FRONT_MATTER_REGEX.exec(fileText);
        fileText = fileText.replace(
            YAML_FRONT_MATTER_REGEX,
            `---\n${existingYaml[1]}tags: ${revTag}\n---`,
        );
    } else {
        fileText = `---\ntags: ${revTag}\n---\n${fileText}`;
    }
    return fileText;
}

export function delDefaultTag(fileText: string, revTag: string) {
    // check if scheduling info exists
    if (YAML_TAGS_REGEX.test(fileText)) {
        const tags = YAML_TAGS_REGEX.exec(fileText);

        const originTags = tags[2];
        let newTags = originTags;
        if (originTags.includes(revTag)) {
            if (originTags.includes(",")) {
                newTags = originTags.replace(revTag + ",", "");
                newTags = newTags.replace(RegExp(", ?" + revTag), "");
            }
            if (originTags.includes("\n")) {
                newTags = newTags.replace(RegExp("\n\\s+?-\\s+?" + revTag), "");
            }

            if (newTags.trim() === revTag) {
                newTags = "";
            } else if (newTags.trimEnd().length > 0) {
                newTags = "tags:" + newTags + "\n";
            }
            if (newTags.includes(revTag) || tags[3].includes(revTag)) {
                throw new Error("delDefaultTag still have defaultTag" + newTags + tags[3]);
            }

            if (tags[1].length > 0 || tags[3].length > 0 || newTags.length > 0) {
                fileText = fileText.replace(
                    YAML_TAGS_REGEX,
                    `---\n${tags[1]}` + `${newTags}` + `${tags[3]}---`,
                );
            } else {
                fileText = fileText.replace(YAML_TAGS_REGEX, "");
            }
        }
    }
    return fileText;
}

type CardIndexInfo = {
    lineNo: number;
    itemMap?: Record<string, number>;
};

function normalizeCardIndexInfo(cardinfo: unknown): CardIndexInfo | null {
    if (typeof cardinfo !== "object" || cardinfo === null) {
        return null;
    }

    const lineNo = Reflect.get(cardinfo, "lineNo");
    const itemMap = Reflect.get(cardinfo, "itemMap");

    return {
        lineNo: typeof lineNo === "number" ? lineNo : -1,
        itemMap:
            typeof itemMap === "object" && itemMap !== null
                ? (itemMap as Record<string, number>)
                : undefined,
    };
}
