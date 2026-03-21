# 闪卡复习总览

![闪卡牌组树](../../assets/media/en/flashcard-decks-1.jpg)

## 模块导读
闪卡（Flashcards）复习模块是 Syro 应用“主动回忆（Active Recall）”与“间隔重复（Spaced Repetition）”机制的核心功能区。

与传统的独立间隔重复软件不同，Syro 的闪卡直接内嵌于您的 Obsidian 笔记中。这意味着您在进行原子化知识测试的同时，随时可以一键回溯到原始的 Markdown 文本中，重新获取丰富的上下文支持。

本组文档将为您完整呈现从“知识提取”到“规律复习”的工作流闭环。

## 核心工作流概览
Syro 为闪卡复习提供了高度灵活的操作路径，您可以根据当前的专注目标自由选择：
- **全局视野**：通过执行 `Review flashcards from all notes`，打开包含库中所有待复习卡片的“全景牌组树”。
- **聚焦当下**：在阅读某篇特定笔记时，执行 `Review flashcards in this note`，系统将仅针对当前文档中的卡片启动沉浸式测试。

## 章节导航
为帮助您系统掌握闪卡工作流，我们将其拆分为以下两个核心部分：

1. **[优雅地编写闪卡 (Card Authoring)](./card-authoring.md)**
   - 介绍如何在不打断写作心流的前提下，使用分隔符、高亮、粗体等最自然的 Markdown 标记生成问答卡与填空卡（Cloze）。
   - 包含针对复杂排版（如代码块、LaTeX 公式）的支持说明。

2. **[管理复习与心流 (Review Workflow)](./review-workflow.md)**
   - 介绍如何解读“牌组树”上的各项数字（New / Learn / Due）。
   - 说明在复习会话中如何进行客观的状态评分（Again / Hard / Good / Easy），以正确引导底层调度算法。
   - 指导您如何通过“牌组选项”设置每日上限，科学控制长期的认知负荷。

---
**下一步：**
如果您尚未在笔记中创建任何卡片，建议从 [优雅地编写闪卡](./card-authoring.md) 开始阅读。