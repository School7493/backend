// jobs/markUnpaidSubscriptions.js
const cron = require("node-cron");
const { Op } = require("sequelize");
const Subscription = require("../models/Subscription");
const Transport = require("../models/Transport"); // <- adjust to your real model name/path
const JobLog = require("../models/JobLog");
const { getActiveSchoolYear } = require("../utils/schoolYear");

const JOB_NAME = "mark_unpaid_subscriptions";

// Same 20th -> 20th billing cycle as generateMonthlySubscriptions.js.
// By the 15th, we're still inside the period that started on the 20th of last month.
function targetPeriodAnchor(date = new Date()) {
    // find the most recent 15th on/before today
    let year = date.getFullYear();
    let month = date.getMonth();
    if (date.getDate() < 15) {
        month -= 1;
        if (month < 0) { month = 11; year -= 1; }
    }
    return new Date(year, month, 15);
}

function currentPeriod(date = new Date()) {
    const anchor = targetPeriodAnchor(date);
    let year = anchor.getFullYear();
    let month = anchor.getMonth() - 1;
    if (month < 0) { month = 11; year -= 1; }
    return `${year}-${String(month + 1).padStart(2, "0")}`;
}

async function hasRunThisMonth(period = currentPeriod()) {
    const log = await JobLog.findOne({ where: { job_name: JOB_NAME, period } });
    return !!log;
}

async function runMarkUnpaidSubscriptionsJob() {
    const schoolYear = await getActiveSchoolYear();
    if (!schoolYear) {
        console.log(`[${JOB_NAME}] skipped: no active school year (past end_date or none defined)`);
        return;
    }
    const period = currentPeriod();

    if (await hasRunThisMonth(period)) {
        console.log(`[${JOB_NAME}] already ran for ${period}, skipping`);
        return;
    }

    // same filter for both tables
    const where = {
        status: "en attente",
        period,
        // don't touch records that were deactivated outright
        // (is_active=false, deactivated_by_break=false = real cancellation);
        // still mark unpaid ones that are active, or only paused for a break
        [Op.or]: [
            { is_active: true },
            { deactivated_by_break: true },
        ],
    };

    const t = await Subscription.sequelize.transaction();
    try {
        const [subscriptionsCount] = await Subscription.update(
            { status: "non payé" },
            { where, transaction: t }
        );

        const [transportCount] = await Transport.update(
            { status: "non payé" },
            { where, transaction: t }
        );

        await JobLog.create({ job_name: JOB_NAME, period }, { transaction: t });
        await t.commit();

        console.log(
            `[${JOB_NAME}] marked ${subscriptionsCount} subscriptions and ${transportCount} transport records as non payé for ${period}`
        );
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

function startMarkUnpaidSubscriptionsJob() {
    // run once on boot, in case a scheduled run was missed during downtime
    runMarkUnpaidSubscriptionsJob().catch(err => {
        console.error(`[${JOB_NAME}] boot run failed:`, err);
    });

    // 15th of every month, 00:05.
    cron.schedule("5 0 15 * *", () => {
        runMarkUnpaidSubscriptionsJob().catch(err => {
            console.error(`[${JOB_NAME}] scheduled run failed:`, err);
        });
    });
}

module.exports = {
    runMarkUnpaidSubscriptionsJob,
    startMarkUnpaidSubscriptionsJob,
    hasRunThisMonth,
    currentPeriod,
    JOB_NAME
};