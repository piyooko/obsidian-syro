# 死代码审计第一批候选

这份清单是在 `docs/deadcode-audit.md` 的基础上，针对 A 档和高优先级 B 档做的第二轮人工复核。

目标不是直接删除，而是把“最值得先交给 AI 或人工逐个确认并开删”的批次收紧出来。

## 执行状态

- 已完成：
  - 旧设置函数文件（2026-04-19）
  - 旧 modal / view 实现（2026-04-19）
  - `src/NoteEaseCalculator.ts`（2026-04-19）
  - `src/dataStore/location_switch.ts`（2026-04-19）
  - repo 级未使用依赖与测试侧 `moment` 引用（2026-04-19）
- 保留：
  - 无
- 延后：
  - `src/ui/modals/getInputModal.ts`
    - 原因：本轮只清理了未使用局部变量，未继续删除 UI 输入弹窗壳；下一轮删除前还要复核命令入口与动态挂载链。
  - `src/util/platform.ts`
    - 原因：当前被 Knip 判为 unused file，但它属于平台适配薄封装，先按兼容性候选保留，下一轮再确认移动端/桌面分支是否仍需要。
  - `src/algorithms/balance/postpone.ts`
    - 原因：当前被 Knip 判为 unused file，但它属于旧推迟复习算法实现，先按兼容性候选保留，下一轮再确认命令链与旧平衡算法是否已经完全断开。

## 第一批可优先复核删除

### 1. 旧设置函数文件（已处理）

候选文件：

- `src/settings/burySiblingSetting.ts`
- `src/settings/ignoreSetting.ts`
- `src/settings/intervalShowHideSetting.ts`
- `src/settings/locationSetting.ts`
- `src/settings/mixQueueSetting.ts`
- `src/settings/multiClozeSetting.ts`
- `src/settings/responseBarSetting.ts`
- `src/settings/reviewNoteDirectlySetting.ts`
- `src/settings/trackSetting.ts`

当前证据：

- 这组文件里的导出函数在 `src` 和 `tests` 中没有任何代码级引用。
- 新设置入口已经是 `src/ui/settings/settings-react.tsx`，并直接渲染 `EmbeddedSettingsPanel`。
- 这些旧设置文件现在更像是 React 设置面板上线前遗留的旧实现。

处理结果：

- 已确认当前设置入口为 `src/ui/settings/settings-react.tsx`，并直接渲染 `EmbeddedSettingsPanel`。
- 已删除这 9 个旧设置函数文件，并清理 `src/lang/locale/en.ts` 中相关来源注释。
- `pnpm test -- tests/unit/settings-react.test.ts` 的断言全部通过；命令仍会因为仓库现有的全局 coverage 门槛返回非零。
- `pnpm run audit:deadcode:prod` 已不再报告这组 `src/settings/*.ts` 文件。
- `pnpm run lint:obsidian` 通过。

误判风险：已关闭

### 2. 旧 modal / view 实现（已处理）

候选文件：

- `src/ui/modals/DeckOptionsModal.ts`
- `src/ui/modals/info.ts`
- `src/ui/modals/ReleaseNotes.ts`
- `src/ui/views/StatsModal.tsx`

当前证据：

- 这几个类名在 `src` 和 `tests` 中没有任何构造调用或 import 引用。
- `DeckOptionsModal` 只剩自身定义，当前牌组选项已经直接使用 `DeckOptionsPanel`。
- `ItemInfoModal`、`ReleaseNotes`、`StatsModal` 也只剩类定义和注释提及。
- `StatsModal` 是当前 `chart.js` 的唯一代码级上游；如果它确认可删，`chart.js` 可以一起进入删除链路。

处理结果：

- 已确认 `DeckOptionsModal`、`ItemInfoModal`、`ReleaseNotes`、`StatsModal` 在 `src` 与 `tests` 中都没有构造调用或 import 引用。
- 已删除这 4 个旧 modal / view 文件，并清理 `src/lang/locale/en.ts` 与 `src/stats.ts` 中的遗留注释。
- 已从 `package.json` 与 `pnpm-lock.yaml` 中移除 `chart.js`。
- `pnpm test -- tests/unit/DeckOptionsPanel.test.tsx` 的断言全部通过；命令仍会因为仓库现有的全局 coverage 门槛返回非零。
- `pnpm run audit:deadcode:prod` 已不再报告这 4 个文件，`chart.js` 也不再出现在 unused dependency 中。
- `pnpm run lint:obsidian` 通过。

误判风险：已关闭

### 3. 独立逻辑类（已处理）

候选文件：

- `src/NoteEaseCalculator.ts`

当前证据：

- `NoteEaseCalculator` 在 `src` 和 `tests` 中没有 import，也没有构造或静态调用。
- 文件头注释仍写着“可能在某些调度逻辑中使用”，但当前仓库里已经找不到对应调用链。

处理结果：

- 已确认 `NoteEaseCalculator` 在 `src` 和 `tests` 中没有 import、构造调用或静态调用。
- 已删除 `src/NoteEaseCalculator.ts`。
- `pnpm run audit:deadcode:prod` 已不再报告该文件。
- `pnpm run lint:obsidian` 通过。

误判风险：已关闭

## 需要再看一眼再删

### 4. 旧迁移逻辑（已处理）

候选文件：

- `src/dataStore/location_switch.ts`

当前证据：

- 运行时代码里找不到 import。
- 目前只发现测试引用：`tests/unit/location_switch.test.ts`
- 另外还有少量注释或说明文字提到它。

处理结果：

- 已确认运行时代码中不存在 `LocationSwitch` 的 import、构造调用或迁移入口。
- `src/dataStore/syroLegacy011Migration.ts` 已承担当前 0.0.11 -> 0.0.12 的兼容迁移职责，`location_switch.ts` 不再参与现有数据层。
- 已删除 `src/dataStore/location_switch.ts` 与 `tests/unit/location_switch.test.ts`，并清理 `src/lang/locale/en.ts` 及相关说明注释中的直接引用。
- `pnpm run audit:deadcode:prod` 已不再报告该文件。
- `pnpm run lint:obsidian` 通过。

误判风险：已关闭

## 依赖联动候选

### `chart.js`（已处理）

当前证据：

- 目前只在 `src/ui/views/StatsModal.tsx` 中发现代码级引用。
- 如果 `StatsModal` 删除成立，`chart.js` 大概率可以一起删除。

处理结果：

- 已随 `StatsModal` 删除链路一并移除，不再出现在当前审计结果中。

### `fflate`（已处理）

当前证据：

- 当前扫描里没有发现代码级引用。
- 还没有做针对性的历史用途复核。

处理结果：

- 已确认仓库内没有 `fflate` 的源码、测试或工具链引用。
- 已从 `package.json` 与 `pnpm-lock.yaml` 中移除。
- `pnpm run audit:deadcode:repo` 已不再报告该依赖。

### `preact` / `vhtml` / `@types/vhtml`（已处理）

当前证据：

- `preact` 没找到代码级引用。
- `vhtml` 相关目前只在 `config/build/esbuild.config.mjs` 的说明日志里出现，没有看到实际运行时代码引用。

处理结果：

- 已确认当前 `.tsx` 文件都位于 `src/ui/**`，并走 React JSX 路径；仓库内没有 `preact` / `vhtml` 的实际 import。
- 已从 `package.json` 与 `pnpm-lock.yaml` 中移除 `preact`、`vhtml`、`@types/vhtml`。
- `pnpm run audit:deadcode:repo` 已不再报告这组依赖。

### 其它 repo 级依赖与测试侧 `moment`（已处理）

处理结果：

- 已确认 `@microsoft/eslint-plugin-sdl` 与 `@popperjs/core` 没有当前工具链引用，并已从 `package.json` 与 `pnpm-lock.yaml` 中移除。
- 已把 `tests/unit/DeckOptionsPanel.test.tsx`、`tests/unit/NoteReviewSidebar.test.tsx`、`tests/unit/__mocks__/obsidian.js` 改为复用统一的 `obsidian` mock，不再直接 `require("moment")`。
- `pnpm exec jest tests/unit/DeckOptionsPanel.test.tsx --coverage=false` 通过。
- `pnpm exec jest tests/unit/NoteReviewSidebar.test.tsx --coverage=false` 通过。
- `pnpm run audit:deadcode:repo` 已不再报告 unused dependency、unused devDependency 或 unlisted dependency 的 `moment` 命中。

## 推荐的下一步提问方式

可以直接把下面这种问题继续交给 AI：

> 根据 `docs/deadcode-audit-batch1.md`，请先分析 `src/settings/*.ts` 这一组旧设置函数文件是否可以整体删除。  
> 当前设置入口已经是 `src/ui/settings/settings-react.tsx` -> `EmbeddedSettingsPanel`。  
> 请你结合现有代码，判断这些旧设置函数是否仍然有隐藏入口；如果可以删，请列出需要一起清理的 import、locale 注释、测试和依赖残余。

也可以按第二批再问：

> 请分析 `src/ui/views/StatsModal.tsx` 和 `chart.js` 是否可以一起删除。  
> 我希望你基于当前仓库确认是否还存在任何统计弹窗入口、命令入口或动态调用。  
> 如果可以删，请列出相关代码和依赖清理项。

## 最终收口说明

- 截至 2026-04-19，本批计划内的高优先级删除项、依赖清理项和 `src/**` 局部垃圾清理都已执行完毕。
- 当前审计结果中的剩余项已明确归类为“兼容性保留”或“等待下一轮清理”，不再属于本批次的灰区候选。
