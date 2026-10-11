// jobs/generateTrimesterSubscriptions.js
const cron = require("node-cron");
const { Op } = require("sequelize");
const Student = require("../models/Student");
const Zone = require("../models/Zone");
const Subscription = require("../models/Subscription");
const JobLog = require("../models/JobLog");
const SchoolYear = require("../models/SchoolYear");
const Holiday = require("../models/Holiday");
const { getActiveSchoolYear } = require("../utils/schoolYear");

const JOB_NAME = "generate_trimester_subscriptions";

const toDateOnly = (d) => d.toISOString().slice(0, 10); // 'YYYY-MM-DD'

const addDays = (dateStr, days) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return toDateOnly(d);
};

// finds the school year that contains `dateStr` ('YYYY-MM-DD')
async function findActiveSchoolYear(dateStr) {
    return SchoolYear.findOne({
        where: {
            start_date: { [Op.lte]: dateStr },
            end_date: { [Op.gte]: dateStr },
        },
    });
}

// the term-1 / term-2 holidays that fall inside this school year
async function getSchoolYearHolidays(schoolYear) {
    const holidays = await Holiday.findAll({
        where: {
            start_date: { [Op.gte]: schoolYear.start_date },
            end_date: { [Op.lte]: schoolYear.end_date },
        },
    });
    return {
        term1: holidays.find((h) => h.term === 1) || null,
        term2: holidays.find((h) => h.term === 2) || null,
    };
}

// T1 starts on the school year's start_date.
// T2 starts the day after the term-1 holiday ends.
// T3 starts the day after the term-2 holiday ends (then runs to final payment).
// T2/T3 stay null (job skips) until that holiday has been entered.
async function getTrimesterBoundaries(schoolYear) {
    const { term1, term2 } = await getSchoolYearHolidays(schoolYear);

    return {
        T1: schoolYear.start_date,
        T2: term1 ? addDays(term1.end_date, 1) : null,
        T3: term2 ? addDays(term2.end_date, 1) : null,
    };
}

// "YYYY-T1" / "YYYY-T2" / "YYYY-T3", keyed by the school year's start_date year,
// derived from the SchoolYear + Holiday tables instead of hardcoded calendar dates
async function currentTrimesterPeriod(date = new Date()) {
    const dateStr = toDateOnly(date);
    const schoolYear = await findActiveSchoolYear(dateStr);
    if (!schoolYear) return null;

    const boundaries = await getTrimesterBoundaries(schoolYear);
    const year = new Date(schoolYear.start_date).getFullYear();

    if (boundaries.T1 === dateStr) return `${year}-T1`;
    if (boundaries.T2 === dateStr) return `${year}-T2`;
    if (boundaries.T3 === dateStr) return `${year}-T3`;
    return null; // not a trimester-start day
}

async function hasRunForPeriod(period) {
    const log = await JobLog.findOne({ where: { job_name: JOB_NAME, period } });
    return !!log;
}

async function runTrimesterSubscriptionJob() {
    const schoolYear = await getActiveSchoolYear();
    if (!schoolYear) {
        console.log(`[${JOB_NAME}] skipped: no active school year (past end_date or none defined)`);
        return;
    }
    const period = await currentTrimesterPeriod();

    if (!period) {
        console.log(`[${JOB_NAME}] not a trimester-start date, skipping`);
        return;
    }

    if (await hasRunForPeriod(period)) {
        console.log(`[${JOB_NAME}] already ran for ${period}, skipping`);
        return;
    }

    const students = await Student.findAll();
    const zones = await Zone.findAll();
    const zoneMap = Object.fromEntries(zones.map(z => [z.id, z]));

    let created = 0;
    let skipped = 0;

    for (const student of students) {
        const lastSubscription = await Subscription.findOne({
            where: { student_id: student.id },
            order: [["createdAt", "DESC"]]
        });

        if (!lastSubscription || !lastSubscription.zone_id) {
            skipped++;
            continue;
        }

        // only regenerate for students actually on the quarterly plan
        if (lastSubscription.payment_type !== "يدفع بالثلاثي") {
            continue;
        }

        // is_active=false + deactivated_by_break=true means the last subscription
        // was only paused for a holiday (e.g. summer) — still regenerate.
        // is_active=false with deactivated_by_break=false means a real
        // cancellation — skip.
        if (!lastSubscription.is_active && !lastSubscription.deactivated_by_break) {
            skipped++;
            continue;
        }

        const zone = zoneMap[lastSubscription.zone_id];
        if (!zone) {
            skipped++;
            continue;
        }

        await Subscription.create({
            amount: zone.amount * 3, // full trimester, no one-time addition on renewal
            transport: !!lastSubscription.transport,
            payment_type: "يدفع بالثلاثي",
            status: "non payé",
            student_id: student.id,
            zone_id: zone.id,
            period,
        });

        created++;
    }

    await JobLog.create({ job_name: JOB_NAME, period });
    console.log(`[${JOB_NAME}] created ${created} subscriptions, skipped ${skipped} for ${period}`);
}

function startTrimesterSubscriptionJob() {
    runTrimesterSubscriptionJob().catch(err => {
        console.error(`[${JOB_NAME}] boot run failed:`, err);
    });

    // holiday dates move every school year, so the trimester boundaries
    // aren't fixed calendar dates anymore — run daily and let
    // currentTrimesterPeriod() decide, from SchoolYear + Holiday, whether
    // today is a trimester-start day
    cron.schedule("5 0 * * *", () => runTrimesterSubscriptionJob().catch(err =>
        console.error(`[${JOB_NAME}] scheduled run failed:`, err)));
}

module.exports = {
    runTrimesterSubscriptionJob,
    startTrimesterSubscriptionJob,
    hasRunForPeriod,
    currentTrimesterPeriod,
    getTrimesterBoundaries,
    JOB_NAME
};