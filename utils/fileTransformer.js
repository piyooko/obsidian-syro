// eslint-disable-next-line @typescript-eslint/no-var-requires, no-undef
const path = require("path");
// eslint-disable-next-line no-undef
module.exports = {
    process(sourceText, sourcePath, _options) {
        return {
            code: `module.exports = ${JSON.stringify(path.basename(sourcePath))};`,
        };
    },
};
