# 死代码审计候选清单

-   生成时间: 2026-05-02T18:34:40.177Z
-   生成命令: `pnpm run audit:deadcode`
-   生产侧 Knip: 0 个 unused files, 0 个 unused exports, 0 个 unused exported types
-   全仓库 Knip: 0 个 unused files, 0 个 unused exports, 0 个 unused exported types
-   src-only TypeScript: 0 条未使用局部变量/参数诊断

## 使用约定

-   A 档: 高置信可删候选。无明显运行时入口，适合优先交给 AI 复核。
-   B 档: 需要 AI / 人工复核。通常仍和旧逻辑、迁移链路、测试或符号级引用有关。
-   C 档: 配置覆盖或动态装配带来的噪音，不进入当前删减名单。

## A 档: 高置信可删候选

_None_

## B 档: 需要 AI / 人工复核

_None_

## C 档: 误报或配置型噪音

_None_

## src/\*\* 局部垃圾候选

_None_

## 高优先级人工抽查

_None_
