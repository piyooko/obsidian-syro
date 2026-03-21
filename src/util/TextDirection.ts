/**
 * 这个文件主要是干什么的：
 * [工具层] 文本方向枚举。
 * 定义了 LTR (从左到右) 和 RTL (从右到左) 的枚举值，支持阿拉伯语等 RTL 语言的显示。
 *
 * 它在项目中属于：工具层 (Utils) / 类型定义 (Enum)
 *
 * 它会用到哪些文件：
 * (无)
 *
 * 哪些文件会用到它：
 * 1. src/util/RenderMarkdownWrapper.ts
 * 2. src/ReviewDeck.ts
 */
export enum TextDirection {
    Unspecified,
    Ltr,
    Rtl,
}
