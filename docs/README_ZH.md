[English](../README.md) | **中文文档**
**_Reshape Your Memory and Reading in Obsidian_**

> **将“间隔重复（Spaced Repetition）”与“渐进阅读（Incremental Reading）”的科学理念，无缝融入你的纯文本知识库。** > <img width="2741" height="1082" alt="image" src="https://github.com/user-attachments/assets/e4171711-61c7-4465-a1d0-f518c6709839" />

## 知识库沦为收藏库

我们在 Obsidian 中精心收集了海量的网页、文献与笔记，但这些宝贵的资料却往往在保存后便石沉大海。传统的笔记方法，如被动的重读和划线，往往难以形成长久记忆，最终使我们的知识库陷入“记录后即遗忘”的循环。

Syro 旨在为此提供一种解决方案。它并非意在取代你现有的笔记习惯，而是希望引入“时间”的维度，将你的静态知识库，转变为一个能够主动、智能地帮你学习与记忆的记忆系统。

## 为谁设计？

Syro 的核心机制——间隔重复与渐进阅读，尤其适合以下类型的 Obsidian 用户：

-   **对抗“数字收藏家”困境的知识囤积者**
    对于那些剪藏了大量内容却无力阅读的用户，Syro 的“渐进阅读”功能可将庞大的待读列表分解为每日可消化的微任务，通过算法定期推送，帮助你将静态的“信息仓库”转变为动态吸收的知识流。

-   **Zettelkasten 与常青笔记的践行者**
    Syro 允许知识在时间的沉淀下自我生长。算法会定期将你的灵感卡片、不成熟的草稿笔记重新带回你的视野，鼓励你在多次的接触中不断打磨、补充细节、建立新的连接，实现“渐进式思考”与“渐进式写作”。

-   **渴望跨学科碰撞的创意工作者**
    通过在不同主题的笔记与摘录之间进行交错学习（Interleaved Learning），系统能为你创造出意想不到的语义联系，激发“神经创造力”，为复杂问题的解决和深刻洞见的产生提供温床。

-   **攻克复杂硬核知识的专业人士与学生**
    面对艰深概念，Syro 允许你将必须掌握的术语、公式和核心定义制作为闪卡，训练至“自动化”提取的程度，从而释放宝贵的认知资源，去进行更高阶的逻辑推理与概念整合。

-   **需要“可编程注意力”的执行者**
    系统接管了繁琐的复习规划工作，消除了“今天该学什么”的决策疲劳。它就像大脑的“定时任务系统”，每天为你生成一组科学的微任务，帮助你仅需跟随引导，就能高效地对抗遗忘。

## 🌟 核心能力

-   **附带上下文语境的闪卡 (Contextual Flashcards)**
    使用自然的 Markdown 语法（如 `==高亮==` 或 `::`）在笔记中直接创建卡片。复习时若遇遗忘，可一键回溯原文，**帮助你**在理解完整语境的基础上进行记忆，而非孤立地死记硬背。

-   **渐进阅读 (Incremental Reading)**
    将长篇文献或待读笔记纳入调度队列。算法会智能地将其打散到未来的碎片时间中，并利用 Timeline 机制记录你每次的阅读位置，**为你**实现轻松、无压力的长线学习。

-   **先进调度算法 (Advanced Scheduling)**
    内置前沿的 **FSRS** (Free Spaced Repetition Scheduler) 算法。相较于传统算法，它能更精准地预测你的遗忘曲线，**旨在**以更少的复习次数达到更高的记忆保留率。

-   **坚守本地与数据安全 (Local & Private)**
    深度贯彻 Obsidian 的本地化哲学。所有复习数据均以纯文本 JSON 格式安全地保存在你的本地设备中，你的知识永远属于你自己。

## 📖 探索官方文档

想要深入了解 Syro 的潜力，请查阅我们的中文使用指南。

-   🏠 **[Syro 中文文档总览](./docs/zh/index.md)**
-   🚀 **[5 分钟快速上手指南](./docs/zh/getting-started/quick-start.md)**
-   🧠 **[闪卡复习工作流：从制卡到记忆](./docs/zh/flashcards/index.md)**
-   📚 **[笔记复习工作流：掌控你的阅读队列](./docs/zh/note-review/index.md)**
-   🛠️ **[数据、同步与排障指南](./docs/zh/advanced-and-faq/faq-troubleshooting.md)**

## ⬇️ 安装指南

### 通过 BRAT 安装

如果您的 Obsidian 当前还无法在社区插件市场中直接找到 Syro，可先通过 `BRAT` 安装，以便及时获取最新发布版本。

**详细安装步骤：**

1.  **安装 BRAT 插件**

    -   如果您的 Obsidian 中尚未安装 BRAT，请前往 `设置` > `第三方插件` > `社区插件市场` > `浏览`。
    -   在搜索框中输入 `BRAT`，找到 `Obsidian42 - BRAT` 并点击 `安装`，然后 `启用` 它。

2.  **添加 Syro 仓库**

    -   打开 BRAT 插件的设置页面（`设置` > `第三方插件` > `BRAT`）。
    -   点击 `Add Beta plugin` (添加 Beta 插件) 按钮。

3.  **粘贴仓库地址**

    -   在弹出的输入框中，粘贴本插件的 GitHub 仓库地址：
        ```
        https://github.com/piyooko/obsidian-syro/
        ```
    -   然后点击 `Add Plugin` (添加插件)。BRAT 将会自动为您下载最新版本的 Syro。

4.  **启用 Syro 插件**
    -   下载完成后，返回到 `设置` > `第三方插件` 列表。
    -   找到 `Syro`，并点击右侧的开关以启用它。

现在，Syro 已经成功安装并准备就绪了！

### 社区插件市场

如果 Syro 已经出现在 Obsidian 官方社区插件市场中，您可以直接在市场中搜索 `Syro` 并完成安装。

### 手动安装 (备用方案)

1.  前往本仓库的 [Releases](https://github.com/piyooko/obsidian-syro/releases) 页面，下载最新版本的 `main.js`、`manifest.json`、`styles.css`。
2.  在你的 Obsidian 库中创建目录 `.obsidian/plugins/syro`。
3.  将上述文件放入该目录。
4.  重启 Obsidian，在设置的“第三方插件”中启用 `Syro`。

## 诚挚致谢 (Acknowledgements)

Syro 的开发离不开开源社区的滋养与众多卓越项目的启发。我们在此向以下项目及其贡献者致以最诚挚的敬意与感谢：

-   **[Obsidian](https://obsidian.md/)**: 感谢其创造了这片自由、开放、注重隐私的纯文本生态，让一切成为可能。
-   **[Anki](https://apps.ankiweb.net/)**: 间隔重复领域的伟大先驱，向其对主动回忆机制的普及致敬。
-   **[FSRS](https://github.com/open-spaced-repetition/fsrs4anki)**: 感谢其开源的出色算法，极大地推动了记忆调度的科学性。
-   并特别向 **[叶峻峣 (L-M-Sherlock)](https://github.com/L-M-Sherlock)** 致以敬意。不仅作为 FSRS 算法的核心贡献者，更作为一名热忱的布道者，为间隔重复与先进教育理念在中文社区的普及所做出的杰出贡献。
-   **[Obsidian Spaced Repetitions](https://github.com/st3v3nmw/obsidian-spaced-repetition)**: 本插件最初的灵感源泉，感谢其为 Obsidian 社区带来了间隔重复的火种。
-   **[Obsidian Smart Connections](https://github.com/brianpetro/obsidian-smart-connections)**: 在探索本地知识库与 AI 技术的结合上，其优秀的工程架构与创新思路提供了宝贵的启发。

---

**License**: [MIT License](./LICENSE)  
_(披露：Syro 的大多核心功能可免费使用，部分支持者专属实验功能需要通过 CDK 验证。当前版本无强制账号体系；本插件会自动或用户手动进行 CDK 联网校验，但不会向云端发送核心复习数据、笔记内容或其他与 CDK 校验无关的内容。)_
