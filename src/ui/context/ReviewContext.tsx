/** @jsxImportSource react */
import { createContext } from "react";
import { App } from "obsidian";
import type SRPlugin from "src/main";
import { IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { SRSettings } from "src/settings";

/**
 * ReviewContext 类型定义
 *
 * 为整个复习会话提供全局访问的上下文
 */
interface ReviewContextType {
    app: App;
    plugin: SRPlugin;
    settings: SRSettings;
    sequencer: IFlashcardReviewSequencer;
}

/**
 * ReviewContext
 *
 * 提供 plugin、sequencer 等核心对象的全局访问
 */
export const ReviewContext = createContext<ReviewContextType | null>(null);

/**
 * useReviewContext Hook
 *
 * 方便在组件中获取上下文
 */
