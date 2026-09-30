const { Op } = require("sequelize");
const SchoolYear = require("../models/SchoolYear");
const Holiday = require("../models/Holiday");

// Dates are 'YYYY-MM-DD' strings, so plain string comparison is safe (no timezone issues).
function periodBounds(month, year) {
    const mm = String(month).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    return {
        periodStart: `${year}-${mm}-01`,
        periodEnd: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
    };
}

// Returns null if no school year overlaps the period (= nobody is paid as a teacher).
async function getSchoolCalendar(month, year) {
    const { periodStart, periodEnd } = periodBounds(month, year);

    const schoolYear = await SchoolYear.findOne({
        where: {
            start_date: { [Op.lte]: periodEnd },
            end_date: { [Op.gte]: periodStart },
        },
    });
    if (!schoolYear) return null;

    const holidays = await Holiday.findAll({
        where: {
            start_date: { [Op.lte]: periodEnd },
            end_date: { [Op.gte]: periodStart },
        },
    });

    return {
        startDate: schoolYear.start_date,
        endDate: schoolYear.end_date,
        holidays: holidays.map(h => ({ start: h.start_date, end: h.end_date })),
    };
}

// Helper for the salary/absence services.
function isHoliday(dateStr, holidays) {
    return holidays.some(h => dateStr >= h.start && dateStr <= h.end);
}

function isWorkingDay(dateStr, calendar) {
    return dateStr >= calendar.startDate
        && dateStr <= calendar.endDate
        && !isHoliday(dateStr, calendar.holidays);
}

module.exports = { getSchoolCalendar, isHoliday, isWorkingDay, periodBounds };