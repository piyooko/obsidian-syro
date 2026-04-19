const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value) {
    return String(value).padStart(2, "0");
}

function normalizeDateInput(input) {
    if (input && typeof input.valueOf === "function" && typeof input !== "string") {
        const value = input.valueOf();
        if (typeof value === "number" && Number.isFinite(value)) {
            return new Date(value);
        }
    }

    if (input instanceof Date) {
        return new Date(input.getTime());
    }

    if (typeof input === "number" && Number.isFinite(input)) {
        return new Date(input);
    }

    if (typeof input === "string") {
        const isoDateMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoDateMatch) {
            const [, year, month, day] = isoDateMatch;
            return new Date(Number(year), Number(month) - 1, Number(day));
        }

        const legacyDateMatch = input.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (legacyDateMatch) {
            const [, day, month, year] = legacyDateMatch;
            return new Date(Number(year), Number(month) - 1, Number(day));
        }

        const parsed = new Date(input);
        if (!Number.isNaN(parsed.valueOf())) {
            return parsed;
        }
    }

    return new Date();
}

function formatDate(date, pattern) {
    if (pattern === "YYYY-MM-DD") {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    return date.toISOString();
}

function createMockMoment(options = {}) {
    let currentLocale = options.locale ?? "en";

    function createMomentValue(input) {
        let date = normalizeDateInput(input);

        const api = {
            add(amount, unit) {
                const normalizedUnit = String(unit ?? "").toLowerCase();
                const numericAmount = Number(amount) || 0;

                switch (normalizedUnit) {
                    case "d":
                    case "day":
                    case "days":
                        date = new Date(date.getTime() + numericAmount * DAY_MS);
                        break;
                    case "h":
                    case "hour":
                    case "hours":
                        date = new Date(date.getTime() + numericAmount * 60 * 60 * 1000);
                        break;
                    case "m":
                    case "minute":
                    case "minutes":
                        date = new Date(date.getTime() + numericAmount * 60 * 1000);
                        break;
                    default:
                        break;
                }

                return api;
            },
            subtract(amount, unit) {
                return api.add(-Number(amount || 0), unit);
            },
            startOf(unit) {
                if (String(unit ?? "").toLowerCase() === "day") {
                    date = new Date(date.getTime());
                    date.setHours(0, 0, 0, 0);
                }
                return api;
            },
            endOf(unit) {
                if (String(unit ?? "").toLowerCase() === "day") {
                    date = new Date(date.getTime());
                    date.setHours(23, 59, 59, 999);
                }
                return api;
            },
            clone() {
                return createMomentValue(date);
            },
            format(pattern) {
                return formatDate(date, pattern);
            },
            valueOf() {
                return date.getTime();
            },
            toDate() {
                return new Date(date.getTime());
            },
            locale(nextLocale) {
                return mockMoment.locale(nextLocale);
            },
        };

        return api;
    }

    const mockMoment = (...args) => createMomentValue(args[0]);
    mockMoment.locale = jest.fn((nextLocale) => {
        if (typeof nextLocale === "string" && nextLocale.trim().length > 0) {
            currentLocale = nextLocale;
        }

        return currentLocale;
    });
    mockMoment.isMoment = (value) =>
        Boolean(
            value &&
                typeof value === "object" &&
                typeof value.valueOf === "function" &&
                typeof value.clone === "function",
        );
    mockMoment.unix = (seconds) => createMomentValue(Number(seconds) * 1000);

    return mockMoment;
}

module.exports = {
    createMockMoment,
};
