/**
 * 这个文件主要是干什么的：
 * 它是一个"广播站"，当插件完成了笔记数据的同步（比如统计有多少新卡、到期卡等），
 * 它就会向所有正在收听的页面（比如牌组列表、复习界面）广播一条消息：
 * "嘿，数据更新了！你们可以刷新一下自己的数字了。"
 *
 * 这样做的好处是：页面不需要整个重新加载，只需要把变了的数字更新一下就好，
 * 用户完全不会看到屏幕闪烁。
 *
 * 它在项目中属于：工具层
 *
 * 它会用到哪些文件：
 * 无，它是一个独立的工具，不依赖其他文件。
 *
 * 哪些文件会用到它：
 * 1. src/main.ts — 插件大管家在同步完成后，通过它广播消息
 * 2. src/ui/containers/ReviewSession.tsx — 复习界面订阅消息来刷新数字
 * 3. src/ui/views/ReactNoteReviewView.tsx — 侧边栏订阅消息来刷新列表
 * 4. src/dataStore/deckStatsService.ts — 当卡片统计刷新时发送 deck-stats-updated
 */

type Listener = () => void;

/**
 * 极简事件总线
 * 用于在插件同步完成后，通知所有已打开的 UI 组件进行局部刷新
 */
export class SyncEvents {
    private listeners: Map<string, Set<Listener>> = new Map();

    /**
     * 订阅事件
     * @returns 取消订阅的函数，方便在 useEffect 的 cleanup 中调用
     */
    on(event: string, listener: Listener): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(listener);

        // 返回取消订阅函数
        return () => {
            this.listeners.get(event)?.delete(listener);
        };
    }

    /**
     * 触发事件，通知所有监听者
     */
    emit(event: string): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            for (const listener of eventListeners) {
                try {
                    listener();
                } catch (e) {
                    console.error(`[SyncEvents] 事件 "${event}" 的监听器出错:`, e);
                }
            }
        }
    }

    /**
     * 移除某个事件的所有监听者
     */
    removeAll(event: string): void {
        this.listeners.delete(event);
    }
}
