# 死代码审计候选清单

- 生成时间: 2026-04-19T12:29:28.384Z
- 生成命令: `pnpm run audit:deadcode`
- 生产侧 Knip: 3 个 unused files, 28 个 unused exports, 4 个 unused exported types
- 全仓库 Knip: 3 个 unused files, 24 个 unused exports, 4 个 unused exported types
- src-only TypeScript: 21 条未使用局部变量/参数诊断

## 使用约定

- A 档: 高置信可删候选。无明显运行时入口，适合优先交给 AI 复核。
- B 档: 需要 AI / 人工复核。通常仍和旧逻辑、迁移链路、测试或符号级引用有关。
- C 档: 配置覆盖或动态装配带来的噪音，不进入当前删减名单。

## A 档: 高置信可删候选

| 文件/符号 | 归类 | 误判风险 | 推荐动作 |
| --- | --- | --- | --- |
| src/ui/modals/getInputModal.ts | A | low | 优先交给 AI 复核，确认入口链断开后直接删 |

## B 档: 需要 AI / 人工复核

| 文件/符号 | 命中项 | 归类 | 误判风险 | 推荐动作 |
| --- | --- | --- | --- | --- |
| src/algorithms/balance/postpone.ts | unused file | B | medium | 先检查动态入口、旧逻辑或注释引用，再决定是否删 |
| src/util/platform.ts | unused file | B | medium | 先检查动态入口、旧逻辑或注释引用，再决定是否删 |
| src/settings.ts:548:17 | updateDeckOptionsPresetStepProxy | B | medium | 确认调用链后再删 |
| src/settings.ts:654:17 | resolveDeckOptionsPresetIndex | B | medium | 确认调用链后再删 |
| src/scheduling.ts:15:17 | parseSteps | B | medium | 确认调用链后再删 |
| src/util/utils.ts:39:14 | escapeRegexString | B | medium | 确认调用链后再删 |
| src/util/utils.ts:165:17 | isEqualOrSubPath | B | medium | 确认调用链后再删 |
| src/dataStore/data.ts:101:14 | DEFAULT_SRS_DATA | B | medium | 确认调用链后再删 |
| src/dataStore/deckOptionsStore.ts:343:17 | createPersistableSettingsSnapshot | B | medium | 确认调用链后再删 |
| src/dataStore/dataLocation.ts:31:14 | locationMap | B | medium | 确认调用链后再删 |
| src/dataStore/dataLocation.ts:39:17 | getLocalizedLocationMap | B | medium | 确认调用链后再删 |
| src/dataStore/pendingOverlayStore.ts:73:17 | createEmptyPendingOverlayFile | B | medium | 确认调用链后再删 |
| src/dataStore/syroUuidAlias.ts:69:17 | getEquivalentUuidSet | B | medium | 确认调用链后再删 |
| src/util/utils_recall.ts:335:14 | errorlog | B | medium | 确认调用链后再删 |
| src/util/utils_recall.ts:352:14 | logExecutionTime | B | medium | 确认调用链后再删 |
| src/constants.ts:18:14 | SCHEDULING_INFO_REGEX | B | medium | 确认调用链后再删 |
| src/constants.ts:20:14 | YAML_FRONT_MATTER_REGEX | B | medium | 确认调用链后再删 |
| src/constants.ts:21:14 | YAML_TAGS_REGEX | B | medium | 确认调用链后再删 |
| src/constants.ts:37:14 | SR_HTML_COMMENT_BEGIN | B | medium | 确认调用链后再删 |
| src/constants.ts:38:14 | SR_HTML_COMMENT_END | B | medium | 确认调用链后再删 |
| src/dataStore/queue.ts:42:14 | DEFAULT_QUEUE_DATA | B | medium | 确认调用链后再删 |
| src/util/typeGuards.ts:35:17 | getRecordProp | B | medium | 确认调用链后再删 |
| src/util/typeGuards.ts:40:17 | isNumberRecord | B | medium | 确认调用链后再删 |
| src/util/typeGuards.ts:47:17 | isStringArray | B | medium | 确认调用链后再删 |
| src/util/typeGuards.ts:51:17 | isNumberArray | B | medium | 确认调用链后再删 |
| src/util/RandomNumberProvider.ts:14:14 | StaticRandomNumberProvider | B | medium | 确认调用链后再删 |
| src/util/cloze-review-context.ts:45:17 | resolveClozeReviewContext | B | medium | 确认调用链后再删 |
| src/ui/timeline/timelineMessage.ts:249:17 | getTimelineDurationPrefixSegment | B | medium | 确认调用链后再删 |
| src/util/safeHtml.ts:69:17 | setSanitizedHtml | B | medium | 确认调用链后再删 |
| src/ui/components/common/SettingsComponents.tsx:339:14 | LinkRow | B | medium | 确认调用链后再删 |
| scripts/check-i18n-core.cjs:388:5 | collectSourceFiles | B | medium | 确认调用链后再删 |
| tests/unit/helpers/DateProviderTestUtils.ts:12:17 | setupStaticDateProvider_OriginDatePlusDays | B | medium | 确认调用链后再删 |
| src/dataStore/syroPluginDataStore.ts:91:13 | SharedSettingsField | B | medium | 确认类型外部约定后再删 |
| src/dataStore/syroPluginDataStore.ts:92:13 | DeviceStateField | B | medium | 确认类型外部约定后再删 |
| src/dataStore/syroWorkspace.ts:126:18 | SyroDeviceSelectionRequest | B | medium | 确认类型外部约定后再删 |
| src/dataStore/trackedFile.ts:56:13 | CardInfo | B | medium | 确认类型外部约定后再删 |

## C 档: 误报或配置型噪音

_None_

## src/** 局部垃圾候选

| 文件/符号 | 类型 | 诊断 |
| --- | --- | --- |
| src/commands.ts:17:13 | TS6133 | 'runAsync' is declared but its value is never read. |
| src/dataStore/data.ts:1313:36 | TS6133 | 'fallbackPath' is declared but its value is never read. |
| src/DeckTreeIterator.ts:426:13 | TS6133 | 'removeCurrentDeckIfEmpty' is declared but its value is never read. |
| src/DeckTreeStatsCalculator.ts:32:13 | TS6133 | 'deckTree' is declared but its value is never read. |
| src/FlashcardReviewSequencer.ts:106:13 | TS6133 | 'questionPostponementList' is declared but its value is never read. |
| src/main.ts:563:13 | TS6133 | 'persistedLicenseState' is declared but its value is never read. |
| src/question-type.ts:916:12 | TS6133 | 'answer' is declared but its value is never read. |
| src/question-type.ts:924:12 | TS6133 | 'answer' is declared but its value is never read. |
| src/question-type.ts:938:12 | TS6133 | 'answer' is declared but its value is never read. |
| src/question-type.ts:1199:13 | TS6133 | 'extractClozeInfos' is declared but its value is never read. |
| src/question-type.ts:1250:13 | TS6133 | 'groupLineScopedClozes' is declared but its value is never read. |
| src/question-type.ts:1305:13 | TS6133 | 'stripOtherAnkiClozeVisual' is declared but its value is never read. |
| src/ReviewDeck.ts:38:13 | TS6133 | '_dueNotesCount' is declared but its value is never read. |
| src/ui/modals/getInputModal.ts:15:13 | TS6133 | 'textComponent' is declared but its value is never read. |
| src/ui/modals/reviewresponse-modal.tsx:15:13 | TS6133 | 'app' is declared but its value is never read. |
| src/ui/modals/reviewresponse-modal.tsx:26:13 | TS6133 | 'barItemId' is declared but its value is never read. |
| src/ui/ReactReviewApp.tsx:10:13 | TS6133 | 'app' is declared but its value is never read. |
| src/ui/views/TabView.tsx:26:13 | TS6133 | 'reviewMode' is declared but its value is never read. |
| src/ui/views/TabView.tsx:30:13 | TS6133 | 'settings' is declared but its value is never read. |
| src/util/multi-cloze-util.ts:68:39 | TS6133 | 'v' is declared but its value is never read. |
| src/util/utils_recall.ts:354:9 | TS6133 | 'target' is declared but its value is never read. |

## 高优先级人工抽查

- `src/ui/modals/getInputModal.ts`: 确认未在当前 UI 流程、命令入口或动态挂载链里使用。
- `src/util/platform.ts`: 确认平台分支是否已被当前环境适配层完全替代。
- `src/algorithms/balance/postpone.ts`: 确认旧平衡算法是否仍有命令或调度链路间接调用。
