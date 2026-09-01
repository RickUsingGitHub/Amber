(function (root) {
    const Amber = root.Amber = root.Amber || {};

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    Amber.pad = pad;

    Amber.formatForInput = function (date) {
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        return `${year}-${month}-${day}`;
    };

    Amber.localYesterday = function () {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - 1);
        return d;
    };

    Amber.inclusiveDayCount = function (startStr, endStr) {
        const start = new Date(startStr + 'T00:00:00');
        const end = new Date(endStr + 'T00:00:00');
        return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    };

    Amber.addDays = function (dateStr, days) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setDate(d.getDate() + days);
        return Amber.formatForInput(d);
    };

    /**
     * NEM timestamps are the END of the interval in UTC+10.
     * Shift back one second so midnight-ending intervals bucket on the usage day.
     */
    Amber.adjustNemTime = function (nemTimeStr) {
        if (!nemTimeStr || nemTimeStr.length < 19) return nemTimeStr;
        const localStr = nemTimeStr.substring(0, 19);
        const d = new Date(localStr + 'Z');
        d.setUTCSeconds(d.getUTCSeconds() - 1);

        const year = d.getUTCFullYear();
        const month = pad(d.getUTCMonth() + 1);
        const day = pad(d.getUTCDate());
        const hours = pad(d.getUTCHours());
        const minutes = pad(d.getUTCMinutes());
        const seconds = pad(d.getUTCSeconds());
        const offset = nemTimeStr.substring(19) || '+10:00';
        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
    };

    Amber.usageDateStr = function (item) {
        if (item && item.date) return item.date;
        const adjusted = Amber.adjustNemTime(item && item.nemTime);
        return adjusted ? adjusted.substring(0, 10) : '';
    };

    Amber.parseNemParts = function (nemTimeStr) {
        if (!nemTimeStr || nemTimeStr.length < 16) {
            return { year: 0, month: 0, day: 0, hours: 0, minutes: 0, seconds: 0, weekday: 0, dateStr: '', timeValue: 0 };
        }
        const year = parseInt(nemTimeStr.substring(0, 4), 10);
        const month = parseInt(nemTimeStr.substring(5, 7), 10);
        const day = parseInt(nemTimeStr.substring(8, 10), 10);
        const hours = parseInt(nemTimeStr.substring(11, 13), 10);
        const minutes = parseInt(nemTimeStr.substring(14, 16), 10);
        const seconds = parseInt(nemTimeStr.substring(17, 19), 10) || 0;
        const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
        return {
            year, month, day, hours, minutes, seconds, weekday,
            dateStr: nemTimeStr.substring(0, 10),
            timeValue: hours * 100 + minutes
        };
    };

    function weekdayFromName(name) {
        if (!name) return 0;
        const key = name.slice(0, 3);
        return Amber.WEEKDAY_INDEX[key] != null ? Amber.WEEKDAY_INDEX[key] : 0;
    }

    const tzFormatters = Object.create(null);

    function formatterForZone(timeZone) {
        let fmt = tzFormatters[timeZone];
        if (!fmt) {
            fmt = tzFormatters[timeZone] = new Intl.DateTimeFormat('en-AU', {
                timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                weekday: 'short',
                hourCycle: 'h23'
            });
        }
        return fmt;
    }

    /**
     * Clock used for TOU / demand windows.
     * - clock 'nem' or 'aest': hours from the NEM string (always UTC+10)
     * - clock 'local' (default for retail plans): convert the instant into the state's timezone (handles DST)
     */
    Amber.getClockParts = function (nemTimeStr, options) {
        const opts = options || {};
        const clock = opts.clock || 'local';
        if (clock === 'nem' || clock === 'aest' || !opts.timeZone) {
            return Amber.parseNemParts(nemTimeStr);
        }

        const instant = new Date(nemTimeStr);
        if (Number.isNaN(instant.getTime())) return Amber.parseNemParts(nemTimeStr);

        const fmt = formatterForZone(opts.timeZone);
        const bag = {};
        for (const part of fmt.formatToParts(instant)) {
            if (part.type !== 'literal') bag[part.type] = part.value;
        }
        const hours = parseInt(bag.hour, 10);
        const minutes = parseInt(bag.minute, 10);
        const year = parseInt(bag.year, 10);
        const month = parseInt(bag.month, 10);
        const day = parseInt(bag.day, 10);
        return {
            year, month, day, hours, minutes,
            seconds: parseInt(bag.second, 10) || 0,
            weekday: weekdayFromName(bag.weekday),
            dateStr: `${year}-${pad(month)}-${pad(day)}`,
            timeValue: hours * 100 + minutes
        };
    };

    Amber.clockOptionsForState = function (state, planConfig) {
        const clock = (planConfig && planConfig.clock) || 'local';
        const timeZone = (planConfig && planConfig.timeZone) || Amber.STATE_TIMEZONES[state] || 'Australia/Sydney';
        return { clock, timeZone };
    };

    Amber.timeInWindow = function (parts, startHHMM, endHHMM) {
        if (!startHHMM || !endHHMM) return false;
        const startTime = parseInt(String(startHHMM).replace(':', ''), 10);
        const endTime = parseInt(String(endHHMM).replace(':', ''), 10);
        const time = parts.timeValue;
        if (startTime > endTime) return time >= startTime || time < endTime;
        return time >= startTime && time < endTime;
    };

    Amber.windowMatches = function (window, parts) {
        if (!window || !window.start || !window.end) return false;
        const days = window.days || [];
        if (days.length && !days.includes(parts.weekday)) return false;
        return Amber.timeInWindow(parts, window.start, window.end);
    };

    Amber.formatNemForCsv = function (nemTimeStr) {
        if (!nemTimeStr) return '';
        const parts = Amber.parseNemParts(nemTimeStr);
        return `${parts.dateStr} ${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
    };

    Amber.toNemIso = function (dateStr, hours, minutes, seconds) {
        return `${dateStr}T${pad(hours)}:${pad(minutes)}:${pad(seconds || 0)}+10:00`;
    };

    Amber.thirtyMinBlockKey = function (parts) {
        const blockMin = parts.minutes < 30 ? 0 : 30;
        return `${parts.dateStr}T${pad(parts.hours)}:${pad(blockMin)}`;
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
