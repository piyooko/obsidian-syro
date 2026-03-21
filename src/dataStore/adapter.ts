/**
 * 这个文件主要是干什么的：
 * [数据层] 文件系统适配器接口 (IAdapter) 及其 Obsidian 实现。
 * 封装了 Obsidian 的 Vault 和 DataAdapter API，提供统一的读写、重命名、删除等文件操作接口。
 * 方便在非 Obsidian 环境（如测试）中通过 Mock 实现进行替换。
 *
 * 它在项目中属于：数据层 (Data Layer) / 适配器 (Adapter)
 *
 * 它会用到哪些文件：
 * 1. Obsidian API (Vault, DataAdapter)
 *
 * 哪些文件会用到它：
 * 1. src/dataStore/data.ts (数据存取)
 * 2. src/algorithms/fsrs.ts (读写 RevLog)
 * 3. src/location_switch.ts (迁移数据)
 */
/**
 * [数据层：负责数据的持久化、读取和内存状态管理] [工具] 封装 Obsidian 的文件系统 API，提供统一的读写接口。
 */
import { App, DataAdapter, Keymap, MetadataCache, Vault } from "obsidian";

export abstract class Iadapter {
    metadataCache: MetadataCache;
    adapter: DataAdapter;
    vault: Vault;
    app: App;

    private static _instance: Iadapter;

    constructor(app: App) {
        this.app = app;
        Iadapter._instance = this;
    }

    static get instance() {
        if (Iadapter._instance) {
            return Iadapter._instance;
        } else {
            throw Error("there is not Iadapter instance.");
        }
    }

    static create(app: App) {
        return new ObAdapter(app);
    }
}

class ObAdapter extends Iadapter {
    constructor(app: App) {
        super(app);
        this.metadataCache = app.metadataCache;
        this.adapter = app.vault.adapter;
        this.vault = app.vault;
    }
}
