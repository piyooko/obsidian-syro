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

class MockMomentValue {
    constructor(input, localeAccessor) {
        this._date = normalizeDateInput(input);
        this._localeAccessor = localeAccessor;
    }

    add(amount, unit) {
        const normalizedUnit = String(unit ?? "").toLowerCase();
        const numericAmount = Number(amount) || 0;

        switch (normalizedUnit) {
            case "d":
            case "day":
            case "days":
                this._date = new Date(this._date.getTime() + numericAmount * DAY_MS);
                break;
            case "h":
            case "hour":
            case "hours":
                this._date = new Date(this._date.getTime() + numericAmount * 60 * 60 * 1000);
                break;
            case "m":
            case "minute":
            case "minutes":
                this._date = new Date(this._date.getTime() + numericAmount * 60 * 1000);
                break;
            default:
                break;
        }

        return this;
    }

    subtract(amount, unit) {
        return this.add(-Number(amount || 0), unit);
    }

    startOf(unit) {
        if (String(unit ?? "").toLowerCase() === "day") {
            this._date = new Date(this._date.getTime());
            this._date.setHours(0, 0, 0, 0);
        }
        return this;
    }

    endOf(unit) {
        if (String(unit ?? "").toLowerCase() === "day") {
            this._date = new Date(this._date.getTime());
            this._date.setHours(23, 59, 59, 999);
        }
        return this;
    }

    clone() {
        return new MockMomentValue(this._date, this._localeAccessor);
    }

    format(pattern) {
        return formatDate(this._date, pattern);
    }

    valueOf() {
        return this._date.getTime();
    }

    toDate() {
        return new Date(this._date.getTime());
    }

    locale(nextLocale) {
        return this._localeAccessor(nextLocale);
    }

    isSameOrBefore(value) {
        return this.valueOf() <= normalizeDateInput(value).valueOf();
    }

    isSameOrAfter(value) {
        return this.valueOf() >= normalizeDateInput(value).valueOf();
    }

    isBefore(value) {
        return this.valueOf() < normalizeDateInput(value).valueOf();
    }

    isAfter(value) {
        return this.valueOf() > normalizeDateInput(value).valueOf();
    }
}

function createMockMoment(options = {}) {
    let currentLocale = options.locale ?? "en";

    const applyLocale = (nextLocale) => {
        if (typeof nextLocale === "string" && nextLocale.trim().length > 0) {
            currentLocale = nextLocale;
        }

        return currentLocale;
    };

    const mockMoment = (...args) => new MockMomentValue(args[0], applyLocale);
    mockMoment.locale = jest.fn(applyLocale);
    mockMoment.isMoment = (value) => value instanceof MockMomentValue;
    mockMoment.unix = (seconds) => new MockMomentValue(Number(seconds) * 1000, applyLocale);

    return mockMoment;
}

module.exports = {
    createMockMoment,
};
