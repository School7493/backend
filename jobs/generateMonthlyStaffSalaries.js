const cron = require("node-cron");
const StaffSalary = require("../models/StaffSalary");
const Employ = require("../models/Employ");
const Supervisor = require("../models/Supervisor");
const Teacher = require("../models/Teacher");
const TeacherPayment = require("../models/TeacherPayment");
const JobLog = require("../models/JobLog");
const { getPayPeriodForDateOnly } = require("../services/salaryService");

const JOB_NAME = "generate_monthly_payments"; // renamed: now covers staff + teachers

const STAFF_TYPES = [
    { person_type: "employ", PersonModel: Employ },
    { person_type: "supervisor", PersonModel: Supervisor },
];

// Same Jul/Aug skip as generateMonthlySubscriptions.js — teachers aren't
// paid hourly during the school break. Staff (employ/supervisor) still runs
// year-round; adjust here if that should change.
function isSchoolMonth(date = new Date()) {
    const m = date.getMonth(); // 0=Jan ... 11=Dec
    return m !== 6 && m !== 7; // skip July(6) and August(7)
}

function periodString(date = new Date()) {
    const dateOnly = date.toISOString().slice(0, 10);
    const { month, year } = getPayPeriodForDateOnly(dateOnly);
    return { month, year, period: `${year}-${String(month).padStart(2, "0")}` };
}

async function hasRunThisMonth(period) {
    const log = await JobLog.findOne({ where: { job_name: JOB_NAME, period } });
    return !!log;
}

async function runGenerateMonthlyStaffSalariesJob() {
    const { month, year, period } = periodString();

    // Claim the period FIRST, atomically, before touching any data.
    try {
        await JobLog.create({ job_name: JOB_NAME, period });
    } catch (err) {
        if (err.name === "SequelizeUniqueConstraintError") {
            console.log(`[${JOB_NAME}] already ran for ${period}, skipping`);
            return;
        }
        throw err;
    }

    let staffCreated = 0;
    let staffSkipped = 0;

    for (const { person_type, PersonModel } of STAFF_TYPES) {
        const people = await PersonModel.findAll();

        for (const person of people) {
            const [, wasCreated] = await StaffSalary.findOrCreate({
                where: { person_type, person_id: person.id, month, year },
                defaults: {
                    base_salary: parseFloat(person.salary || 0).toFixed(2),
                    absence_days: 0,
                    unjustified_absence_days: 0,
                    status: "en attente",
                },
            });

            if (wasCreated) staffCreated++;
            else staffSkipped++;
        }
    }

    let teacherCreated = 0;
    let teacherSkipped = 0;

    if (isSchoolMonth()) {
        const teachers = await Teacher.findAll();

        for (const teacher of teachers) {
            // findOrCreate so this never clobbers a row real-time Scoring
            // hooks (recalculateMonthForTeacher) already created/updated.
            const [, wasCreated] = await TeacherPayment.findOrCreate({
                where: { teacher_id: teacher.id, month, year },
                defaults: {
                    hour_count: 0,
                    amount: 0,
                    status: "en attente",
                },
            });

            if (wasCreated) teacherCreated++;
            else teacherSkipped++;
        }
    } else {
        console.log(`[${JOB_NAME}] outside school year (Jul/Aug), skipping teacher rows for ${period}`);
    }

    console.log(
        `[${JOB_NAME}] staff: created ${staffCreated}, skipped ${staffSkipped} | ` +
        `teachers: created ${teacherCreated}, skipped ${teacherSkipped} | period ${period}`
    );
}

function startGenerateMonthlyStaffSalariesJob() {
    runGenerateMonthlyStaffSalariesJob().catch(err => {
        console.error(`[${JOB_NAME}] boot run failed:`, err);
    });

    // 20th of every month, 00:05 — matches the 20th->20th billing cycle
    cron.schedule("5 0 20 * *", () => {
        runGenerateMonthlyStaffSalariesJob().catch(err => {
            console.error(`[${JOB_NAME}] scheduled run failed:`, err);
        });
    });
}

module.exports = {
    runGenerateMonthlyStaffSalariesJob,
    startGenerateMonthlyStaffSalariesJob,
    hasRunThisMonth,
    periodString,
    JOB_NAME,
};