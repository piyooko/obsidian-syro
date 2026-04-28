/**
 * 这个文件主要是干什么的：
 * 这个文件存放了插件的所有英文（English）翻译。
 * 它包含了界面上显示的所有英文文本，用于保证全球用户都能正常使用插件。
 *
 * 它在项目中属于：界面层 (UI) / 资源 (Resources)
 *
 * 它会用到哪些文件：
 * 无（这是一个纯数据文件，只包含键值对）
 *
 * 哪些文件会用到它：
 * 1. src/lang/helpers.ts（负责检测系统语言并加载对应的翻译文件）
 */
// English

const PROTECTED_SEGMENT_REGEX = /\$\{[^}]+\}|`[^`]*`|<\/?[^>]+>/g;

const SENTENCE_CASE_OVERRIDES: Array<[RegExp, string]> = [
    [/\bgithub\b/gi, "GitHub"],
    [/\bobsidian\b/gi, "Obsidian"],
    [/\banki\b/gi, "Anki"],
    [/\bsupermemo\b/gi, "SuperMemo"],
    [/\bmarkdown\b/gi, "Markdown"],
    [/\blatex\b/gi, "LaTeX"],
    [/\bmathjax\b/gi, "MathJax"],
    [/\bcodemirror\b/gi, "CodeMirror"],
    [/\bpagerank\b/gi, "PageRank"],
    [/\bfsrs\b/gi, "FSRS"],
    [/\bsm-2\b/gi, "SM-2"],
    [/\bsm2\b/gi, "SM2"],
    [/\bosr\b/gi, "OSR"],
    [/\bq&a\b/gi, "Q&A"],
    [/\bhtml\b/gi, "HTML"],
    [/\bcss\b/gi, "CSS"],
    [/\bjson\b/gi, "JSON"],
    [/\bapi\b/gi, "API"],
    [/\bui\b/gi, "UI"],
    [/\burl\b/gi, "URL"],
    [/\buri\b/gi, "URI"],
    [/\bcsv\b/gi, "CSV"],
    [/\bpdf\b/gi, "PDF"],
    [/\ba-z\b/g, "A-Z"],
    [/\bz-a\b/g, "Z-A"],
    [/\bi\.e\.\b/gi, "i.e."],
    [/\be\.g\.\b/gi, "e.g."],
];

function sentenceCaseSegment(
    value: string,
    capitalizeNext: boolean,
): { text: string; capitalizeNext: boolean } {
    let result = "";

    for (const char of value) {
        if (/[A-Za-z]/.test(char)) {
            result += capitalizeNext ? char.toUpperCase() : char.toLowerCase();
            capitalizeNext = false;
            continue;
        }

        result += char;

        if (/[.!?]/.test(char)) {
            capitalizeNext = true;
        }
    }

    return { text: result, capitalizeNext };
}

function toSentenceCase(value: string): string {
    let result = "";
    let lastIndex = 0;
    let capitalizeNext = !/^\$\{[^}]+\}/.test(value);

    for (const match of value.matchAll(PROTECTED_SEGMENT_REGEX)) {
        const index = match.index ?? 0;
        const transformed = sentenceCaseSegment(value.slice(lastIndex, index), capitalizeNext);
        result += transformed.text;
        result += match[0];
        capitalizeNext = transformed.capitalizeNext;
        lastIndex = index + match[0].length;
    }

    const transformed = sentenceCaseSegment(value.slice(lastIndex), capitalizeNext);
    result += transformed.text;

    return SENTENCE_CASE_OVERRIDES.reduce(
        (current, [pattern, replacement]) => current.replace(pattern, replacement),
        result,
    );
}

function normalizeSentenceCaseLocale<T>(value: T): T {
    if (typeof value === "string") {
        return toSentenceCase(value) as T;
    }

    if (Array.isArray(value)) {
        const normalizedEntries = value.map((entry): unknown => normalizeSentenceCaseLocale(entry));
        return normalizedEntries as T;
    }

    if (value && typeof value === "object") {
        const normalizedObject = Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
                key,
                normalizeSentenceCaseLocale(entry),
            ]),
        );
        return normalizedObject as T;
    }

    return value;
}

export default normalizeSentenceCaseLocale({
    // flashcard-modal.tsx
    DECKS: "Decks",
    DUE_CARDS: "Due Cards",
    NEW_CARDS: "New Cards",
    TOTAL_CARDS: "Total Cards",
    BACK: "Back",
    SKIP: "Skip",
    EDIT_CARD: "Edit Card",
    RESET_CARD_PROGRESS: "Reset card's progress",
    RESET: "Reset",
    AGAIN: "Again",
    HARD: "Hard",
    GOOD: "Good",
    EASY: "Easy",
    SHOW_ANSWER: "Show Answer",
    UI_QUESTION_LABEL: "Question",
    UI_QUESTION_CONTENT: "Question Content",
    UI_ANSWER_LABEL: "Answer",
    UI_ANSWER_CONTENT: "Answer Content",
    CARD_PROGRESS_RESET: "Card's progress has been reset.",
    SAVE: "Save",
    CANCEL: "Cancel",
    NO_INPUT: "No input provided.",
    CURRENT_EASE_HELP_TEXT: "Current Ease: ",
    CURRENT_INTERVAL_HELP_TEXT: "Current Interval: ",
    CARD_GENERATED_FROM: "Generated from: ${notePath}",
    OPEN_NOTE: "Open Note",

    // main.ts
    OPEN_NOTE_FOR_REVIEW: "Open a note for review",
    REVIEW_CARDS: "Review flashcards",
    UNABLE_TO_LOCATE_CONTEXT: "Unable to locate saved context.",
    REVIEW_DIFFICULTY_FILE_MENU: "${difficulty}: ${interval}",
    REVIEW_NOTE_DIFFICULTY_CMD: "Review note as ${difficulty}",
    CRAM_ALL_CARDS: "Select a deck to cram",
    REVIEW_ALL_CARDS: "Review flashcards from all notes",
    REVIEW_CARDS_IN_NOTE: "Review flashcards in this note",
    INLINE_TITLE_CARD_PROGRESS_TOOLTIP:
        "Reviewable cards in this note: ${reviewableCount} / ${totalCount}",
    INLINE_TITLE_CARD_NO_CARDS: "No flashcards in this note",
    INLINE_TITLE_CARD_MENU_TOOLTIP: "More note review options",
    CRAM_CARDS_IN_NOTE: "Cram-review flashcards in this note (does not update scheduling)",
    VIEW_STATS: "View statistics",
    OPEN_REVIEW_QUEUE_VIEW: "Open Tracked Notes in sidebar",
    STATUS_BAR: "Review: ${dueNotesCount} note(s), ${dueFlashcardsCount} card(s) due",
    SYNC_TIME_TAKEN: "Sync took ${t}ms",
    NOTE_IN_IGNORED_FOLDER: "Note is saved under ignored folder (check settings).",
    NOTE_IN_IGNORED_TAGS: "Note contains ignored tags (check settings).",
    PLEASE_TAG_NOTE: "Please tag the note appropriately for reviewing (in settings).",
    RESPONSE_RECEIVED: "Response received.",
    NO_DECK_EXISTS: "No deck exists for ${deckName}",
    ALL_CAUGHT_UP: "You're all caught up now :D.",
    NOTICE_PREPARE_NOTE_LOCAL_REVIEW_CARDS_FAILED:
        "Syro: failed to prepare note-local review cards. Please sync and try again.",
    STATUS_BAR_FLASHCARD_DUE: "${dueFlashcardsCount} cards due",
    STATUS_BAR_NOTE_DUE: "${dueNotesCount} notes due",
    STATUS_BAR_FLASHCARD_DUE_SINGULAR: "${dueFlashcardsCount} card due",
    STATUS_BAR_NOTE_DUE_SINGULAR: "${dueNotesCount} note due",
    NOTICE_TEXT_SELECTION_REQUIRED: "Please select text to create cloze",
    NOTICE_EXTRACT_CREATED: "Extract created",
    EXTRACT_REVIEW_TITLE: "Extract",
    EXTRACT_SOURCE_MISSING: "Source note not found",
    EXTRACT_MEMO_LABEL: "Memo",
    EXTRACT_MEMO_PLACEHOLDER: "Add a note about why this extract matters",
    EXTRACT_BODY_LABEL: "Extract text",
    EXTRACT_EDIT_BODY: "Edit",
    EXTRACT_FINISH_EDIT: "Done",
    EXTRACT_CONTINUE_EXTRACT: "Extract selection",
    EXTRACT_OPEN_SOURCE: "Open source",
    EXTRACT_GRADUATE: "Graduate",
    EXTRACT_PRIORITY_LABEL: "Priority",
    EXTRACT_SAVED: "Saved",
    EXTRACT_SAVING: "Saving...",
    EXTRACT_SELECT_TEXT_REQUIRED: "Select text inside the extract first",
    EXTRACT_SAVE_FAILED: "Failed to save extract",
    EXTRACT_CONTEXT_SAVE_FAILED: "Failed to save extract context",
    EXTRACT_CONTEXT_NOT_READY: "Extract context is not ready",
    EXTRACT_NESTED_CREATED: "Nested extract created",
    EXTRACT_NO_ACTIVE_ITEMS: "No active extracts to review",
    EXTRACT_REVIEW_AGAIN: "Again",
    EXTRACT_REVIEW_GOOD: "Good",
    EXTRACT_REVIEW_SET_DATE: "Set",
    EXTRACT_REVIEW_GRADUATE: "Graduate",
    EXTRACT_SET_DATE_TITLE: "Set next extract review date",
    EXTRACT_SET_DATE_LABEL: "Review date",
    EXTRACT_SET_DATE_INVALID: "Choose a future review date",
    EXTRACT_SOURCE_AUTO_HEADING: "Auto · heading",
    EXTRACT_SOURCE_AUTO_PARAGRAPH: "Auto · paragraph",
    EXTRACT_SOURCE_MANUAL: "Manual extract",
    EXTRACT_STATS_LABEL: "${count} extract(s)",
    EXTRACT_TIMELINE_ACTIVE_TITLE: "Active extracts",
    NOTICE_CLOZE_CREATED: "Cloze c${nextId} created",
    DECK_TREE_FULL_SYNC_TITLE: "Sync changes (Incremental)",
    CMD_GLOBAL_SYNC_FULL: "Rebuild all cards (Reparse all notes)",
    CMD_OPEN_SYRO_RECOVERY: "Open Syro Sync Recovery",
    SYNC_PROGRESS_START: "Syncing...",
    SYNC_PROGRESS_PARSE_NOTES: "Parsing notes (${current}/${total})...",
    SYNC_PROGRESS_BUILD_TREE: "Building deck tree...",
    SYNC_PROGRESS_DONE: "Sync complete",
    SYNC_PROGRESS_PREPARE_DATA: "Preparing sync data...",
    SYNC_PROGRESS_DEDUP_FILES: "Deduplicating tracked files...",
    SYNC_PROGRESS_CLEAN_GHOST_FILES: "Cleaning invalid files...",
    SYNC_PROGRESS_SYNC_FILE: "Syncing file: ${fileName}",
    SYNC_PROGRESS_GARBAGE_COLLECT: "Cleaning invalid data...",

    // scheduling.ts
    DAYS_STR_IVL: "${interval}d",
    MONTHS_STR_IVL: "${interval}m",
    YEARS_STR_IVL: "${interval}y",
    DAYS_STR_IVL_MOBILE: "${interval}d",
    MONTHS_STR_IVL_MOBILE: "${interval}m",
    YEARS_STR_IVL_MOBILE: "${interval}y",
    HOURS_STR_IVL: "${interval}h",
    MINUTES_STR_IVL: "${interval}m",
    HOURS_STR_IVL_MOBILE: "${interval}h",
    MINUTES_STR_IVL_MOBILE: "${interval}m",

    // settings.ts
    SETTINGS_HEADER: "Syro",
    GROUP_TAGS_FOLDERS: "Tags & Folders",
    GROUP_FLASHCARD_REVIEW: "Flashcard Review",
    GROUP_FLASHCARD_SEPARATORS: "Flashcard Separators",
    GROUP_DATA_STORAGE: "Storage of Scheduling Data",
    GROUP_DATA_STORAGE_DESC: "Choose where to store the scheduling data",
    GROUP_FLASHCARDS_NOTES: "Flashcards & Notes",
    GROUP_CONTRIBUTING: "Contributing",
    CHECK_WIKI: 'For more information, check the <a href="${wikiUrl}">wiki</a>.',
    GITHUB_DISCUSSIONS:
        'Visit the <a href="${discussionsUrl}">discussions</a> section for Q&A help, feedback, and general discussion.',
    GITHUB_ISSUES:
        'Raise an <a href="${issuesUrl}">issue</a> if you have a feature request or a bug report.',
    GITHUB_ISSUES_MODIFIED_PLUGIN:
        'Raise an <a href="${issuesUrl}">issue</a> if you have a feature request, bug report, or Syro-specific regression.',
    GITHUB_SOURCE_CODE:
        'The project\'s source code is available on <a href="${githubProjectUrl}">GitHub</a>.',
    CODE_CONTRIBUTION_INFO:
        '<a href="${codeContributionUrl}">Here\'s</a> how to contribute code to the plugin.',
    TRANSLATION_CONTRIBUTION_INFO:
        '<a href="${translationContributionUrl}">Here\'s</a> how to translate the plugin to another language.',
    FOLDERS_TO_IGNORE: "Folders to ignore",
    FOLDERS_TO_IGNORE_DESC:
        "Enter folder paths or glob patterns on separate lines e.g. Templates/Scripts or **/*.excalidraw.md. This setting is common to both flashcards and notes.",
    OBSIDIAN_INTEGRATION: "Integration into Obsidian",
    FLASHCARDS: "Flashcards",
    FLASHCARD_EASY_LABEL: "Easy Button Text",
    FLASHCARD_GOOD_LABEL: "Good Button Text",
    FLASHCARD_HARD_LABEL: "Hard Button Text",
    FLASHCARD_EASY_DESC: 'Customize the label for the "Easy" Button',
    FLASHCARD_GOOD_DESC: 'Customize the label for the "Good" Button',
    FLASHCARD_HARD_DESC: 'Customize the label for the "Hard" Button',
    REVIEW_BUTTON_DELAY: "Button Press Delay (ms)",
    REVIEW_BUTTON_DELAY_DESC: "Add a delay to the review buttons before they can be pressed again.",
    FLASHCARD_TAGS: "Flashcard tags",
    FLASHCARD_TAGS_DESC:
        "Enter tags separated by spaces or newlines i.e. #flashcards #deck2 #deck3.",
    CONVERT_FOLDERS_TO_DECKS: "Convert folders to decks and subdecks",
    CONVERT_FOLDERS_TO_DECKS_DESC: "This is an alternative to the Flashcard tags option above.",
    INLINE_SCHEDULING_COMMENTS:
        "Save scheduling comment on the same line as the flashcard's last line?",
    INLINE_SCHEDULING_COMMENTS_DESC:
        "Turning this on will make the HTML comments not break list formatting.",
    BURY_SIBLINGS_TILL_NEXT_DAY: "Bury sibling cards until the next day",
    BURY_SIBLINGS_TILL_NEXT_DAY_DESC:
        "Siblings are cards generated from the same card text i.e. cloze deletions",
    BURY_SIBLINGS_TILL_NEXT_DAY_BY_NOTE_REVIEW:
        "Bury sibling cards until the next day by note review",
    MULTI_CLOZE: "enable multi-cloze card?",
    MULTI_CLOZE_DESC: "Combine new/ondue sibling clozes into one card.",
    SHOW_CARD_CONTEXT: "Show context in cards",
    SHOW_CARD_CONTEXT_DESC: "i.e. Title > Heading 1 > Subheading > ... > Subheading",
    SHOW_INTERVAL_IN_REVIEW_BUTTONS: "Show next review time in the review buttons",
    SHOW_INTERVAL_IN_REVIEW_BUTTONS_DESC:
        "Useful to know how far in the future your cards are being pushed.",
    CARD_MODAL_HEIGHT_PERCENT: "Flashcard Height Percentage",
    CARD_MODAL_SIZE_PERCENT_DESC:
        "Should be set to 100% on mobile or if you have very large images",
    RESET_DEFAULT: "Reset to default",
    CARD_MODAL_WIDTH_PERCENT: "Flashcard Width Percentage",
    RANDOMIZE_CARD_ORDER: "Randomize card order during review?",
    REVIEW_CARD_ORDER_WITHIN_DECK: "Order cards in a deck are displayed during review",
    REVIEW_CARD_ORDER_NEW_FIRST_SEQUENTIAL: "Sequentially within a deck (All new cards first)",
    REVIEW_CARD_ORDER_DUE_FIRST_SEQUENTIAL: "Sequentially within a deck (All due cards first)",
    REVIEW_CARD_ORDER_NEW_FIRST_RANDOM: "Randomly within a deck (All new cards first)",
    REVIEW_CARD_ORDER_DUE_FIRST_RANDOM: "Randomly within a deck (All due cards first)",
    REVIEW_CARD_ORDER_RANDOM_DECK_AND_CARD: "Random card from random deck",
    REVIEW_DECK_ORDER: "Order decks are displayed during review",
    REVIEW_DECK_ORDER_PREV_DECK_COMPLETE_SEQUENTIAL:
        "Sequentially (once all cards in previous deck reviewed)",
    REVIEW_DECK_ORDER_PREV_DECK_COMPLETE_RANDOM:
        "Randomly (once all cards in previous deck reviewed)",
    REVIEW_DECK_ORDER_RANDOM_DECK_AND_CARD: "Random card from random deck",
    DISABLE_CLOZE_CARDS: "Disable cloze cards?",
    CONVERT_HIGHLIGHTS_TO_CLOZES: "Convert ==highlights== to clozes",
    CONVERT_HIGHLIGHTS_TO_CLOZES_DESC:
        'Add/remove the <code>${defaultPattern}</code> from your "Cloze Patterns"',
    CONVERT_BOLD_TEXT_TO_CLOZES: "Convert **bolded text** to clozes",
    CONVERT_BOLD_TEXT_TO_CLOZES_DESC:
        'Add/remove the <code>${defaultPattern}</code> from your "Cloze Patterns"',
    CONVERT_CURLY_BRACKETS_TO_CLOZES: "Convert {{curly brackets}} to clozes",
    CONVERT_CURLY_BRACKETS_TO_CLOZES_DESC:
        'Add/remove the <code>${defaultPattern}</code> from your "Cloze Patterns"',
    CLOZE_PATTERNS: "Cloze Patterns",
    CLOZE_PATTERNS_DESC:
        'Enter cloze patterns separated by newlines. Check the <a href="${docsUrl}">wiki</a> for guidance.',
    INLINE_CARDS_SEPARATOR: "Separator for inline flashcards",
    FIX_SEPARATORS_MANUALLY_WARNING:
        "Note that after changing this you have to manually edit any flashcards you already have.",
    INLINE_REVERSED_CARDS_SEPARATOR: "Separator for inline reversed flashcards",
    MULTILINE_CARDS_SEPARATOR: "Separator for multiline flashcards",
    MULTILINE_REVERSED_CARDS_SEPARATOR: "Separator for multiline reversed flashcards",
    MULTILINE_CARDS_END_MARKER: "Characters denoting the end of clozes and multiline flashcards",
    NOTES: "Notes",
    NOTE: "Note",
    REVIEW_PANE_ON_STARTUP: "Enable note review pane on startup",
    TAGS_TO_REVIEW: "Tags to review",
    TAGS_TO_REVIEW_DESC: "Enter tags separated by spaces or newlines i.e. #review #tag2 #tag3.",
    TAGS_TO_IGNORE: "Tags to ignore",
    TAGS_TO_IGNORE_DESC:
        "Enter tags separated by spaces or newlines. Notes with these tags will be ignored during review.",
    OPEN_RANDOM_NOTE: "Open a random note for review",
    OPEN_RANDOM_NOTE_DESC: "When you turn this off, notes are ordered by importance (PageRank).",
    AUTO_NEXT_NOTE: "Open next note automatically after a review",
    MAX_N_DAYS_REVIEW_QUEUE: "Maximum number of days to display on note review panel",
    MIN_ONE_DAY: "The number of days must be at least 1.",
    VALID_NUMBER_WARNING: "Please provide a valid number.",
    UI: "User Interface",
    OPEN_IN_TAB: "Open in new tab",
    OPEN_IN_TAB_DESC: "Turn this off to open the plugin in a modal window",
    SHOW_STATUS_BAR: "Show status bar",
    SHOW_STATUS_BAR_DESC:
        "Turn this off to hide the flashcard's review status in Obsidian's status bar",
    SHOW_RIBBON_ICON: "Show icon in the ribbon bar",
    SHOW_RIBBON_ICON_DESC: "Turn this off to hide the plugin icon from Obsidian's ribbon bar",
    OPEN_TO_RIGHT: "Open to the right",
    DELETE: "Delete",
    RENAME: "Rename",
    OPEN: "Open",
    OPEN_IN_NEW_WINDOW: "Open in new window",
    ENABLE_FILE_MENU_REVIEW_OPTIONS:
        "Enable the review options in the file menu (e.g. Review: Easy, Good, Hard)",
    ENABLE_FILE_MENU_REVIEW_OPTIONS_DESC:
        "If you disable the review options in the file menu, you can review your notes using the plugin commands and, if you defined them, the associated command hotkeys.",
    INITIALLY_EXPAND_SUBDECKS_IN_TREE: "Deck trees should be initially displayed as expanded",
    INITIALLY_EXPAND_SUBDECKS_IN_TREE_DESC:
        "Turn this off to collapse nested decks in the same card. Useful if you have cards which belong to many decks in the same file.",
    ENABLE_VOLUME_KEY_CONTROL: "Enable volume key control",
    ENABLE_VOLUME_KEY_CONTROL_DESC: "Use volume up/down keys to review cards on mobile devices.",
    ALGORITHM: "Algorithm",
    CHECK_ALGORITHM_WIKI:
        'For more information, check the <a href="${algoUrl}">algorithm details</a>.',
    SM2_OSR_VARIANT: "OSR's variant of SM-2",
    BASE_EASE: "Base ease",
    BASE_EASE_DESC: "minimum = 130, preferrably approximately 250.",
    BASE_EASE_MIN_WARNING: "The base ease must be at least 130.",
    LAPSE_INTERVAL_CHANGE: "Interval change when you review a flashcard/note as hard",
    LAPSE_INTERVAL_CHANGE_DESC: "newInterval = oldInterval * intervalChange / 100.",
    EASY_BONUS: "Easy Bonus",
    EASY_BONUS_DESC:
        "The easy bonus allows you to set the difference in intervals between answering Good and Easy on a flashcard/note (minimum = 100%).",
    EASY_BONUS_MIN_WARNING: "The easy bonus must be at least 100.",
    LOAD_BALANCE: "Enable load balancer",
    LOAD_BALANCE_DESC: `Slightly tweaks the interval so that the number of reviews per day is more consistent.
        It's like Anki's fuzz but instead of being random, it picks the day with the least amount of reviews.
        It's turned off for small intervals.`,
    MAX_INTERVAL: "Maximum interval in days",
    MAX_INTERVAL_DESC: "Allows you to place an upper limit on the interval (default = 100 years).",
    MAX_INTERVAL_MIN_WARNING: "The maximum interval must be at least 1 day.",
    MAX_LINK_CONTRIB: "Maximum link contribution",
    MAX_LINK_CONTRIB_DESC:
        "Maximum contribution of the weighted ease of linked notes to the initial ease.",
    FUZZING: "Random due drift",
    FUZZING_DESC:
        "Add a small random offset to due dates so large batches do not pile up on the same day.",
    SWITCH_SHORT_TERM: "Switch to Short-term Scheduler",
    SWITCH_SHORT_TERM_DESC:
        "When disabled, this allow user to skip the short-term scheduler and directly switch to the long-term scheduler.",
    LOGGING: "Logging",
    DISPLAY_SCHEDULING_DEBUG_INFO:
        "Show the scheduler's debugging information on the developer console",
    DISPLAY_PARSER_DEBUG_INFO: "Show the parser's debugging information on the developer console",
    SCHEDULING: "Scheduling",
    EXPERIMENTAL: "Experimental",
    HELP: "Help",
    STORE_IN_NOTES: "In the notes",

    DATA_LOC: "Data Location",
    DATA_LOC_DESC: "Where to store the data file for spaced repetition items.",
    DATA_FOLDER: "Folder for `tracked_files.json`",
    NEW_PER_DAY: "New Per Day",
    NEW_PER_DAY_DESC:
        "Maximum number of new (unreviewed) notes to add to the queue each day, set `-1` with unlimit.",
    NEW_PER_DAY_NAN: "Timeout must be a number",
    NEW_PER_DAY_NEG: "New per day must be -1 or greater.",
    REPEAT_ITEMS: "Repeat Items",
    REPEAT_ITEMS_DESC: "Should items marked as incorrect be repeated until correct?",
    // WeightedMultiplier algorithm
    WMS_ALGORITHM: "Weighted Multiplier Scheduler",
    WMS_ALGORITHM_DESC:
        "Designed for incremental reading with flexible review pacing through importance weighting and interval inheritance",
    WMS_IMP_MIN: "Minimum Multiplier (Priority 1)",
    WMS_IMP_MIN_DESC: "Multiplier factor for priority 1 (most important)",
    WMS_IMP_MAX: "Maximum Multiplier (Priority 10)",
    WMS_IMP_MAX_DESC: "Extra multiplier for lowest priority notes (Priority=10)",
    WMS_SECTION_BASE_MULTIPLIERS: "Base Multipliers & Intervals",
    WMS_SECTION_IMPORTANCE_WEIGHTS: "Importance Weight Range",
    WMS_FEATURE_DIFFICULTY: "Difficulty Control",
    WMS_FEATURE_PRIORITY: "Priority Adjustment",
    WMS_FEATURE_INTERVAL: "Interval Inheritance",
    WMS_CORE_FEATURES: "Core Features:",
    WMS_FEATURE_LOGIC:
        "Logic Separation: Hard/Again do not apply importance multiplier, ensuring 'Hard' always reduces interval",
    WMS_FEATURE_INHERITANCE:
        "Interval Inheritance: Manual postponement updates current interval, algorithm calculates based on new interval",
    WMS_FEATURE_MAPPING:
        "Dynamic Mapping: Priority (1-10) linearly mapped to extra multiplier range",
    WMS_FORMULA_TITLE: "Algorithm Formulas with Current Parameters:",

    // New Algorithm Tab Keys

    ALGO_LOCATOR_TITLE: "Locator",
    ALGO_LOCATOR_SUBTITLE: "We chose the hard way to preserve your original text.",
    ALGO_LOCATOR_DESC:
        'Obsidian\'s soul lies in local plain text. Traditional review plugins often forcibly insert Block IDs or HTML tags into your notes, polluting your clean Markdown files.\n\nOur original **Multi-dimensional Context Fingerprint Algorithm** achieves millisecond-level precise positioning by integrating "text topology", "content hash", and "contextual flow", without modifying a single character of your source files. All this to ensure you retain 100% data ownership even without the plugin.',

    WMS_FEAT_1_TITLE: "Difficulty Control",
    WMS_FEAT_1_DESC: "Hard rating forces interval reduction, preventing blind postponement.",
    WMS_FEAT_2_TITLE: "Priority Adjustment",
    WMS_FEAT_2_DESC:
        "Dynamic frequency based on priority; important content is reviewed more often.",
    WMS_FEAT_3_TITLE: "Inheritance",
    WMS_FEAT_3_DESC:
        "Intelligently extends based on previous rhythm, rather than calculating from zero.",
    WMS_PARAMS_BASE: "Base Multiplier Configuration",
    WMS_PARAMS_WEIGHT: "Priority Weight Range",
    WMS_RESTORE_DEFAULTS: "Restore Defaults",
    WMS_SIMULATOR_TITLE: "Sandbox",
    WMS_SIM_CURR_INTERVAL: "Assumed Current Interval:",
    WMS_SIM_PRIORITY: "Assumed Priority:",

    FSRS_ALGORITHM_TITLE: "FSRS Scheduler (Flashcards)",
    FSRS_DESC:
        "The current industry-leading memory scheduling algorithm, pre-optimized for Syro. FSRS parameter optimizer is coming soon.",
    ALGO_LOCATOR_DESC_SHORT:
        "Non-intrusive locator for MD files, based on fingerprint and context similarity score.",
    WMS_AGAIN_ZERO: "Again Interval (Days)",
    WMS_HARD_PENALTY: "Hard Penalty Multiplier",
    WMS_GOOD_BASE: "Good Base Multiplier",
    WMS_EASY_BONUS: "Easy Bonus Multiplier",

    SETTINGS_SECTION_FLASHCARDS: "Flashcard Settings",
    WMS_FORMULA_AGAIN: "Again: I_next = 1 day",
    WMS_FORMULA_HARD: "Hard: I_next = Round(I_current × 0.7)",
    WMS_FORMULA_GOOD: "Good: I_next = Round(I_current × 1.3 × F_importance)",
    WMS_FORMULA_EASY: "Easy: I_next = Round(I_current × 2.0 × F_importance)",
    WMS_FORMULA_MATH_PREFIX: "Where F_importance =",
    PRIORITY: "Priority",
    PRIORITY_DESC: "1=Most important (review frequently), 10=Least important (push far away)",
    PRIORITY_LABEL: "Note Priority",
    SET_PRIORITY: "Set Priority",
    CONVERT_TRACKED_TO_DECK: "Convert Tracked Notes to decks?",
    REVIEW_FLOATBAR: "Review Response FloatBar",
    REVIEW_FLOATBAR_DESC:
        "only working when autoNextNote is true. show it when reviewing note via click statusbar/sidebar/command.",
    REVIEW_NOTE_DIRECTLY: "Reviewing Note directly?",
    REVIEW_NOTE_DIRECTLY_DESC:
        "when reviewing note via click statusbar or command, open it directly without having to select a tag to open a note",
    INTERVAL_SHOWHIDE: "Display Next Review Interval",
    INTERVAL_SHOWHIDE_DESC: "whether to display next revivew iterval on the response buttons.",
    REQUEST_RETENTION: "Request_retention",
    REQUEST_RETENTION_DESC:
        "The probability (percentage) that you expect to recall the answer the next time you review",
    REVLOG_TAGS: "Tags for output review log",
    REVLOG_TAGS_DESC:
        "Tags for output review log, could be flashcards tags or/and notes tags(e.g. #review #flashcards #tag1), default empty means it output to the review log file normally without filtered by tags",

    FLASHCARD_AGAIN_LABEL: "Again Button Text",
    FLASHCARD_BLACKOUT_LABEL: "Blackout Button Text",
    FLASHCARD_INCORRECT_LABEL: "Incorrect Button Text",
    "FLASHCARD_INCORRECT (EASY)_LABEL": "Incorrect (Easy) Button Text",
    FLASHCARD_AGAIN_DESC: 'Customize the label for the "Again" Button',
    FLASHCARD_BLACKOUT_DESC: 'Customize the label for the "Blackout" Button',
    FLASHCARD_INCORRECT_DESC: 'Customize the label for the "Incorrect" Button',
    "FLASHCARD_INCORRECT (EASY)_DESC": 'Customize the label for the "Incorrect (Easy)" Button',
    UNTRACK_WITH_REVIEWTAG: "UntrackWithReviewTag",

    // sidebar.ts
    NOTES_REVIEW_QUEUE: "Tracked Notes",
    CLOSE: "Close",
    NEW: "New",
    YESTERDAY: "Yesterday",
    TODAY: "Today",
    TOMORROW: "Tomorrow",

    // stats-modal.tsx
    STATS_TITLE: "Statistics",
    MONTH: "Month",
    QUARTER: "Quarter",
    YEAR: "Year",
    LIFETIME: "Lifetime",
    FORECAST: "Forecast",
    FORECAST_DESC: "The number of cards due in the future",
    SCHEDULED: "Scheduled",
    DAYS: "Days",
    NUMBER_OF_CARDS: "Number of cards",
    REVIEWS_PER_DAY: "Average: ${avg} reviews/day",
    INTERVALS: "Intervals",
    INTERVALS_DESC: "Delays until reviews are shown again",
    COUNT: "Count",
    INTERVALS_SUMMARY: "Average interval: ${avg}, Longest interval: ${longest}",
    EASES: "Eases",
    EASES_SUMMARY: "Average ease: ${avgEase}",
    EASE: "Ease",
    CARD_TYPES: "Card Types",
    CARD_TYPES_DESC: "This includes buried cards as well, if any",
    CARD_TYPE_NEW: "New",
    CARD_TYPE_YOUNG: "Young",
    CARD_TYPE_MATURE: "Mature",
    CARD_TYPES_SUMMARY: "Total cards: ${totalCardsCount}",
    SEARCH: "Search",
    PREVIOUS: "Previous",
    NEXT: "Next",
    REVIEWED_TODAY: "Reviewed today",
    REVIEWED_TODAY_DESC: "counts of cards/notes you have reviewed today",
    NEW_LEARNED: "New Learned",
    DUE_REVIEWED: "due Reviewed",
    REVIEWED_TODAY_SUMMARY: "Total Reviewed today: ${totalreviewedCount}",
    DATE: "Date",

    // cardBlockIDSetting.ts
    CARD_BLOCK_ID: "Card Block ID",
    CARD_BLOCK_ID_DESC:
        "use Card Block ID instead of line number and text hash.<br>  <b>If set True, block id will append after card text. And block id will keep in note after reset to False again.</b>",
    CARD_BLOCK_ID_CONFIRM:
        "**If set True, block id will append after card text. And block id will keep in note after reset to False again. ** \n\nSuggestion： backup your vault before set True. Or try it in sandbox vault. \n\nAfter setting is turned on, blockid will be added after all cards. Even if it is turned off again, the added blockid will still remain in the note and will not be deleted.\n\nIt is recommended to **backup first** the note library, or try it in a sandbox library.",

    MIX_QUEUE: "Mix queue",
    MIX_QUEUE_DESC:
        "mix ondue and new notes when review. **first** slider for total count, second slider for ondue count. And new count is (total - ondue).",

    UNTRACK_WITH_REVIEWTAG_DESC:
        "When deleting the review tag in the note, synchronously untrack the operation, so that the note will no longer be reviewed<br><b>true</b>: synchronous untrack operation;<br><b>false</b>：After deleting the review tag, you need to untrack again before the note will no longer be reviewed. (same as previous version)",

    // dataLocation.ts
    DATA_LOCATION_PLUGIN_FOLDER: "In Plugin Folder",
    DATA_LOCATION_ROOT_FOLDER: "In Vault Folder",
    DATA_LOCATION_SPECIFIED_FOLDER: "In the folder specified below",
    DATA_LOCATION_SAVE_ON_NOTE_FILE: "Save On Note File",

    // fsrs.ts
    FSRS_ALGORITHM_DESC:
        'The algorithm used for spaced repetition. For more information see <a href="https://github.com/open-spaced-repetition/ts-fsrs">FSRS algorithm</a>.',
    FSRS_W_PARAM_DESC:
        'See <a href="https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm">FSRS V6 WIKI</a> and <a href="https://open-spaced-repetition.github.io/anki_fsrs_visualizer">FSRS w parameter visualization</a> to set various parameters.',

    ITEM_INFO_TITLE: "Item info of",
    CARDS_IN_NOTE: "Cards in this Note",
    SAVE_ITEM_INFO: "Save",
    SAVE_ITEM_INFO_TOOLTIP: "only save current note's item info",
    CLOSE_ITEM_INFO: "Close",
    LINE_NO: "LineNo:",
    NEXT_REVIEW: "nextReivew:",
    NEW_CARD: "NewCard",
    ITEM_DATA_INFO: "Item.data info",

    DATA_LOCATION_WARNING_TO_NOTE:
        "BE CAREFUL!!!\n  if you confirm this, it will convert all your scheduling informations in `tracked_files.json` to note, which will change lots of your note file in the same time.\n Please make sure the setting tags of flashcards and notes is what you are using.",
    DATA_LOCATION_WARNING_TO_TRACKED:
        "BE CAREFUL!!! \n if you confirm this, it will converte all your scheduling informations on note(which will be deleted in the same time) TO `tracked_files.json`.",

    POST_ISSUE_MODIFIED_PLUGIN:
        'Post an <a href="${issue_url}">issue</a> if you find a settings-specific Syro bug.',

    // donation.ts
    DONATION_TEXT: "Syro is under active development. Feedback and bug reports are welcome.",

    FOLDER_PLACEHOLDER: "Example: folder1/folder2",
    SAVE_BUTTON: "Save",
    LOCATION_CHANGE_FINISHED: "Finished location change.",

    // commands.ts
    CMD_ITEM_INFO: "Item Info",
    CMD_TRACK_NOTE: "Track Note",
    CMD_UNTRACK_NOTE: "Untrack Note",
    CMD_POSTPONE_CARDS: "Postpone cards",
    CMD_POSTPONE_NOTES: "Postpone notes",
    CMD_POSTPONE_ALL: "Postpone All",
    CMD_POSTPONE_NOTE_MANUAL: "Postpone this note after x days",
    CMD_POSTPONE_CARDS_MANUAL: "Postpone cards in this note after x days",
    CMD_BUILD_QUEUE: "Build Queue",
    CMD_REVIEW: "Review",
    CMD_PRINT_VIEW_STATE: "Print View State",
    CMD_PRINT_EPHEMERAL_STATE: "Print Ephemeral State",
    CMD_CLEAR_QUEUE: "Clear Queue",
    CMD_QUEUE_ALL: "Queue All",
    CMD_PRINT_DATA: "Print Data",
    CMD_UPDATE_ITEMS: "Update Items",
    CMD_INPUT_POSITIVE_NUMBER: "please input positive number",
    CMD_NOTE_POSTPONED: "This note has been postponed ${days} days",
    CMD_GLOBAL_SYNC_CARDS: "Repair tracked cards (Clean ghost cards)",
    CMD_CREATE_EXTRACT_FROM_SELECTION: "Create extract from selection",
    CMD_CREATE_CLOZE_SAME_LEVEL: "Create Cloze (Same Level)",
    CMD_CREATE_CLOZE_NEW_LEVEL: "Create Cloze (New Level)",

    // trackFileEvents.ts
    MENU_TRACK_ALL_NOTES: "Track All Notes",
    MENU_UNTRACK_ALL_NOTES: "Untrack All Notes",
    MENU_FOLDER_TRACKING_SETTINGS: "Folder Tracking Settings",
    MENU_TRACK_NOTE: "Track Note",
    MENU_UNTRACK_NOTE: "Untrack Note",
    AUTO_EXTRACT_MENU_TITLE: "Smart slice full note",
    AUTO_EXTRACT_BY_HEADING_LEVEL: "Slice by H${level} headings",
    AUTO_EXTRACT_BY_PARAGRAPH: "Slice by paragraphs",
    AUTO_EXTRACT_DISABLE: "Disable smart slicing",
    AUTO_EXTRACT_RULE_ENABLED: "Smart slicing enabled",
    AUTO_EXTRACT_RULE_DISABLED: "Smart slicing disabled",

    // data.ts
    DATA_TAGGED_FILE_CANT_UNTRACK:
        "it is taged file, can't untrack by this. You can delete the #review tag in note file.",
    DATA_UNTRACKED_ITEMS: "Untracked ${numItems} items${nulrstr}",
    DATA_UNABLE_TO_SAVE: "Unable to save data file!",
    DATA_FOLDER_UNTRACKED:
        "In folder ${folderPath}, ${totalRemoved} files are no longer tracked for repetition",
    DATA_ADDED_REMOVED_ITEMS: "Added ${totalAdded} new items, removed ${totalRemoved} items.",
    DATA_ADDED_REMOVED_ITEMS_SHORT: "Added ${added} new items, removed ${removed} items.",
    DATA_FILE_UPDATE:
        "${filePath} update - lineNo: ${lineNo}\nAdded: ${added} new card items, removed ${removed} card items.",
    DATA_ALL_ITEMS_UPDATED: "all items have been updated.",

    // reviewView.ts
    NEXT_REVIEW_MINUTES: "You can review in ${interval}m",
    NEXT_REVIEW_HOURS: "You can review in ${interval}h",

    DATA_FILE_MOVED_SUCCESS: "Successfully moved data file!",
    DATA_FILE_DELETE_OLD_FAILED: "Unable to delete old data file, please delete it manually.",
    DATA_FILE_MOVE_FAILED: "Unable to move data file!",
    DATA_LOST_WARNING: "have some data lost, see console for details.",
    // LinearCard.tsx
    UI_EXIT_EDIT_MODE: "Exited edit mode",
    UI_ENTER_EDIT_MODE: "Entered edit mode",
    UI_UNDO_LAST_ACTION: "Undid last action",
    UI_OPEN_IN_OBSIDIAN: "Opened in Obsidian",
    UI_CARD_POSTPONED: "Card postponed 1 day",
    UI_CARD_DELETED: "Card deleted",
    UI_RESET: "Reset",
    UI_HARD: "Hard",
    UI_GOOD: "Good",
    UI_EASY: "Easy",
    UI_OPEN_FILE_LOCATION: "Open file location",
    UI_UNDO: "Undo",
    UI_OPEN_LOCATION: "Open location",
    UI_CARD_INFO: "Card info",
    UI_POSTPONE_ONE_DAY: "Postpone 1 day",
    UI_DELETE_CARD: "Delete card",
    UI_EDIT_MODE: "Edit Mode",
    UI_BOLD_KEY_HINT: "Ctrl+B Bold",
    UI_BACK: "Back",
    UI_DECK_OPTIONS: "Deck options",
    // ReactNoteReviewView.tsx - Sidebar context menus
    SIDEBAR_IGNORE_TAG: "Ignore tag",
    SIDEBAR_TAG_IGNORED: "Tag #${tag} ignored",
    SIDEBAR_TAG_EXISTS: "Tag #${tag} already exists",
    SIDEBAR_TAG_ADDED: "Tag #${tag} added",
    SIDEBAR_TAG_ADD_FAILED: "Failed to add tag",
    SIDEBAR_NOTE_DATA_NOT_FOUND: "Note data not found",
    SIDEBAR_PRIORITY_CHANGE_FAILED: "Failed to change priority",
    SIDEBAR_EDIT_COMMIT: "Edit this record",
    SIDEBAR_DELETE_COMMIT: "Delete this record",
    SIDEBAR_COMMIT_DELETED: "Commit record deleted",
    SIDEBAR_OVERDUE_DAYS: "Overdue ${days} days",
    SIDEBAR_TODAY: "Today",
    SIDEBAR_IN_DAYS: "In ${days} days",
    // CardDebugModal.tsx
    DEBUG_TITLE: "Card Debug Info",
    DEBUG_SECTION_IDENTITY: "Basic Info",
    DEBUG_SECTION_STATS: "Statistics",
    DEBUG_SECTION_ALGO: "Algorithm Data (FSRS)",
    DEBUG_SECTION_RAW: "Raw Data",
    DEBUG_ITEM_TYPE: "Type",
    DEBUG_FILE_ID: "File ID",
    DEBUG_DECK_NAME: "Deck",
    DEBUG_PRIORITY: "Priority",
    DEBUG_REVIEWED: "Reviewed",
    DEBUG_CORRECT: "Correct",
    DEBUG_STREAK: "Error Streak",
    DEBUG_NEXT_REVIEW: "Next Review",
    DEBUG_STABILITY: "Stability",
    DEBUG_DIFFICULTY: "Difficulty",
    DEBUG_REPS: "Reps",
    DEBUG_LAPSES: "Lapses",
    DEBUG_STATE: "State",
    DEBUG_ELAPSED_DAYS: "Elapsed Days",
    DEBUG_DAYS_SUFFIX: "days",
    DEBUG_WARNING: "Changing algorithm parameters may affect scheduling.",
    DEBUG_BUTTON_SAVE: "Save Changes",
    // ClozeManageModal.tsx
    CLOZE_MANAGE_TITLE: "Split or Merge Cloze",
    CLOZE_MANAGE_SUBTITLE: "Split or Merge Cloze",
    CLOZE_MANAGE_DESC:
        "Splitting two clozes creates multiple cards. Merging two clozes creates one card.",
    CLOZE_TO_MERGE: "Cloze to merge",
    CLOZE_SPLIT: "Split cloze",
    CLOZE_SPLIT_TOOLTIP: "Split to new group",
    CLOZE_MERGE_WITH: "Merge with...",
    CLOZE_CUSTOMIZE: "Customize Cloze Cards for this Rem",
    CLOZE_HIDE_ALL: "Hide all, test one by one (Alt+T)",
    CLOZE_RESET_SEQ: "Reset sequence",
    CLOZE_MERGE_ALL: "Merge all clozes",
    // ClozePopover.tsx
    CLOZE_SPLIT_THIS_PART: "Split this part",
    CLOZE_MERGE_WITH_ID: "Merge with c${id}",
    CLOZE_CURRENT_SELECTION: "Current selection",
    CLOZE_MERGE_TO_OTHER: "Merge to other group",
    CLOZE_MERGE_ALL_SHORT: "Merge All",
    // NoteReviewSidebar.tsx
    SORT_AZ: "A-Z Sort",
    SORT_FREQUENCY: "Frequency Sort",
    SORT_CUSTOM: "Custom Sort",
    FILTER_PLACEHOLDER: "Filter...",
    DROP_TO_OPEN_MENU: "Release to open menu",
    DRAG_UP_FOR_MENU: "↑ Menu",
    TIME_JUST_NOW: "Just now",
    TIME_MINUTES_AGO: "${minutes}m ago",
    TIME_HOURS_AGO: "${hours}h ago",
    TIME_DAYS_AGO: "${days}d ago",
    TIME_WEEKS_AGO: "${weeks}w ago",
    TIMELINE_SELECT_NOTE: "Select a note to view timeline",
    TIMELINE_INPUT_PLACEHOLDER: "Commit review log and record cursor position",
    TIMELINE_NO_HISTORY: "No history",
    TIMELINE_EDITED_AT: "edited at",
    TIMELINE_REVIEW_RESET: "Reset",
    TIMELINE_REVIEW_HARD: "Hard",
    TIMELINE_REVIEW_GOOD: "Good",
    TIMELINE_REVIEW_EASY: "Easy",
    SECTION_NEW_NOTES: "NEW NOTES",
    SECTION_OVERDUE_1_DAY: "1 DAY OVERDUE",
    SECTION_OVERDUE_DAYS: "${days} DAYS OVERDUE",
    SECTION_DUE_TODAY: "DUE TODAY",
    SECTION_DUE_TOMORROW: "IN 1 DAY",
    SECTION_DUE_FUTURE: "IN ${days} DAYS",
    // NoteReviewAdapter
    ADAPTER_DAYS_OVERDUE: "Overdue ${days} days",
    ADAPTER_TODAY: "Today",
    ADAPTER_TOMORROW: "Tomorrow",
    ADAPTER_DAYS_FUTURE: "In ${days} days",
    // DeckTree.tsx
    DECK_TREE_HEADER_DECK: "Deck",
    DECK_TREE_HEADER_NEW: "NEW",
    DECK_TREE_HEADER_LEARN: "LEARN",
    DECK_TREE_HEADER_DUE: "DUE",
    DECK_TREE_OPTIONS_TITLE: "Deck Options",
    // ReviewSession.tsx
    REVIEW_NO_CARDS: "No cards to review in this deck",
    REVIEW_NO_UNDO: "Nothing to undo",
    REVIEW_POSTPONED: "Card postponed for 1 day",
    // EmbeddedSettingsPanel.tsx
    SETTINGS_TAB_FLASHCARDS: "Flashcards",
    SETTINGS_TAB_NOTES: "Incremental Reading",
    SETTINGS_TAB_ALGORITHM: "Algorithm",
    SETTINGS_TAB_INTERFACE: "Interface",
    SETTINGS_TAB_PARSING: "Parsing",
    SETTINGS_TAB_SYNC: "Sync",
    SETTINGS_TAB_LICENSE: "License",
    SETTINGS_SECTION_BEHAVIOR: "Behavior",
    SETTINGS_CARD_ORDER: "Card Order",
    SETTINGS_CARD_ORDER_DESC: "Sort order within a deck during review.",
    SETTINGS_SECTION_DATA_UPDATE: "Data Updates",
    SETTINGS_NOTE_CACHE_PERSISTENCE: "Persist Parse Cache",
    SETTINGS_NOTE_CACHE_PERSISTENCE_DESC:
        "Store parsed notes in note_cache.json so unchanged files can be reused after restart.",
    SETTINGS_SYNC_PROGRESS_DISPLAY: "Update Progress Tip",
    SETTINGS_SYNC_PROGRESS_DISPLAY_DESC:
        "Control when the top-right update progress tip is shown while refreshing vault data.",
    SETTINGS_SYNC_PROGRESS_DISPLAY_ALWAYS: "Always",
    SETTINGS_SYNC_PROGRESS_DISPLAY_FULL_ONLY: "Only on Full Rebuild",
    SETTINGS_SYNC_PROGRESS_DISPLAY_NEVER: "Never",
    SETTINGS_CARD_CAPTURE_REBUILD_CONFIRM:
        '**Card capture rules changed.** Run "Rebuild all cards" to reparse every note with the new capture rules.\n\nRebuild all cards now?',
    SETTINGS_CARD_CAPTURE_REBUILD_QUEUED:
        "A sync is already running. Full rebuild has been queued and will start automatically when the current sync finishes.",
    SETTINGS_SECTION_SYNC: "Sync",
    SETTINGS_AUTO_INCREMENTAL_SYNC: "Automatic Incremental Parsing",
    SETTINGS_AUTO_INCREMENTAL_SYNC_DESC:
        "When disabled, file changes, review entry, and background polling will not automatically reparse changed content. Manual updates still work, and startup initialization or rebuilds stay enabled.",
    SYRO_RECOVERY_BASELINE_TITLE: "Syro needs a baseline before syncing",
    SYRO_RECOVERY_BASELINE_DESC:
        "This device has not joined the current sync set yet. Choose a source device and name this device to build a baseline snapshot.",
    SYRO_RECOVERY_REBUILD_TITLE: "Syro needs to rebuild this device",
    SYRO_RECOVERY_REBUILD_DESC:
        "This device has fallen outside the active sync window. Instead of replaying old history, choose a source device and rebuild from the latest baseline.",
    SYRO_RECOVERY_DEVICE_NAME: "Current device name",
    SYRO_RECOVERY_SOURCE_DEVICE: "Source device",
    SYRO_SELECT_CURRENT_DEVICE_TITLE: "Choose the current device",
    SYRO_SELECT_CURRENT_DEVICE_DESC:
        "This installation has no device binding that can be confirmed automatically. Use an existing device only if this installation previously belonged to that device and the local identity was lost; otherwise create a new device from a baseline.",
    SYRO_SELECT_CURRENT_DEVICE_USE: "Use this device",
    SYRO_SELECT_CURRENT_DEVICE_CREATE_NEW: "Create new device",
    SYRO_SELECT_CURRENT_DEVICE_FOLDER: "Device folder",
    SYRO_SELECT_CURRENT_DEVICE_LAST_SEEN: "Last seen",
    SYRO_DELETE_INVALID_DEVICE_TITLE: "Delete invalid device directory",
    SYRO_DELETE_INVALID_DEVICE_DESC:
        "You are about to delete the invalid device directory `${folder}`. This may permanently remove files inside that directory, so confirm only if you understand the risk.",
    SYRO_DELETE_INVALID_DEVICE_CONFIRM_LABEL: "Delete confirmation",
    SYRO_DELETE_INVALID_DEVICE_CONFIRM_DESC:
        "Enter the exact phrase below before deletion is enabled: ${phrase}",
    SYRO_DELETE_INVALID_DEVICE_PHRASE: "I understand the risks and want to delete",
    SYRO_DELETE_INVALID_DEVICE_BUTTON: "Delete invalid directory",
    NOTICE_SYRO_READ_ONLY: "Syro sync data is inconsistent. Read-only protection is now enabled.",
    NOTICE_SYRO_DATA_NOT_READY:
        "Syro data is not ready yet. Finish device recovery or device selection first.",
    NOTICE_SYRO_RECOVERY_NOT_NEEDED: "There is no pending Syro recovery action right now.",
    NOTICE_SYRO_RECOVERY_CANCELLED:
        "Syro recovery was cancelled. Read-only protection remains active.",
    NOTICE_SYRO_DEVICE_SELECTED: "The current Syro device has been switched.",
    NOTICE_SYRO_DEVICE_RENAMED: "The current Syro device name has been updated.",
    NOTICE_SYRO_DEVICE_PULLED: "The selected device snapshot has replaced the current device data.",
    NOTICE_SYRO_INVALID_DEVICE_DELETED: "The invalid device directory has been deleted.",
    NOTICE_SYRO_VALID_DEVICE_DELETED:
        "The device snapshot and its session history have been deleted.",
    SYRO_PULL_TO_CURRENT_CONFIRM:
        "Use the snapshot from `${source}` to **overwrite the current device** `${current}`? Local unsynced data on this device will be replaced.",
    SYRO_DELETE_VALID_DEVICE_CONFIRM:
        "Delete the device ${device} together with its stored session history? This only removes that device copy and cannot be undone.",
    SYRO_DELETE_VALID_DEVICE_TITLE: "Delete device",
    SYRO_DELETE_VALID_DEVICE_CONFIRM_LABEL: "Type the confirmation phrase",
    SYRO_DELETE_VALID_DEVICE_CONFIRM_DESC: 'Type "${phrase}" to confirm deletion.',
    SYRO_DELETE_VALID_DEVICE_PHRASE: "I understand the risks and want to delete",
    SYRO_DELETE_VALID_DEVICE_BUTTON: "Delete device",
    SETTINGS_SYNC_DEVICE_MANAGEMENT: "Device Management",
    SETTINGS_SYNC_CURRENT_DEVICE: "Current Device",
    SETTINGS_SYNC_DEVICE_LIST: "Valid Devices",
    SETTINGS_SYNC_INVALID_DEVICE_DIRS: "Invalid Directories",
    SETTINGS_SYNC_DEVICE_LOADING: "Loading device information...",
    SETTINGS_SYNC_DEVICE_LOAD_ERROR: "Unable to load device information.",
    SETTINGS_SYNC_MULTI_DEVICE_TITLE: "Multi-device incremental sync",
    SETTINGS_SYNC_MULTI_DEVICE_DESC:
        'By isolating device identities, this mechanism prevents plugin data conflicts during multi-device sync and uses recorded sessions to incrementally sync data changes across devices. Before running "pull overwrite", "rebuild", or "delete", ',
    SETTINGS_SYNC_MULTI_DEVICE_BACKUP_EMPHASIS: "manually back up the plugin files",
    SETTINGS_SYNC_MULTI_DEVICE_BACKUP_SUFFIX: ".",
    SETTINGS_SYNC_NO_CURRENT_DEVICE: "There is no claimed current device.",
    SETTINGS_SYNC_OPEN_RECOVERY: "Open Sync Recovery",
    SETTINGS_SYNC_OPEN_RECOVERY_DESC: "Reopen the pending Syro recovery or device selection flow.",
    SETTINGS_SYNC_OPEN_RECOVERY_TOOLTIP:
        "Manually reopen the guided flow for device recovery, baseline setup, or rebuild after an abnormal state.",
    SETTINGS_SYNC_RENAME_CURRENT_DEVICE: "Rename Current Device",
    SETTINGS_SYNC_RENAME_CURRENT_DEVICE_DESC:
        "Only updates the current device display name and folder name. The deviceId stays unchanged.",
    SETTINGS_SYNC_SAVE_DEVICE_NAME: "Save device name",
    SETTINGS_SYNC_SET_CURRENT_DEVICE: "Set as current device",
    SETTINGS_SYNC_CURRENT_DEVICE_BADGE: "Current",
    SETTINGS_SYNC_THIS_DEVICE: "Current device",
    SETTINGS_SYNC_THIS_DEVICE_TOOLTIP:
        "The independent device identity bound to this installation. Multi-device sync uses it to isolate writes from different devices.",
    SETTINGS_SYNC_OTHER_DEVICES: "Other devices",
    SETTINGS_SYNC_OTHER_DEVICES_TOOLTIP:
        "Other valid devices participating in sync. They can be used as a source for baseline setup or pull-to-overwrite.",
    SETTINGS_SYNC_INVALID_DEVICES: "Invalid devices",
    SETTINGS_SYNC_INVALID_DEVICES_TOOLTIP:
        "Device directories with missing or damaged metadata. The system will not treat them as normal sync sources.",
    SETTINGS_SYNC_DEVICE_NEVER: "Never",
    SETTINGS_SYNC_DEVICE_ID: "Device ID",
    SETTINGS_SYNC_SHORT_DEVICE_ID: "Short ID",
    SETTINGS_SYNC_DEVICE_FOLDER: "Device folder",
    SETTINGS_SYNC_DEVICE_SIZE: "Storage",
    SETTINGS_SYNC_DEVICE_LAST_SEEN: "Last seen",
    SETTINGS_SYNC_DEVICE_REVIEW_COUNT: "Device reviews",
    SETTINGS_SYNC_DEVICE_LATEST_SESSION: "Latest session",
    SETTINGS_SYNC_DEVICE_LAST_PULL: "Last pulled",
    SETTINGS_SYNC_DEVICE_INACTIVE_DAYS: "Idle time",
    SETTINGS_SYNC_DEVICE_INACTIVE_DAYS_VALUE: "${days}d idle",
    SETTINGS_SYNC_DEVICE_STATUS_NEEDS_SYNC: "Needs sync",
    SETTINGS_SYNC_DEVICE_STATUS_IDLE: "Idle",
    SETTINGS_SYNC_DEVICE_STATUS_NO_SESSION: "No session",
    SETTINGS_SYNC_DEVICE_STATUS_UP_TO_DATE: "Up to date",
    SETTINGS_SYNC_INLINE_RENAME: "Rename device",
    SETTINGS_SYNC_CANCEL_RENAME: "Cancel rename",
    SETTINGS_SYNC_PULL_TO_CURRENT: "Pull this device data (overwrites current review progress)",
    SETTINGS_SYNC_DELETE_DEVICE: "Delete device",
    SETTINGS_SYNC_INVALID_DEVICE_BADGE: "Invalid",
    SETTINGS_SYNC_INVALID_DEVICE_REASON: "Reason",
    SETTINGS_SYNC_INVALID_DEVICE_FILES: "Directory contents",
    SETTINGS_SYNC_INVALID_DEVICE_EMPTY: "There are no invalid device directories.",
    SETTINGS_SYNC_VALID_DEVICE_EMPTY: "There are no other valid devices.",
    SETTINGS_SYNC_DELETE_INVALID_DEVICE: "Delete invalid directory",
    SETTINGS_SYNC_INVALID_REASON_MISSING_DEVICE_JSON: "Missing device.json",
    SETTINGS_SYNC_INVALID_REASON_INVALID_DEVICE_JSON: "device.json schema is invalid",
    SETTINGS_SYNC_INVALID_REASON_UNREADABLE_DEVICE_JSON: "device.json could not be read reliably",
    SETTINGS_OPT_DUE_FIRST_SEQUENTIAL: "Due first, then New (Sequential)",
    SETTINGS_OPT_DUE_FIRST_RANDOM: "Due first, then New (Random)",
    SETTINGS_OPT_NEW_FIRST_SEQUENTIAL: "New first, then Due (Sequential)",
    SETTINGS_OPT_NEW_FIRST_RANDOM: "New first, then Due (Random)",
    SETTINGS_SECTION_CLOZE: "Cloze Conversion",
    SETTINGS_HIGHLIGHT_TO_CLOZE: "Highlight to Cloze",
    SETTINGS_HIGHLIGHT_TO_CLOZE_DESC: "Convert ==highlights== to clozes.",
    SETTINGS_BOLD_TO_CLOZE: "Bold to Cloze",
    SETTINGS_BOLD_TO_CLOZE_DESC: "Convert **bold text** to clozes.",
    SETTINGS_CURLY_TO_CLOZE: "Curly Brackets",
    SETTINGS_CURLY_TO_CLOZE_DESC: "Convert {{curly brackets}} to clozes.",
    SETTINGS_ANKI_CLOZE: "Anki Cloze",
    SETTINGS_ANKI_CLOZE_DESC: "Convert {{c1::...}} to clozes.",
    SETTINGS_CODE_CLOZE: "Code Block Cloze",
    SETTINGS_CODE_CLOZE_DESC: "Parse {{c1::...}} in code blocks as cloze cards.",
    SETTINGS_CODE_CONTEXT_LINES: "Code Context Lines",
    SETTINGS_CODE_CONTEXT_LINES_DESC:
        "When generating cards, keep this many lines of code above and below the cloze to avoid overly long cards.",
    SETTINGS_CLOZE_CONTEXT_MODE: "Cloze Context Range",
    SETTINGS_CLOZE_CONTEXT_MODE_TOOLTIP: "Choose how much review context to show.",
    SETTINGS_CLOZE_CONTEXT_SINGLE: "Single Segment",
    SETTINGS_CLOZE_CONTEXT_SINGLE_DESC:
        "Only show the current paragraph separated by one blank line. This affects display only; same-number Anki clozes still link only within the current line.",
    SETTINGS_CLOZE_CONTEXT_DOUBLE_BREAK: "Enhanced Segment",
    SETTINGS_CLOZE_CONTEXT_DOUBLE_BREAK_DESC:
        "Keep a larger block and stop only at two consecutive blank lines. This affects display only; same-number Anki clozes still link only within the current line.",
    SETTINGS_CLOZE_CONTEXT_EXPANDED: "Expanded",
    SETTINGS_CLOZE_CONTEXT_EXPANDED_DESC:
        "Show the current paragraph plus the previous and next paragraphs. This affects display only; same-number Anki clozes still link only within the current line.",
    SETTINGS_CLOZE_CONTEXT_FULL: "Full Note (Not Recommended)",
    SETTINGS_CLOZE_CONTEXT_FULL_DESC:
        "Show the full note during review. This may be slow for long notes, and it does not make same-number Anki clozes on other lines link together.",
    SETTINGS_CLOZE_CONTEXT_PERFORMANCE: "Long Context Optimization",
    SETTINGS_CLOZE_CONTEXT_PERFORMANCE_TOOLTIP: "Safely trim long context to reduce lag.",
    SETTINGS_CLOZE_CONTEXT_PERFORMANCE_DESC:
        "Trim very long context during review to reduce rendering pressure.",
    SETTINGS_CLOZE_CONTEXT_PERFORMANCE_OFF: "Off",
    SETTINGS_CLOZE_CONTEXT_PERFORMANCE_SAFE_TRIM: "Safe Trim",
    SETTINGS_CLOZE_CONTEXT_SOFT_LIMIT: "Trim Lines",
    SETTINGS_CLOZE_CONTEXT_SOFT_LIMIT_TOOLTIP: "Base lines kept above and below the cloze.",
    SETTINGS_CLOZE_CONTEXT_SOFT_LIMIT_DESC:
        "How many lines to keep above and below the cloze when safe trim is enabled. Range: 1-100.",
    SETTINGS_SHOW_OTHER_CLOZES: "Show Other Clozes",
    SETTINGS_SHOW_OTHER_CLOZES_DESC: "Show other clozes visually during review.",
    SETTINGS_SHOW_OTHER_ANKI_CLOZES: "Show Other Anki Clozes",
    SETTINGS_SHOW_OTHER_ANKI_CLOZES_DESC:
        "Keep visual styling for non-current Anki clozes during review.",
    SETTINGS_SHOW_OTHER_HIGHLIGHT_CLOZES: "Show Other Highlight Clozes",
    SETTINGS_SHOW_OTHER_HIGHLIGHT_CLOZES_DESC:
        "Keep highlight styling for non-current highlight clozes during review.",
    SETTINGS_SHOW_OTHER_BOLD_CLOZES: "Show Other Bold Clozes",
    SETTINGS_SHOW_OTHER_BOLD_CLOZES_DESC:
        "Keep bold styling for non-current bold clozes during review.",
    SETTINGS_SECTION_SEPARATORS: "Separators",
    SETTINGS_INLINE_SEPARATOR: "Inline Separator",
    SETTINGS_MULTILINE_SEPARATOR: "Multiline Separator",
    // Phase 2
    SETTINGS_SECTION_IGNORED_TAGS: "Ignored Tags",
    SETTINGS_IGNORED_TAGS_DESC:
        "One tag per line (including #). Right-click sidebar tags to quick add.",
    SETTINGS_SECTION_SIDEBAR: "Sidebar",
    SETTINGS_HIDE_FILTER_BAR: "Hide Filter Bar Header",
    SETTINGS_HIDE_FILTER_BAR_DESC:
        "Hide header (search, sort). Forces custom tag sort when hidden.",
    SETTINGS_SHOW_SIDEBAR_PROGRESS_INDICATOR: "Show Sidebar Progress Indicator",
    SETTINGS_SHOW_SIDEBAR_PROGRESS_INDICATOR_DESC:
        "Show or hide the progress indicator on review queue sidebar note items.",
    SETTINGS_SIDEBAR_PROGRESS_INDICATOR: "Sidebar Progress Indicator",
    SETTINGS_SIDEBAR_PROGRESS_INDICATOR_DESC:
        "Choose whether visible review queue note items use a progress ring or a percentage label.",
    SETTINGS_SIDEBAR_PROGRESS_INDICATOR_RING: "Ring",
    SETTINGS_SIDEBAR_PROGRESS_INDICATOR_PERCENTAGE: "Percentage",
    SETTINGS_SIDEBAR_PROGRESS_RING_COLOR: "Sidebar Progress Indicator Color",
    SETTINGS_SIDEBAR_PROGRESS_RING_COLOR_DESC:
        "Color used for the saved reading progress indicator in the review queue sidebar, including the ring and percentage text. 0% in ring mode stays hollow.",
    SETTINGS_SIDEBAR_PROGRESS_RING_DIRECTION: "Sidebar Progress Ring Direction",
    SETTINGS_SIDEBAR_PROGRESS_RING_DIRECTION_DESC:
        "Choose whether the progress ring grows clockwise from the top toward the right or counterclockwise toward the left.",
    SETTINGS_SIDEBAR_PROGRESS_RING_DIRECTION_CLOCKWISE: "Clockwise (Right)",
    SETTINGS_SIDEBAR_PROGRESS_RING_DIRECTION_COUNTERCLOCKWISE: "Counterclockwise (Left)",
    SETTINGS_SIDEBAR_FILE_PATH_TOOLTIP: "Show File Path Tooltip",
    SETTINGS_SIDEBAR_FILE_PATH_TOOLTIP_DESC:
        "Show the note's vault-relative file path in a tooltip above the sidebar item.",
    SETTINGS_SIDEBAR_FILE_PATH_TOOLTIP_DELAY: "File Path Tooltip Delay (ms)",
    SETTINGS_SIDEBAR_FILE_PATH_TOOLTIP_DELAY_DESC:
        "How long to hover before showing the file path tooltip. 0 shows it immediately.",
    SETTINGS_SECTION_TIMELINE: "Timeline",
    SETTINGS_LAB_BADGE: "LAB",
    SETTINGS_LAB_BADGE_ARIA: "Experimental feature",
    SETTINGS_TIMELINE_SCROLL: "Show Scroll Percentage",
    SETTINGS_TIMELINE_SCROLL_DESC: "Show reading progress percentage in timeline items.",
    SETTINGS_TIMELINE_AUTO_EXPAND: "Auto Follow Current Note",
    SETTINGS_TIMELINE_AUTO_EXPAND_DESC:
        "When the sidebar opens or the main editor switches notes, automatically locate the current note in the queue and open its timeline.",
    SETTINGS_TIMELINE_ALLOW_UNTRACKED_NOTES: "Allow Timeline For Untracked Notes",
    SETTINGS_TIMELINE_ALLOW_UNTRACKED_NOTES_DESC:
        "Let the sidebar Timeline follow and log the current markdown note even when it is not in the review queue.",
    SETTINGS_TIMELINE_AUTO_FOLLOW_REVIEW_CARD: "Follow Current Review Card Note",
    SETTINGS_TIMELINE_AUTO_FOLLOW_REVIEW_CARD_DESC:
        "While reviewing flashcards, automatically switch Timeline to the source note of the current card.",
    SETTINGS_TIMELINE_AUTO_COMMIT_REVIEW: "Auto Log Review Selection",
    SETTINGS_TIMELINE_AUTO_COMMIT_REVIEW_DESC:
        "Automatically write the selected note review option into Timeline after a successful review.",
    SETTINGS_TIMELINE_ENABLE_DURATION_PREFIX: "Enable Duration Prefix Syntax",
    SETTINGS_TIMELINE_ENABLE_DURATION_PREFIX_DESC:
        "Enable parsing and rendering of leading duration syntax like 2d:: or 1mo20d:: in Timeline.",
    SETTINGS_SECTION_EXTRACTS: "Extracts",
    SETTINGS_ENABLE_EXTRACTS: "Enable Extracts",
    SETTINGS_ENABLE_EXTRACTS_DESC:
        "Allow {{ir::...}} incremental reading extracts and include them in card review sessions.",
    SETTINGS_MAX_NEW_EXTRACTS: "New Extracts/Day",
    SETTINGS_MAX_NEW_EXTRACTS_DESC:
        "Maximum number of newly created extracts to introduce per day.",
    SETTINGS_MAX_EXTRACT_REVIEWS: "Extract Reviews/Day",
    SETTINGS_MAX_EXTRACT_REVIEWS_DESC: "Maximum number of due extract reviews to show per day.",
    SETTINGS_SECTION_GENERAL: "General",
    SETTINGS_SHOW_STATUS_BAR: "Show Status Bar",
    SETTINGS_SHOW_STATUS_BAR_DESC: "Display review stats in the status bar.",
    SETTINGS_SECTION_STATUS_BAR_ANIM: "Status Bar Animation",
    SETTINGS_SHOW_DUE_NOTIF: "Show Due Notification",
    SETTINGS_SHOW_DUE_NOTIF_DESC: "Enable status bar due notification (color & animation).",
    SETTINGS_NOTE_DUE_COLOR: "Note Due Color",
    SETTINGS_NOTE_DUE_COLOR_DESC: "Status bar text color when notes are due.",
    SETTINGS_NOTE_ANIM: "Note Animation",
    SETTINGS_NOTE_ANIM_DESC: "Animation effect when notes are due.",
    SETTINGS_OPT_NO_ANIM: "None",
    SETTINGS_OPT_BREATHING: "Breathing",
    SETTINGS_NOTE_PERIOD: "Note Period",
    SETTINGS_NOTE_PERIOD_DESC: "Note animation period (seconds).",
    SETTINGS_CARD_DUE_COLOR: "Card Due Color",
    SETTINGS_CARD_DUE_COLOR_DESC: "Status bar text color when cards are due.",
    SETTINGS_CARD_ANIM: "Card Animation",
    SETTINGS_CARD_ANIM_DESC: "Animation effect when cards are due.",
    SETTINGS_CARD_PERIOD: "Card Period",
    SETTINGS_CARD_PERIOD_DESC: "Card animation period (seconds).",
    SETTINGS_SECTION_PROGRESS_BAR: "Progress Bar Style",
    SETTINGS_PROGRESS_BAR_COLOR: "Bar Color",
    SETTINGS_PROGRESS_BAR_COLOR_DESC:
        "Applied to review countdown bars. Toggle bar visibility in deck options.",
    SETTINGS_PROGRESS_WARNING_COLOR: "Warning Color",
    SETTINGS_PROGRESS_WARNING_COLOR_DESC:
        "Used when less than 30% time remains on a visible review countdown bar.",
    SETTINGS_PROGRESS_RTL: "Right to Left Animation",
    SETTINGS_PROGRESS_RTL_DESC:
        "Changes the fill direction for visible review countdown bars. Visibility is controlled in deck options.",

    // Debug & Advanced
    SETTINGS_SECTION_DEBUG: "Advanced & Debug",
    SETTINGS_RUNTIME_DEBUG_MESSAGES: "Debug Console Output",
    SETTINGS_RUNTIME_DEBUG_MESSAGES_DESC:
        "Show runtime debug logs in the developer console for sync flow, deck tree refreshes, and review session state changes.",

    // Phase 3
    SETTINGS_SECTION_SUPPORTER: "Supporter",
    SETTINGS_SUPPORTER_DESC_PRO: "Supporter access is enabled on this device.",
    SETTINGS_SUPPORTER_DESC_FREE:
        "Syro will always provide 90% of core features for free.\nActivating a License Key supports plugin development and unlocks additional features.",
    SETTINGS_SECTION_LICENSE: "License",
    SETTINGS_LICENSE_KEY: "License Key",
    SETTINGS_LICENSE_KEY_DESC: "Enter your key to activate supporter status.",
    SETTINGS_LICENSE_PLACEHOLDER: "XXXX-XXXX-XXXX-XXXX",
    SETTINGS_VERIFY: "Verify",
    SETTINGS_VERIFY_DESC: "Connect to server to verify license.",
    SETTINGS_BTN_VERIFYING: "Verifying...",
    SETTINGS_BTN_ACTIVATE: "Activate",
    SETTINGS_DEACTIVATE_LICENSE: "Deactivate License",
    SETTINGS_DEACTIVATE_LICENSE_DESC: "You can deactivate it here at any time.",
    SETTINGS_BTN_DEACTIVATE: "Deactivate",
    SETTINGS_MSG_ENTER_KEY: "Please enter a license key.",
    SETTINGS_MSG_VERIFY_SUCCESS: "Verification successful! Thank you for your support!",
    SETTINGS_MSG_VERIFY_FAIL: "Verification failed. Please check your License Key.",
    SETTINGS_MSG_NET_ERROR: "Network error, please try again later.",
    SETTINGS_MSG_DEACTIVATE_SUCCESS: "License removed. Reverted to Standard version.",
    SETTINGS_MSG_DEACTIVATE_FAIL: "Deactivation failed.",
    SETTINGS_FOOTER_TEXT: "Your support keeps the plugin growing with the community.",
    DECK_OPTIONS_TITLE: "Deck Options",
    DECK_OPTIONS_PRESET_SELECT: "Preset Selection",
    DECK_OPTIONS_PRESET_SELECT_DESC: "Select the review preset for this deck",
    DECK_OPTIONS_NEW_PRESET: "Create new preset",
    DECK_OPTIONS_EDIT_PRESET: "Edit Preset",
    DECK_OPTIONS_PRESET_NAME: "Preset Name",
    DECK_OPTIONS_SECTION_NEW_CARDS: "New Cards",
    DECK_OPTIONS_LEARNING_STEPS: "Learning Steps",
    DECK_OPTIONS_LEARNING_STEPS_DESC:
        "Space separated intervals (e.g. 1m 10m). Supports m(min) h(hour) d(day)",
    DECK_OPTIONS_MAX_NEW_CARDS: "New Cards/Day",
    DECK_OPTIONS_MAX_NEW_CARDS_DESC: "Maximum number of new cards to show per day",
    DECK_OPTIONS_MAX_NEW_EXTRACTS: "New Extracts/Day",
    DECK_OPTIONS_MAX_NEW_EXTRACTS_DESC: "Maximum number of new extracts to introduce per day",
    DECK_OPTIONS_SECTION_LAPSES: "Lapses",
    DECK_OPTIONS_RELEARNING_STEPS: "Relearning Steps",
    DECK_OPTIONS_RELEARNING_STEPS_DESC:
        "Space separated intervals (e.g. 10m). Supports m(min) h(hour) d(day)",
    DECK_OPTIONS_INVALID_STEP_FORMAT:
        "Deck option steps must use space separated values like 1m 10m, using only m, h, or d.",
    DECK_OPTIONS_SECTION_REVIEWS: "Reviews",
    DECK_OPTIONS_MAX_REVIEWS: "Reviews/Day",
    DECK_OPTIONS_MAX_REVIEWS_DESC: "Maximum number of reviews to show per day",
    DECK_OPTIONS_MAX_EXTRACT_REVIEWS: "Extract Reviews/Day",
    DECK_OPTIONS_MAX_EXTRACT_REVIEWS_DESC: "Maximum number of due extract reviews to show per day",
    DECK_OPTIONS_SECTION_AUTO_ADVANCE: "Auto Advance",
    DECK_OPTIONS_AUTO_ADVANCE: "Auto Advance",
    DECK_OPTIONS_AUTO_ADVANCE_DESC: "Automatically flip to back after time limit",
    DECK_OPTIONS_AUTO_ADVANCE_SECONDS: "Seconds to Wait",
    DECK_OPTIONS_AUTO_ADVANCE_SECONDS_DESC: "Seconds to wait before flipping",
    DECK_OPTIONS_SHOW_PROGRESS_BAR: "Show Progress Bar",
    DECK_OPTIONS_SHOW_PROGRESS_BAR_DESC: "Show countdown progress bar during review",
    DECK_OPTIONS_DELETE_PRESET: "Delete Preset",
    DECK_OPTIONS_DELETE_PRESET_DESC: "Decks using this preset will revert to Default",
    DECK_OPTIONS_BTN_DELETE_PRESET: "Delete Preset",
    DECK_OPTIONS_BTN_SAVE: "Save",
    DECK_OPTIONS_BUILTIN_PRESET_NAME: "Default Preset",
    DECK_OPTIONS_DEFAULT_PRESET_NAME: "Custom Preset",
    DECK_OPTIONS_PRESET_USAGE_COUNT_SINGULAR: "${presetName} (${count} deck uses this)",
    DECK_OPTIONS_PRESET_USAGE_COUNT_PLURAL: "${presetName} (${count} decks use this)",
    FOLDER_TRACKING_TITLE: "Folder Tracking Settings",
    FOLDER_TRACKING_SECTION_TRACKING: "Tracking",
    FOLDER_TRACKING_SECTION_TAGS: "Automatic Tags",
    FOLDER_TRACKING_TRACK_FOLDER: "Track this folder",
    FOLDER_TRACKING_TRACK_FOLDER_DESC:
        "Track current and future markdown notes in this folder unless a child folder overrides it.",
    FOLDER_TRACKING_AUTO_TAGS: "Automatically add tags",
    FOLDER_TRACKING_AUTO_TAGS_DESC:
        "Apply the configured tags to current notes and future new notes in this folder.",
    FOLDER_TRACKING_TAGS: "Auto tag list",
    FOLDER_TRACKING_TAGS_DESC:
        "Enter any tags, separated by spaces, commas, or new lines. Only tags added by this rule will be removed later.",
    FOLDER_TRACKING_TAGS_PLACEHOLDER: "Math\nAuthors/Borges",
    FOLDER_TRACKING_FOOTER_NOTE: "Existing notes are updated on save.",
    FOLDER_TRACKING_SAVE_SUCCESS: "Folder tracking settings saved",
    FOLDER_TRACKING_RESET: "Remove auto-added tags",
    FOLDER_TRACKING_RESET_SUCCESS: "Auto-added tags removed",
    LOC_CONFIRM_NOTES: "### Review Notes\n",
    LOC_CONFIRM_FLASHCARDS: "\n---\n### Flashcards\n",
    CONFIRM: "Confirm",
    NOTICE_ANKI_CLOZE_SUPPORTER_ONLY: "Anki cloze is only available to supporters.",
    NOTICE_SUPPORTER_ONLY_FEATURE: '"${featureName}" is only available to supporters.',
    NOTICE_UPDATE_AVAILABLE:
        "A newer version of Syro is available in BRAT Plugins.\n\nYou are using ${currentVersion}.\nThe latest is ${latestVersion}.",
    PRIORITY_RANGE_ERROR: "Priority must be between 1 and 10.",
    REVIEW_TIMES_REVIEWED: "Times reviewed: ${count}",
    DATA_REVIEW_SAVE_PENDING: "Syro: review changes are still pending save and will keep retrying.",
    DATA_NOTE_SAVE_PENDING: "Syro: review note changes are pending save and will retry.",
    TIMELINE_COMMIT_BUTTON: "Commit (Ctrl+Enter)",
    TIMELINE_TITLE: "Timeline",
    SIDEBAR_NO_TAG: "No tag",
    SIDEBAR_NO_NOTES_WITH_SELECTED_TAGS: "No notes with selected tags",
    SETTINGS_SUPPORTER_BADGE: "Supporter feature",
    UI_FINISH_EDITING: "Finish Editing",
    UI_EDITOR_MODE_LABEL: "Editor mode",
    UI_ITALIC_KEY_HINT: "Ctrl+I Italic",
    UI_CLOZE_KEY_HINT: "Alt+Shift+C Cloze",
    UI_EDIT_TOGGLE_KEY_HINT: "Alt+E",
    UI_EXIT_KEY_HINT: "Alt+E Exit",
    WMS_IMP_MIN_ERROR: "Please enter a value between 0.1 and 5.0.",
    WMS_IMP_MAX_ERROR: "Please enter a value between 0.1 and 10.0.",
    WMS_IMP_ORDER_ERROR: "Maximum multiplier must be greater than or equal to minimum multiplier.",
    NOTICE_REVIEW_UPDATE_ERROR:
        "Review update error: next=${nextReview}, last=${lastReview}, interval=${reviewInterval}, balanced=${balancedInterval}",
});
