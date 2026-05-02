const { collectSourceFiles } = require("../../scripts/check-i18n-core.cjs");
const {
    classifyLine,
    getSignals,
    groupBy,
    truncate,
} = require("../../scripts/detect-mojibake-core.cjs");

void [collectSourceFiles, classifyLine, getSignals, groupBy, truncate];
