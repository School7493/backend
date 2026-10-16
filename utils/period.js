const MONTH_LABELS = [
    "جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان",
    "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

// month=1..12 => range = 20th of (month-1) -> 20th of month
function getPeriodRange(month, year) {
    const end = new Date(year, month - 1, 20, 0, 0, 0, 0);
    const start = new Date(year, month - 2, 20, 0, 0, 0, 0);
    return { start, end, label: MONTH_LABELS[month - 1] };
}

function getYearPeriods(year) {
    const periods = [];
    for (let m = 1; m <= 12; m++) {
        periods.push({ month: m, ...getPeriodRange(m, year) });
    }
    return periods;
}

function getPayPeriod(referenceDate = new Date()) {
  const day = referenceDate.getDate();
  let month = referenceDate.getMonth() + 1; // periodMonth, 1-12
  let year = referenceDate.getFullYear();

  if (day > 20) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  let startMonth = month - 1;
  let startYear = year;
  if (startMonth < 1) {
    startMonth = 12;
    startYear -= 1;
  }

  const periodStart = new Date(startYear, startMonth - 1, 21);
  const periodEnd = new Date(year, month - 1, 20);
  const daysInPeriod =
    Math.round((periodEnd - periodStart) / (1000 * 60 * 60 * 24)) + 1;

  let payMonth = month + 1;
  let payYear = year;
  if (payMonth > 12) {
    payMonth = 1;
    payYear += 1;
  }
  const payDate = new Date(payYear, payMonth - 1, 10);

  return { month, year, periodStart, periodEnd, daysInPeriod, payDate };
}

const pad = (n) => String(n).padStart(2, "0");
const fmt = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// [start, endExclusive) as YYYY-MM-DD strings. Month period = 21st of previous month -> 20th of month (inclusive)
function getPayPeriodBounds(year, month) {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return {
    start: fmt(prevYear, prevMonth, 21),
    endExclusive: fmt(year, month, 21),
  };
}

// Pay year = 21 Dec (year-1) -> 20 Dec (year)
function getPayYearBounds(year) {
  return {
    start: fmt(year - 1, 12, 21),
    endExclusive: fmt(year, 12, 21),
  };
}

// Which pay year a date belongs to (day > 20 in December => next year)
function getPayYearOf(value) {
  let y, m, d;
  if (typeof value === "string") {
    [y, m, d] = value.slice(0, 10).split("-").map(Number);
  } else {
    const dt = new Date(value);
    y = dt.getFullYear();
    m = dt.getMonth() + 1;
    d = dt.getDate();
  }
  return m === 12 && d > 20 ? y + 1 : y;
}
// "YYYY-MM" where MM is the month the billing window STARTS (20th -> 20th)
function getCurrentPeriod(date = new Date()) {
  let year = date.getFullYear();
  let month = date.getMonth();
  if (date.getDate() < 20) {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}
// add getCurrentPeriod to module.exports

module.exports = {
  getPeriodRange,
  getYearPeriods,
  MONTH_LABELS,
  getPayPeriod,
  getPayPeriodBounds,
  getPayYearBounds,
  getPayYearOf,
  getCurrentPeriod
};

