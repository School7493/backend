// jobs/generateMonthlySubscriptions.js
const cron = require("node-cron");
const sequelize = require("../config/db");
const Student = require("../models/Student");
const Subscription = require("../models/Subscription");
const Transport = require("../models/Transport");
const JobLog = require("../models/JobLog");
const Price = require("../models/TuitionFee");
const Zone = require("../models/Zone");
const { getActiveSchoolYear } = require("../utils/schoolYear");

const JOB_NAME = "generate_monthly_subscriptions";
const MONTHLY_PLAN = "يدفع شهريًا";

function currentPeriod(date = new Date()) {
    // billing cycle is 20th -> 20th; label uses the month the cycle STARTS in
    let year = date.getFullYear();
    let month = date.getMonth(); // 0-indexed
    if (date.getDate() < 20) {
        month -= 1;
        if (month < 0) { month = 11; year -= 1; }
    }
    return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function isSchoolMonth(date = new Date()) {
    const m = date.getMonth(); // 0=Jan ... 11=Dec
    return m !== 6 && m !== 7; // skip July(6) and August(7)
}

async function hasRunThisMonth(period = currentPeriod()) {
    const log = await JobLog.findOne({ where: { job_name: JOB_NAME, period } });
    return !!log;
}

// Tuition only (no zone/transport amount). Built from pre-fetched maps.
function monthlyTuitionFromCache({ classe, promotion }, priceByClass) {
    const price = priceByClass.get(classe);
    if (!price) {
        throw new Error(`no monthly Price row for class "${classe}"`);
    }

    let amount = parseFloat(price.amount);

    if (promotion === "discount_50") {
        amount = amount / 2;
    } else if (promotion === "free") {
        amount = 0;
    }

    return amount;
}

// Transport amount comes only from the zone.
function transportAmountFromCache(zone_id, zoneById) {
    const zone = zoneById.get(zone_id);
    if (!zone) {
        throw new Error(`zone ${zone_id} not found`);
    }
    return parseFloat(zone.amount);
}

async function runMonthlySubscriptionJob() {
    const schoolYear = await getActiveSchoolYear();
    if (!schoolYear) {
        console.log(`[${JOB_NAME}] skipped: no active school year (past end_date or none defined)`);
        return;
    }
    const period = currentPeriod();

    if (!isSchoolMonth()) {
        console.log(`[${JOB_NAME}] outside school year (Jul/Aug), skipping ${period}`);
        return;
    }

    // Claim the period FIRST, atomically, before touching any student data.
    try {
        await JobLog.create({ job_name: JOB_NAME, period });
    } catch (err) {
        if (err.name === "SequelizeUniqueConstraintError") {
            console.log(`[${JOB_NAME}] already ran (or running) for ${period}, skipping`);
            return;
        }
        throw err;
    }

    // Now safe — only one process can ever reach this point per period.
    const [students, allSubscriptions, allTransports, monthlyPrices, zones] = await Promise.all([
        Student.findAll(),
        Subscription.findAll({ order: [["createdAt", "DESC"]] }),
        Transport.findAll({ order: [["createdAt", "DESC"]] }),
        Price.findAll({ where: { type: "monthly" } }),
        Zone.findAll(),
    ]);

    const lastSubscriptionByStudent = new Map();
    for (const sub of allSubscriptions) {
        if (!lastSubscriptionByStudent.has(sub.student_id)) {
            lastSubscriptionByStudent.set(sub.student_id, sub);
        }
    }

    const lastTransportByStudent = new Map();
    for (const tr of allTransports) {
        if (!lastTransportByStudent.has(tr.student_id)) {
            lastTransportByStudent.set(tr.student_id, tr);
        }
    }

    const priceByClass = new Map(monthlyPrices.map(p => [p.label, p]));
    const zoneById = new Map(zones.map(z => [z.id, z]));

    let created = 0;
    let createdTransports = 0;
    let skipped = 0;
    let errors = 0;

    for (const student of students) {
        const lastSubscription = lastSubscriptionByStudent.get(student.id);
        const lastTransport = lastTransportByStudent.get(student.id);

        // ---- Tuition: monthly plan only ----
        // is_active=false + deactivated_by_break=true means paused for a holiday -> still regenerate.
        // is_active=false + deactivated_by_break=false means a real cancellation -> skip.
        let tuitionAmount = null;
        if (
            lastSubscription &&
            lastSubscription.payment_type === MONTHLY_PLAN &&
            (lastSubscription.is_active || lastSubscription.deactivated_by_break)
        ) {
            try {
                tuitionAmount = monthlyTuitionFromCache(
                    {
                        classe: student.class,
                        promotion: lastSubscription.promotion,
                    },
                    priceByClass
                );
            } catch (err) {
                console.error(`[${JOB_NAME}] pricing failed for student ${student.id} (${student.class}):`, err.message);
                errors++;
            }
        }

        // ---- Transport: ANY plan (monthly / trimestral / annual), same pause/cancel rule ----
        let transportAmount = null;
        if (lastTransport && (lastTransport.is_active || lastTransport.deactivated_by_break)) {
            try {
                transportAmount = transportAmountFromCache(lastTransport.zone_id, zoneById);
            } catch (err) {
                console.error(`[${JOB_NAME}] transport pricing failed for student ${student.id}:`, err.message);
                errors++;
            }
        }

        if (tuitionAmount === null && transportAmount === null) {
            skipped++;
            continue;
        }

        // Everything for this student is created together or not at all.
        const t = await sequelize.transaction();
        try {
            let subscription = null;

            if (tuitionAmount !== null) {
                subscription = await Subscription.create({
                    amount: tuitionAmount,
                    payment_type: MONTHLY_PLAN,
                    status: "en attente",
                    student_id: student.id,
                    promotion: lastSubscription.promotion || null,
                    is_take_book: lastSubscription.is_take_book,
                    is_take_uniform: lastSubscription.is_take_uniform,
                    period,
                }, { transaction: t });
                created++;
            }

            if (transportAmount !== null) {
                await Transport.create({
                    amount: transportAmount,
                    status: "en attente",
                    period,
                    student_id: student.id,
                    // only linked when a tuition subscription is created this month
                    subscription_id: subscription ? subscription.id : null,
                    zone_id: lastTransport.zone_id,
                }, { transaction: t });
                createdTransports++;
            }

            await t.commit();
        } catch (err) {
            await t.rollback();
            console.error(`[${JOB_NAME}] failed creating records for student ${student.id}:`, err.message);
            errors++;
            skipped++;
        }
    }

    console.log(
        `[${JOB_NAME}] created ${created} subscriptions, ${createdTransports} transports, ` +
        `skipped ${skipped}, errors ${errors} for ${period}`
    );
}

function startMonthlySubscriptionJob() {
    // run once on boot, in case a scheduled run was missed during downtime
    runMonthlySubscriptionJob().catch(err => {
        console.error(`[${JOB_NAME}] boot run failed:`, err);
    });

    cron.schedule("5 0 20 * *", () => {
        runMonthlySubscriptionJob().catch(err => {
            console.error(`[${JOB_NAME}] scheduled run failed:`, err);
        });
    });
}

module.exports = {
    runMonthlySubscriptionJob,
    startMonthlySubscriptionJob,
    hasRunThisMonth,
    currentPeriod,
    JOB_NAME
};