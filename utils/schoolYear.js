const { Op } = require("sequelize");
const SchoolYear = require("../models/SchoolYear");

// "YYYY-MM-DD" in Tunisia time, to match DATEONLY values
const todayStr = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());

// Returns the school year that is still open (today <= end_date), or null
async function getActiveSchoolYear() {
  const today = todayStr();
  return SchoolYear.findOne({
    where: {
      start_date: { [Op.lte]: today },
      end_date: { [Op.gte]: today },
      status:"active"

    },
    order: [["start_date", "DESC"]],
  });
}

// Wrap a cron callback so it only runs before the school year's end_date
function onlyDuringSchoolYear(jobName, fn) {
  return async (...args) => {
    try {
      const year = await getActiveSchoolYear();
      if (!year) {
        console.log(`[${jobName}] skipped: no active school year`);
        return;
      }
      return await fn(year, ...args);
    } catch (err) {
      console.error(`[${jobName}] failed:`, err);
    }
  };
}

module.exports = { getActiveSchoolYear, onlyDuringSchoolYear };