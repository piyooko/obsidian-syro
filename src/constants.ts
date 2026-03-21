/**
 * 这个文件主要是干什么的：
 * [常量] 全局常量定义。
 * 存放正则表达式（如 Frontmatter 解析正则）、日期格式、文件扩展名列表、HTML 注释标记等。
 *
 * 它在项目中属于：核心层 (Core) / 常量 (Constants)
 *
 * 它会用到哪些文件：
 * (无)
 *
 * 哪些文件会用到它：
 * 1. src/parser.ts
 * 2. src/util/*.ts
 * 3. src/main.ts
 */
// To cater for both LF and CR-LF line ending styles, "\r?\n" is used to match the newline character sequence
// Legacy compatibility note retained from earlier queue behavior fixes.
export const SCHEDULING_INFO_REGEX =
    /^---\r?\n((?:.*\r?\n)*)sr-due: (.+)\r?\nsr-interval: (\d+)\r?\nsr-ease: (\d+)\r?\n((?:.*\r?\n)*)---\n/;
export const YAML_FRONT_MATTER_REGEX = /^---\r?\n((?:.*\r?\n)*?)---/;
export const YAML_TAGS_REGEX = /^---\n((?:.*\n)*?)tags?:(.*?(?:\n\s+- .*)*)\n((?:.*\n)*?)---/;
export const MULTI_SCHEDULING_EXTRACTOR = /!([\d-]+),(\d+),(\d+)/gm;
export const LEGACY_SCHEDULING_EXTRACTOR = /<!--SR:([\d-]+),(\d+),(\d+)-->/gm;
export const OBSIDIAN_TAG_AT_STARTOFLINE_REGEX = /^#[^\s#]+/gi;

// https://help.obsidian.md/Linking+notes+and+files/Internal+links#Link+to+a+block+in+a+note
// Block identifiers can only consist of letters, numbers, and dashes.
// RZ: 2024-01-01 Empirically determined that obsidian only recognizes a block identifier if the
// "^" is preceded by a space
export const OBSIDIAN_BLOCK_ID_ENDOFLINE_REGEX = /[ \n](\^[a-zA-Z0-9-]+)$/;

export const PREFERRED_DATE_FORMAT = "YYYY-MM-DD";
export const ALLOWED_DATE_FORMATS = [PREFERRED_DATE_FORMAT, "DD-MM-YYYY", "ddd MMM DD YYYY"];

export const TICKS_PER_DAY = 24 * 3600 * 1000;

export const SR_HTML_COMMENT_BEGIN = "<!--SR:";
export const SR_HTML_COMMENT_END = "-->";

export const SR_TAB_VIEW = "spaced-repetition-recall-tab-view";
export const DEFAULT_DECKNAME = "default";
