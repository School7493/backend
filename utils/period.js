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

module.exports = { getPeriodRange, getYearPeriods, MONTH_LABELS, getPayPeriod };