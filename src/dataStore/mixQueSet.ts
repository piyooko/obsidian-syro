/**
 * 这个文件主要是干什么的：
 * [数据层] 混合队列设置逻辑。
 * 用于决定在复习时，新卡片 (New) 和 复习卡片 (Due) 的混合比例和出现顺序。
 * 提供了一个单例来管理这些计数状态。
 *
 * 它在项目中属于：数据层 (Data Layer) / 逻辑 (Logic)
 *
 * 它会用到哪些文件：
 * 1. src/dataStore/repetitionItem.ts
 *
 * 哪些文件会用到它：
 * 1. src/ReviewDeck.ts (构建复习迭代器时)
 */
/**
 * [数据层：负责数据的持久化、读取和内存状态管理] [逻辑] 混合队列设置，决定复习时新卡片和旧卡片的混合比例。
 */
import { RepetitionItem } from "./repetitionItem";

interface MixQueSet {
    isDue: boolean;
    DueDefaultCnt: number;
    NewDefaultCnt: number;

    _isCard: boolean;
    CardDefaultCnt: number;
    NoteDefaultCnt: number;

    // private static _instance: MixQueSet;
    _dnCnt: number;
    _cnCnt: number;
    // private _inMuti: boolean = false;
}
const DEFAULT_MIXQUESET: MixQueSet = {
    isDue: true,
    DueDefaultCnt: 3,
    NewDefaultCnt: 2,

    _isCard: false,
    CardDefaultCnt: 4,
    NoteDefaultCnt: 1,

    // private static _instance: MixQueSet;
    _dnCnt: 0,
    _cnCnt: 0,
};
let instance: MixQueSet;

export function create(due: number = 3, newdc: number = 2, card: number = 4, note: number = 1) {
    const mqs = Object.assign({}, DEFAULT_MIXQUESET);
    mqs.isDue = true;
    mqs._isCard = false;
    mqs.DueDefaultCnt = due;
    mqs.NewDefaultCnt = newdc;
    mqs.CardDefaultCnt = card;
    mqs.NoteDefaultCnt = note;
    instance = mqs;
    return mqs;
}

export function getInstance() {
    if (!instance) {
        throw Error("there is not MixQueSet instance.");
    }
    return instance;
}

export const isDue = () => {
    return instance.isDue;
};

export const isCard = () => {
    return _isCard(instance);
};
function _isCard(mqs: MixQueSet) {
    return mqs._isCard;
}

export function calcNext(dueCnthad: number, newCnthad: number) {
    if (instance.DueDefaultCnt === 0) return (instance.isDue = newCnthad > 0 ? false : true);
    if (instance.NewDefaultCnt === 0) return (instance.isDue = dueCnthad > 0 ? true : false);
    if (dueCnthad === 0 && newCnthad > 0) return (instance.isDue = false);
    if (dueCnthad > 0 && newCnthad === 0) return (instance.isDue = true);
    instance._dnCnt++;
    if (instance.isDue) {
        if (instance._dnCnt >= instance.DueDefaultCnt && newCnthad > 0) {
            instance.isDue = false;
            instance._dnCnt = 0;
        }
    } else {
        if (instance._dnCnt >= instance.NewDefaultCnt && dueCnthad > 0) {
            instance.isDue = true;
            instance._dnCnt = 0;
        }
    }
}

export function arbitrateCardNote(item: RepetitionItem, cardtlt: number, notetlt: number) {
    const iscard = item.isCard;
    if (instance.CardDefaultCnt === 0) return (instance._isCard = iscard);
    if (instance.NoteDefaultCnt === 0) return (instance._isCard = !iscard);
    instance._cnCnt++;
    if (isCard()) {
        if (instance._cnCnt >= instance.CardDefaultCnt && notetlt > 0) {
            instance._isCard = false;
            instance._cnCnt = 0;
            return;
        }
    } else {
        if (instance._cnCnt >= instance.NoteDefaultCnt && cardtlt > 0) {
            instance._isCard = true;
            instance._cnCnt = 0;
            return;
        }
    }
}
