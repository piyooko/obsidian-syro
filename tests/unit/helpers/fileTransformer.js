const path = require("path");
module.exports = {
    process(sourceText, sourcePath, _options) {
        return {
            code: `module.exports = ${JSON.stringify(path.basename(sourcePath))};`,
        };
    },
};
