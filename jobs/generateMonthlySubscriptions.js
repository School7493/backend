// jobs/generateMonthlySubscriptions.js
const cron = require("node-cron");
const Student = require("../models/Student");
const Subscription = require("../models/Subscription");
const JobLog = require("../models/JobLog");
const Price = require("../models/TuitionFee");
const Zone = require("../models/Zone");

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

// Same math as calculatePrice's "normalMonthPrice" branch for the monthly plan,
// but built from pre-fetched maps instead of hitting the DB per student.
function normalMonthPriceFromCache({ classe, zone_id, promotion }, priceByClass, zoneById) {
    const price = priceByClass.get(classe);
    if (!price) {
        throw new Error(`no monthly Price row for class "${classe}"`);
    }

    let zoneAmount = 0;
    if (zone_id) {
        const zone = zoneById.get(zone_id);
        if (!zone) {
            throw new Error(`zone ${zone_id} not found`);
        }
        zoneAmount = parseFloat(zone.amount);
    }

    const baseAmount = parseFloat(price.amount) + zoneAmount;
    let normalMonthPrice = baseAmount; // monthly plan, no addition on recurring months

    if (promotion === "discount_50") {
        normalMonthPrice = normalMonthPrice / 2;
    } else if (promotion === "free") {
        normalMonthPrice = 0;
    }

    return normalMonthPrice;
}

async function runMonthlySubscriptionJob() {
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
    const [students, allSubscriptions, monthlyPrices, zones] = await Promise.all([
        Student.findAll(),
        Subscription.findAll({ order: [["createdAt", "DESC"]] }),
        Price.findAll({ where: { type: "monthly" } }),
        Zone.findAll(),
    ]);

    const lastSubscriptionByStudent = new Map();
    for (const sub of allSubscriptions) {
        if (!lastSubscriptionByStudent.has(sub.student_id)) {
            lastSubscriptionByStudent.set(sub.student_id, sub);
        }
    }

    const priceByClass = new Map(monthlyPrices.map(p => [p.label, p]));
    const zoneById = new Map(zones.map(z => [z.id, z]));

    let created = 0;
    let skipped = 0;

    for (const student of students) {
        const lastSubscription = lastSubscriptionByStudent.get(student.id);

        if (!lastSubscription) {
            skipped++;
            continue;
        }

        if (lastSubscription.payment_type !== MONTHLY_PLAN) {
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

        let normalMonthPrice;
        try {
            normalMonthPrice = normalMonthPriceFromCache(
                {
                    classe: student.class,
                    zone_id: lastSubscription.zone_id,
                    promotion: lastSubscription.promotion,
                },
                priceByClass,
                zoneById
            );
        } catch (err) {
            console.error(`[${JOB_NAME}] pricing failed for student ${student.id} (${student.class}):`, err.message);
            skipped++;
            continue;
        }

        await Subscription.create({
            amount: normalMonthPrice,
            transport: !!lastSubscription.transport,
            payment_type: MONTHLY_PLAN,
            status: "en attente",
            student_id: student.id,
            zone_id: lastSubscription.zone_id || null,
            promotion: lastSubscription.promotion || null,
            is_take_book: lastSubscription.is_take_book,
            is_take_uniform: lastSubscription.is_take_uniform,
            period,
        });

        created++;
    }

    console.log(`[${JOB_NAME}] created ${created} subscriptions, skipped ${skipped} for ${period}`);
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