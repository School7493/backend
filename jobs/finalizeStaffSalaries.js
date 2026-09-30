const cron = require("node-cron");
const StaffSalary = require("../models/StaffSalary");
const Employ = require("../models/Employ");
const Supervisor = require("../models/Supervisor");
const JobLog = require("../models/JobLog");
const { recalculateAbsencesForPerson, STAFF_TYPE_TO_ABSENCE_TYPE } = require("../services/staffSalaryService");
const { calculateMonthlySalaries } = require("../services/salaryService");

const JOB_NAME = "finalize_monthly_payments"; // renamed: now covers staff + teachers

const STAFF_TYPES = [
    { person_type: "employ", PersonModel: Employ },
    { person_type: "supervisor", PersonModel: Supervisor },
];

// Same window as the old salaryJob.js cron: teachers are only paid
// Sept 15 -> June 30. Kept here so it's not lost when that cron is retired.
function isWithinPayrollWindow(date) {
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();
    if (month === 9 && day >= 15) return true;
    if (month >= 10 && month <= 12) return true;
    if (month >= 1 && month <= 6) return true;
    return false;
}

// The 10th finalizes the PREVIOUS calendar-month period — same convention
// calculateMonthlySalaries() already uses by default for teachers.
function closedPeriod(date = new Date()) {
    const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    const month = prev.getMonth() + 1;
    const year = prev.getFullYear();
    return { month, year, period: `${year}-${String(month).padStart(2, "0")}` };
}

async function hasRunThisMonth(period) {
    const log = await JobLog.findOne({ where: { job_name: JOB_NAME, period } });
    return !!log;
}

async function runFinalizeStaffSalariesJob() {
    const now = new Date();
    const { month, year, period } = closedPeriod(now);

    if (await hasRunThisMonth(period)) {
        console.log(`[${JOB_NAME}] already ran for ${period}, skipping`);
        return;
    }

    // --- Staff (employé / surveillants) ---
    let recalculated = 0;
    let finalized = 0;

    for (const { person_type, PersonModel } of STAFF_TYPES) {
        const absencePersonType = STAFF_TYPE_TO_ABSENCE_TYPE[person_type];
        const people = await PersonModel.findAll();

        for (const person of people) {
            await recalculateAbsencesForPerson(person_type, person.id, month, year, absencePersonType);
            recalculated++;
        }

        // Only rows still "en attente" get locked — never overwrite a row
        // an admin already marked "payé" manually.
        const [updatedCount] = await StaffSalary.update(
            { status: "non payé" },
            { where: { person_type, month, year, status: "en attente" } }
        );
        finalized += updatedCount;
    }

    console.log(`[${JOB_NAME}] staff: recalculated ${recalculated}, finalized ${finalized} as non payé for ${period}`);

    // --- Teachers ---
    if (isWithinPayrollWindow(now)) {
        const teacherResults = await calculateMonthlySalaries(month, year);
        console.log(`[${JOB_NAME}] teachers: finalized ${teacherResults.length} as no payé for ${period}`);
    } else {
        console.log(`[${JOB_NAME}] outside payroll window (Sept 15 - June 30), skipping teachers for ${period}`);
    }

    await JobLog.create({ job_name: JOB_NAME, period });
}

function startFinalizeStaffSalariesJob() {
    runFinalizeStaffSalariesJob().catch(err => {
        console.error(`[${JOB_NAME}] boot run failed:`, err);
    });

    // 10th of every month, 00:05
    cron.schedule("5 0 10 * *", () => {
        runFinalizeStaffSalariesJob().catch(err => {
            console.error(`[${JOB_NAME}] scheduled run failed:`, err);
        });
    });
}

module.exports = {
    runFinalizeStaffSalariesJob,
    startFinalizeStaffSalariesJob,
    hasRunThisMonth,
    closedPeriod,
    JOB_NAME,
};