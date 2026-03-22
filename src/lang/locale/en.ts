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

export default {
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
    CRAM_CARDS_IN_NOTE: "Cram flashcards in this note",
    VIEW_STATS: "View statistics",
    OPEN_REVIEW_QUEUE_VIEW: "Open Tracked Notes in sidebar",
    STATUS_BAR: "Review: ${dueNotesCount} note(s), ${dueFlashcardsCount} card(s) due",
    SYNC_TIME_TAKEN: "Sync took ${t}ms",
    NOTE_IN_IGNORED_FOLDER: "Note is saved under ignored folder (check settings).",
    PLEASE_TAG_NOTE: "Please tag the note appropriately for reviewing (in settings).",
    RESPONSE_RECEIVED: "Response received.",
    NO_DECK_EXISTS: "No deck exists for ${deckName}",
    ALL_CAUGHT_UP: "You're all caught up now :D.",
    STATUS_BAR_FLASHCARD_DUE: "${dueFlashcardsCount} cards due",
    STATUS_BAR_NOTE_DUE: "${dueNotesCount} notes due",
    STATUS_BAR_FLASHCARD_DUE_SINGULAR: "${dueFlashcardsCount} card due",
    STATUS_BAR_NOTE_DUE_SINGULAR: "${dueNotesCount} note due",
    NOTICE_TEXT_SELECTION_REQUIRED: "Please select text to create cloze",
    NOTICE_CLOZE_CREATED: "Cloze c${nextId} created",
    DECK_TREE_FULL_SYNC_TITLE: "Sync cache (incremental)",
    CMD_GLOBAL_SYNC_FULL: "Rebuild Cache (Full Parse)",

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
    FUZZING: "Fuzzing",
    FUZZING_DESC:
        "When enabled, this adds a small random delay to the new interval time to prevent cards from sticking together and always being reviewed on the same day.",
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
    ALGORITHMS_CONFIRM: `Switching algorithms might reset or impact review timings on existing items.
    This change is irreversible. Changing algorithms only takes effect after a restart
    or a plugin reload. Are you sure you want to switch algorithms?
    `,
    ALGORITHMS_DESC:
        "The algorithm used for spaced repetition.",
    ALGORITHM_SWITCH_SUCCESS: "Switch successful",
    ALGORITHM_SWITCH_FAILED: "Switch failed, restored",

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

    // mixQueueSetting.ts
    MIX_QUEUE: "Mix queue",
    MIX_QUEUE_DESC:
        "mix ondue and new notes when review. **first** slider for total count, second slider for ondue count. And new count is (total - ondue).",

    // trackSetting.ts
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

    // anki.ts
    ANKI_ALGORITHM_DESC:
        'The algorithm used for spaced repetition. For more information see <a href="https://faqs.ankiweb.net/what-spaced-repetition-algorithm.html">Anki algorithm</a>.',
    STARTING_EASE: "Starting Ease",
    STARTING_EASE_DESC: "The initial ease given to an item.",
    STARTING_EASE_ERROR: "Starting ease must be a positive number.",
    STARTING_EASE_WARNING: "Starting ease lower than 1.3 is not recommended.",
    EASY_BONUS_ANKI: "Easy Bonus",
    EASY_BONUS_ANKI_DESC: "A bonus multiplier for items reviewed as easy.",
    EASY_BONUS_ANKI_ERROR: "Easy bonus must be a number greater than or equal to 1.",
    LAPSE_INTERVAL_MODIFIER: "Lapse Interval Modifier",
    LAPSE_INTERVAL_MODIFIER_DESC:
        "A factor to modify the review interval with when an item is reviewed as wrong.",
    LAPSE_INTERVAL_ERROR: "Lapse interval must be a positive number.",
    GRADUATING_INTERVAL: "Graduating Interval",
    GRADUATING_INTERVAL_DESC:
        "The interval (in days) to the next review after reviewing a new item as 'Good'.",
    GRADUATING_INTERVAL_ERROR: "Interval must be a positive number.",
    EASY_INTERVAL: "Easy Interval",
    EASY_INTERVAL_DESC:
        "The interval (in days) to the next review after reviewing a new item as 'Easy'.",
    EASY_INTERVAL_ERROR: "Interval must be a positive number.",

    // scheduling_default.ts
    DEFAULT_ALGORITHM_DESC:
        "The algorithm used for spaced repetition.",

    // supermemo.ts
    SM2_ALGORITHM_DESC:
        'The algorithm used for spaced repetition. Currently shares the same parameters as the Anki algorithm (only the algorithm processing method is different). For more information see <a href="https://www.supermemo.com/en/archives1990-2015/english/ol/sm2">SM2 algorithm</a>.',

    // info.ts
    ITEM_INFO_TITLE: "Item info of",
    CARDS_IN_NOTE: "Cards in this Note",
    SAVE_ITEM_INFO: "Save",
    SAVE_ITEM_INFO_TOOLTIP: "only save current note's item info",
    CLOSE_ITEM_INFO: "Close",
    LINE_NO: "LineNo:",
    NEXT_REVIEW: "nextReivew:",
    NEW_CARD: "NewCard",
    ITEM_DATA_INFO: "Item.data info",

    // locationSetting.ts
    DATA_LOCATION_WARNING_TO_NOTE:
        "BE CAREFUL!!!\n  if you confirm this, it will convert all your scheduling informations in `tracked_files.json` to note, which will change lots of your note file in the same time.\n Please make sure the setting tags of flashcards and notes is what you are using.",
    DATA_LOCATION_WARNING_OTHER_ALGO:
        "if you want to save data on notefile, you **have to** use Default Algorithm.",
    DATA_LOCATION_WARNING_TO_TRACKED:
        "BE CAREFUL!!! \n if you confirm this, it will converte all your scheduling informations on note(which will be deleted in the same time) TO `tracked_files.json`.",

    POST_ISSUE_MODIFIED_PLUGIN:
        'Post an <a href="${issue_url}">issue</a> if you find a settings-specific Syro bug.',

    // donation.ts
    DONATION_TEXT: "Syro is under active development. Feedback and bug reports are welcome.",

    // locationSetting.ts
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
    CMD_GLOBAL_SYNC_CARDS: "Global Sync Cards (Clean Ghost Cards)",
    CMD_CREATE_CLOZE_SAME_LEVEL: "Create Cloze (Same Level)",
    CMD_CREATE_CLOZE_NEW_LEVEL: "Create Cloze (New Level)",

    // trackFileEvents.ts
    MENU_TRACK_ALL_NOTES: "Track All Notes",
    MENU_UNTRACK_ALL_NOTES: "Untrack All Notes",
    MENU_TRACK_NOTE: "Track Note",
    MENU_UNTRACK_NOTE: "Untrack Note",

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

    // location_switch.ts
    DATA_FILE_MOVED_SUCCESS: "Successfully moved data file!",
    DATA_FILE_DELETE_OLD_FAILED: "Unable to delete old data file, please delete it manually.",
    DATA_FILE_MOVE_FAILED: "Unable to move data file!",
    DATA_LOST_WARNING: "have some data lost, see console for details.",
    // LinearCard.tsx
    UI_EXIT_EDIT_MODE: "Exited edit mode",
    UI_ENTER_EDIT_MODE: "Entered edit mode (Esc to exit)",
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
    SETTINGS_TAB_SYNC: "Sync",
    SETTINGS_TAB_LICENSE: "License",
    SETTINGS_SECTION_BEHAVIOR: "Behavior",
    SETTINGS_CARD_ORDER: "Card Order",
    SETTINGS_CARD_ORDER_DESC: "Sort order within a deck during review.",
    SETTINGS_NOTE_CACHE_PERSISTENCE: "Persist Parse Cache",
    SETTINGS_NOTE_CACHE_PERSISTENCE_DESC:
        "Store parsed notes in note_cache.json so unchanged files can be reused after restart.",
    SETTINGS_SYNC_PROGRESS_DISPLAY: "Sync Progress Tip",
    SETTINGS_SYNC_PROGRESS_DISPLAY_DESC:
        "Control when the top-right sync progress tip is shown during vault sync.",
    SETTINGS_SYNC_PROGRESS_DISPLAY_ALWAYS: "Always",
    SETTINGS_SYNC_PROGRESS_DISPLAY_FULL_ONLY: "Only on Full Rebuild",
    SETTINGS_SYNC_PROGRESS_DISPLAY_NEVER: "Never",
    SETTINGS_CARD_CAPTURE_REBUILD_CONFIRM:
        "**Card capture rules changed.** Existing notes need a rebuild sync before they can be reparsed with the new capture settings.\n\nRebuild now?",
    SETTINGS_SECTION_SYNC: "Sync",
    SETTINGS_AUTO_INCREMENTAL_SYNC: "Automatic Incremental Sync",
    SETTINGS_AUTO_INCREMENTAL_SYNC_DESC:
        "When disabled, file changes, review entry, and background polling will not run incremental sync automatically. Manual incremental sync still works, and startup initialization or rebuilds stay enabled.",
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
    SETTINGS_CLOZE_CONTEXT_MODE: "Cloze Context Range",
    SETTINGS_CLOZE_CONTEXT_MODE_TOOLTIP: "Choose how much review context to show.",
    SETTINGS_CLOZE_CONTEXT_SINGLE: "Single Segment",
    SETTINGS_CLOZE_CONTEXT_SINGLE_DESC:
        "Only show the current paragraph separated by one blank line.",
    SETTINGS_CLOZE_CONTEXT_DOUBLE_BREAK: "Enhanced Segment",
    SETTINGS_CLOZE_CONTEXT_DOUBLE_BREAK_DESC:
        "Keep a larger block and stop only at two consecutive blank lines.",
    SETTINGS_CLOZE_CONTEXT_EXPANDED: "Expanded",
    SETTINGS_CLOZE_CONTEXT_EXPANDED_DESC:
        "Show the current paragraph plus the previous and next paragraphs.",
    SETTINGS_CLOZE_CONTEXT_FULL: "Full Note (Not Recommended)",
    SETTINGS_CLOZE_CONTEXT_FULL_DESC:
        "Show the full note during review. This may be slow for long notes.",
    SETTINGS_CLOZE_CONTEXT_PERFORMANCE: "Long Context Optimization",
    SETTINGS_CLOZE_CONTEXT_PERFORMANCE_TOOLTIP: "Safely trim long context to reduce lag.",
    SETTINGS_CLOZE_CONTEXT_PERFORMANCE_DESC:
        "Trim very long context during review to reduce rendering pressure.",
    SETTINGS_CLOZE_CONTEXT_PERFORMANCE_OFF: "Off",
    SETTINGS_CLOZE_CONTEXT_PERFORMANCE_SAFE_TRIM: "Safe Trim",
    SETTINGS_CLOZE_CONTEXT_SOFT_LIMIT: "Trim Lines",
    SETTINGS_CLOZE_CONTEXT_SOFT_LIMIT_TOOLTIP: "Base lines kept above and below the cloze.",
    SETTINGS_CLOZE_CONTEXT_SOFT_LIMIT_DESC:
        "How many lines to keep above and below the cloze when safe trim is enabled. Range: 1-1000.",
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
    SETTINGS_SECTION_TIMELINE: "Timeline",
    SETTINGS_TIMELINE_SCROLL: "Show Scroll Percentage",
    SETTINGS_TIMELINE_SCROLL_DESC: "Show reading progress percentage in timeline items.",
    SETTINGS_TIMELINE_AUTO_EXPAND: "Auto Expand Timeline",
    SETTINGS_TIMELINE_AUTO_EXPAND_DESC:
        "Automatically expand timeline when opening review notes or clicking sidebar notes.",
    SETTINGS_TIMELINE_AUTO_COMMIT_REVIEW: "Auto Log Review Selection",
    SETTINGS_TIMELINE_AUTO_COMMIT_REVIEW_DESC:
        "Automatically write the selected note review option into Timeline after a successful review.",
    SETTINGS_TIMELINE_ENABLE_DURATION_PREFIX: "Enable Duration Prefix Syntax",
    SETTINGS_TIMELINE_ENABLE_DURATION_PREFIX_DESC:
        "Enable parsing and rendering of leading duration syntax like 2d:: or 1mo20d:: in Timeline.",
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
    SETTINGS_SECTION_PROGRESS_BAR: "Progress Bar",
    SETTINGS_PROGRESS_BAR_COLOR: "Bar Color",
    SETTINGS_PROGRESS_BAR_COLOR_DESC: "Select progress bar color.",
    SETTINGS_PROGRESS_WARNING_COLOR: "Warning Color",
    SETTINGS_PROGRESS_WARNING_COLOR_DESC: "Color when less than 30% time remains.",
    SETTINGS_PROGRESS_RTL: "Right to Left Animation",
    SETTINGS_PROGRESS_RTL_DESC: "Progress bar fills from right to left.",

    // Debug & Advanced
    SETTINGS_SECTION_DEBUG: "Advanced & Debug",
    SETTINGS_RUNTIME_DEBUG_MESSAGES: "Debug Console Output",
    SETTINGS_RUNTIME_DEBUG_MESSAGES_DESC:
        "Show runtime debug logs in the developer console for sync flow, deck tree refreshes, and review session state changes.",
    SETTINGS_ENABLE_CARD_TRACE: "Card-level Debug Trace (Dev)",
    SETTINGS_ENABLE_CARD_TRACE_DESC:
        "When enabled, captures lifecycle data for each card (from parsing to scheduling) to help debug data flow issues. Viewable in the Debug & Stats panel during review. (Recommended only for debugging)",

    // Phase 3
    SETTINGS_SECTION_SUPPORTER: "Supporter",
    SETTINGS_SUPPORTER_DESC_PRO: "Sustaining long-term development.",
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
    SETTINGS_DEACTIVATE_LICENSE_DESC: "Remove supporter status from this device.",
    SETTINGS_BTN_DEACTIVATE: "Deactivate",
    SETTINGS_MSG_ENTER_KEY: "Please enter a license key.",
    SETTINGS_MSG_VERIFY_SUCCESS: "Verification successful! Thank you for your support!",
    SETTINGS_MSG_VERIFY_FAIL: "Verification failed. Please check your License Key.",
    SETTINGS_MSG_NET_ERROR: "Network error, please try again later.",
    SETTINGS_MSG_DEACTIVATE_SUCCESS: "License removed. Reverted to Standard version.",
    SETTINGS_MSG_DEACTIVATE_FAIL: "Deactivation failed.",
    SETTINGS_FOOTER_TEXT: "Your support keeps the plugin growing with the community.",
    // DeckOptionsModal.ts
    DECK_OPTIONS_TITLE: "Deck Options",
    DECK_OPTIONS_PRESET_SELECT: "Preset Selection",
    DECK_OPTIONS_PRESET_SELECT_DESC: "Select the review preset for this deck",
    DECK_OPTIONS_NEW_PRESET: "Create new preset",
    DECK_OPTIONS_EDIT_PRESET: "Edit Preset",
    DECK_OPTIONS_PRESET_NAME: "Preset Name",
    DECK_OPTIONS_SECTION_NEW_CARDS: "New Cards",
    DECK_OPTIONS_LEARNING_STEPS: "Learning Steps",
    DECK_OPTIONS_LEARNING_STEPS_DESC:
        "Space separated intervals (e.g. 1m 10m). Supports s(sec) m(min) h(hour) d(day)",
    DECK_OPTIONS_MAX_NEW_CARDS: "New Cards/Day",
    DECK_OPTIONS_MAX_NEW_CARDS_DESC: "Maximum number of new cards to show per day",
    DECK_OPTIONS_SECTION_LAPSES: "Lapses",
    DECK_OPTIONS_RELEARNING_STEPS: "Relearning Steps",
    DECK_OPTIONS_RELEARNING_STEPS_DESC:
        "Space separated intervals (e.g. 10m). Supports s(sec) m(min) h(hour) d(day)",
    DECK_OPTIONS_SECTION_REVIEWS: "Reviews",
    DECK_OPTIONS_MAX_REVIEWS: "Reviews/Day",
    DECK_OPTIONS_MAX_REVIEWS_DESC: "Maximum number of reviews to show per day",
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
    DECK_OPTIONS_DEFAULT_PRESET_NAME: "Custom Preset",
    // algorithmSetting.ts
    ALGO_CARD_SELECT: "Card Algorithm",
    ALGO_CARD_SELECT_DESC: "Select algorithm for card reviews",
    ALGO_SAVE_WARN_PREFIX: "If you want to use ",
    ALGO_SAVE_WARN_SUFFIX: " algorithm, you **can't** save data on note file.",
    ALGO_SWITCH_CONFIRM: "Switching card algorithm requires plugin reload. Are you sure?",
    ALGO_NOTE_SELECT: "Note Algorithm",
    ALGO_NOTE_SELECT_DESC: "Select algorithm for note reviews",
    ALGO_NOTE_SWITCH_CONFIRM: "Switching note algorithm requires plugin reload. Are you sure?",
    // locationSetting.ts
    LOC_CONFIRM_NOTES: "### Review Notes\n",
    LOC_CONFIRM_FLASHCARDS: "\n---\n### Flashcards\n",
};
