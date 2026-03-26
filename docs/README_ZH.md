[English](../README.md) | **中文文档**

**_Reshape Your Memory and Reading in Obsidian_**

> **将间隔重复（Spaced Repetition）与渐进阅读（Incremental Reading）的科学原理，无缝融入你的纯文本知识库。**

<img width="2494" height="1036" alt="image" src="https://github.com/user-attachments/assets/08e782b0-3bad-4cbc-ab57-2f80e08af323" />

## 核心特性

-   **情境化闪卡（告别“信息孤岛”）**
    直接使用原生 Markdown 语法（如 `==高亮==` 或 `::`）在笔记中创建闪卡。复习时如果忘记答案，一键就能跳回原笔记中的准确段落。记忆不再脱离上下文，而是在完整语境中形成。

-   **渐进阅读队列**
    将厚书、长网页剪藏或高密度文章批量放入右侧边栏队列。你可以按标签筛选，再交给 FSRS 算法决定今天该读什么，把庞大的待读积压拆成无压力的每日微任务。

-   **Timeline 时间线（像给阅读打 Git Commit）**
    读到一半累了，直接关掉即可。Syro 会自动保存你的精确滚动进度。几天后文章再次浮现时，点开 Timeline 就能回到上次中断的位置。你甚至可以留下一条“commit message”，提醒未来的自己当时在想什么。

-   **现代化界面与先进 FSRS 算法**
    界面简洁现代，尽量保持 Obsidian 原生观感（Style Settings 支持即将到来）。底层则由前沿的 **FSRS** 算法驱动，在尽可能减少复习时间的同时争取更高的记忆保留率。

## 当你的知识库沦为收藏坟场

很多人都会遇到同一个困境：我们在 Obsidian 里认真收集了大量网页、文章和笔记，但这些宝贵资料在保存后却逐渐沉入遗忘。传统的被动重读和高亮，往往难以支撑长期记忆，最后让知识库陷入“记下就忘”的循环。

Syro 想解决的正是这个问题。它不是要替代你原有的笔记习惯，而是为你的知识系统引入“时间”这一维度，把静态知识库转变成一个能够主动、智能地帮助你学习与记忆的动态系统。

## 适合谁？

-   *数字收藏家*：把“稍后再读”坟场变成每天都能消化的内容流。

-   *学生与专业人士*：在原始上下文中记住复杂术语，而不是把知识切碎成孤立的 Anki 卡片。

-   *Zettelkasten 用户*：让零散想法随时间自然重现，并逐步建立更深的连接。

## 探索文档

想更深入地了解 Syro 的能力，可以从下面的文档入口开始。现在中英文文档树已经保持镜像对齐。

-   **[Syro 中文文档总览](./docs/zh/index.md)**
-   **[核心理念](./docs/zh/getting-started/introduction.md)**
-   **[5 分钟快速上手](./docs/zh/getting-started/quick-start.md)**
-   **[闪卡复习总览](./docs/zh/flashcards/index.md)**
-   **[笔记复习总览](./docs/zh/note-review/index.md)**
-   **[数据、同步与备份机制](./docs/zh/advanced-and-faq/data-and-sync.md)**

## 安装指南

### 通过 BRAT 安装

如果 Syro 还没有出现在你的 Obsidian 社区插件商店中，可以先通过 `BRAT` 安装，以尽快获取最新发布版本。

**详细步骤：**

1.  **安装 BRAT**

    -   如果你还没有安装 BRAT，请前往 `设置` > `社区插件` > `浏览`。
    -   搜索 `BRAT`，找到 `Obsidian42 - BRAT`，点击 `安装`，然后再点击 `启用`。

2.  **添加 Syro 仓库**

    -   打开 BRAT 的设置页（`设置` > `社区插件` > `BRAT`）。
    -   点击 `Add Beta plugin` 按钮。

3.  **粘贴仓库地址**

    -   在弹出的输入框中粘贴本仓库的地址：
        ```
        https://github.com/piyooko/obsidian-syro
        ```
    -   然后点击 `Add Plugin`。BRAT 会自动下载 Syro 的最新版本。

4.  **启用插件**

    -   BRAT 下载完成后，回到 `设置` > `社区插件` 列表。
    -   找到 `Syro` 并将其打开。

现在 Syro 就已经安装完成，可以开始使用了。

### 社区插件商店

如果 Syro 已经上架 Obsidian 官方社区插件商店，你也可以直接搜索 `Syro` 并完成安装。

### 手动安装（备选方案）

1.  前往本仓库的 [Releases](https://github.com/piyooko/obsidian-syro/releases) 页面，下载最新版本中的 `main.js`、`manifest.json` 和 `styles.css`。
2.  在你的库中创建 `.obsidian/plugins/syro/` 文件夹。
3.  将下载的文件复制到这个新文件夹中。
4.  重启 Obsidian，并在 `设置` > `社区插件` 中启用 `Syro`。

## 致谢

Syro 的开发深受开源社区滋养，也受到了许多优秀项目的启发。我们向以下项目及其贡献者致以诚挚的感谢与敬意：

-   **[Obsidian](https://obsidian.md/)**：感谢你们打造了这个自由、开放、注重隐私的纯文本生态，让这一切成为可能。
-   **[Anki](https://apps.ankiweb.net/)**：作为间隔重复领域的里程碑式工具，它让主动回忆这一学习方法得以被更多人真正实践。
-   **[FSRS](https://github.com/open-spaced-repetition/fsrs4anki)**：感谢这一优秀的开源算法，显著推进了复习调度的科学性。
-   **[叶峻峣 (L-M-Sherlock)](https://github.com/L-M-Sherlock)**：感谢你在 FSRS 算法开发中的关键贡献，以及在推广间隔重复与先进教育实践上的不懈投入。
-   **[Obsidian Spaced Repetitions](https://github.com/st3v3nmw/obsidian-spaced-repetition)**：这是本插件最初的灵感来源，感谢你把间隔重复的火种带进 Obsidian 社区。

---

**License**: [MIT License](../LICENSE)

_(披露：Syro 的大部分核心功能都可免费使用。部分支持者专属的实验性功能需要进行 CDK 验证。当前版本不强制要求账号系统；插件可能会自动或由用户手动发起联网 CDK 校验，但不会向云端传输核心复习数据、笔记内容或任何与 CDK 验证无关的信息。)_
