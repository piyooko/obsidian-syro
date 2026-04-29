const EXPLICIT_MOJIBAKE_PATTERNS = [
    /锟斤拷/u,
    /�/u,
    /Ã./u,
    /Â./u,
    /â[\u0080-\u00BF]/u,
    /ð[\u0080-\u00BF]/u,
];
const SUSPICIOUS_CHAR_PATTERN = /[闂閿鏉妗鍙鐨涓浠鍚鈥欐鍥鏆鎴楂鎺鎼妫钃锟鎸栫┖銆锛鐢甯杩鍦搴鏄]/gu;
const BOX_DRAWING_PATTERN = /[\u2500-\u257f]/gu;
const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/u;
const SUSPICIOUS_CLUSTER_SIZE = 2;

function scanContent(content, displayPath) {
    const findings = [];
    const lines = content.split(/\r?\n/u);

    lines.forEach((line, index) => {
        const signals = getSignals(line);
        if (signals.length === 0) {
            return;
        }

        findings.push({
            file: displayPath,
            lineNumber: index + 1,
            category: classifyLine(line, signals),
            line: line.trim(),
        });
    });

    return findings;
}

function getSignals(line) {
    const signals = new Set();

    for (const pattern of EXPLICIT_MOJIBAKE_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
            signals.add(match[0]);
        }
    }

    const suspiciousChars = [...new Set(line.match(SUSPICIOUS_CHAR_PATTERN) ?? [])];
    if (suspiciousChars.length >= SUSPICIOUS_CLUSTER_SIZE) {
        for (const char of suspiciousChars.slice(0, 4)) {
            signals.add(char);
        }
    }

    if (CJK_PATTERN.test(line)) {
        for (const char of [...new Set(line.match(BOX_DRAWING_PATTERN) ?? [])]) {
            signals.add(char);
        }
    }

    return [...signals];
}

function classifyLine(line, signals) {
    const trimmed = line.trim();
    if (/^(?:\/\/|\/\*|\*|\*\/)/u.test(trimmed)) {
        return "comment";
    }

    const escapedSignals = signals.map((signal) => escapeRegExp(signal));
    const stringPattern = new RegExp(
        `(["'\`])(?:\\\\.|(?!\\1).)*?(?:${escapedSignals.join("|")})(?:\\\\.|(?!\\1).)*?\\1`,
        "u",
    );
    if (stringPattern.test(line)) {
        return "runtime-string";
    }

    return "other";
}

function groupBy(items, getKey) {
    return items.reduce((accumulator, item) => {
        const key = getKey(item);
        accumulator[key] ??= [];
        accumulator[key].push(item);
        return accumulator;
    }, {});
}

function truncate(text, maxLength) {
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

module.exports = {
    classifyLine,
    getSignals,
    groupBy,
    scanContent,
    truncate,
};
