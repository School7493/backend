const { Student, Subscription, Zone, TeacherPayment } = require("../models");
const ExcelJS = require("exceljs");
const puppeteer = require("puppeteer");
const { getDetailedReportData } = require("../services/reportService");
const { buildPdfReport } = require("../services/pdfReport");
const { getYearPeriods } = require("../utils/period");
const StaffPayment = require("../models/StaffPayment");
const Purchase = require("../models/Purchase");
const Bill = require("../models/Bill"); // adjust path if needed
const { buildExcelReport } = require("../services/excelReport");

// Translate stored gender codes to Arabic display text if needed
function genderLabel(g) {
    if (g === "ولد" || g === "بنت") return g; // already Arabic
    if (g === "male" || g === "M") return "ذكر";
    if (g === "female" || g === "F") return "أنثى";
    return g || "";
}

// Translate boolean values to Arabic Yes/No
function boolLabel(v) {
    if (v === true) return "نعم";
    if (v === false) return "لا";
    return "";
}

// Translate stored payment status (French enum values) to Arabic display text
function statusLabel(s) {
    if (s === "payé") return "مدفوع";
    if (s === "en attente") return "في الانتظار";
    if (s === "non payé") return "غير مدفوع";
    return s || "";
}

// Format money
function amountLabel(v) {
    if (v === null || v === undefined) return "";
    return Number(v).toFixed(2);
}

// Escape values before injecting into HTML
function esc(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Pick the student's latest subscription (the query includes `subscriptions`, a list)
function getLatestSubscription(student) {
    const subs = Array.isArray(student.subscriptions)
        ? student.subscriptions
        : student.subscription
            ? [student.subscription]
            : [];

    if (subs.length === 0) return null;

    return [...subs].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    )[0];
}

// Pull subscription-related fields out of a student in one place,
// so both the PDF and Excel builders stay in sync.
function getSubscriptionFields(student) {
    const sub = getLatestSubscription(student);

    return {
        paymentType: sub?.payment_type || "",
        status: sub ? statusLabel(sub.status) : "",
        amount: amountLabel(sub?.amount),
        transport: sub ? boolLabel(sub.transport) : "",
        book: sub ? boolLabel(sub.is_take_book) : "",
        uniform: sub ? boolLabel(sub.is_take_uniform) : "",
        promotion: sub?.promotion || "",
        zone: sub?.zone?.label || sub?.zone?.zone_label || "",
    };
}

function buildStudentsHtml({ students, level }) {
    const rows = students
        .map((student, index) => {
            const birthday = student.birthday
                ? new Date(student.birthday).toLocaleDateString("fr-FR")
                : "";
            const phone = student.father_phone || student.mother_phone || "";
            const sub = getSubscriptionFields(student);

            return `
                <tr class="${index % 2 === 0 ? "row-alt" : ""}">
                    <td class="col-num">${index + 1}</td>
                    <td>${esc(student.last_name)}</td>
                    <td>${esc(student.name)}</td>
                    <td class="col-center">${esc(genderLabel(student.gender))}</td>
                    <td class="col-center">${esc(birthday)}</td>
                    <td class="col-center">${esc(student.class)}</td>
                    <td class="col-center">${esc(phone)}</td>
                    <td>${esc(student.address)}</td>
                    <td class="col-center">${esc(sub.paymentType)}</td>
                    <td class="col-center">${esc(sub.status)}</td>
                    <td class="col-center">${esc(sub.amount)}</td>
                    <td class="col-center">${esc(sub.transport)}</td>
                    <td class="col-center">${esc(sub.book)}</td>
                    <td class="col-center">${esc(sub.uniform)}</td>
                    <td class="col-center">${esc(sub.zone)}</td>
                </tr>
            `;
        })
        .join("");

    return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
    <meta charset="UTF-8" />
    <style>
        @font-face {
            font-family: 'Cairo';
            src: local('Cairo');
        }

        * { box-sizing: border-box; }

        body {
            font-family: 'Cairo', 'Amiri', 'Segoe UI', Tahoma, sans-serif;
            margin: 0;
            padding: 24px 30px;
            color: #0F172A;
            direction: rtl;
        }

        .header {
            background: #1E293B;
            color: #FFFFFF;
            border-radius: 10px;
            padding: 18px 20px;
            text-align: center;
            margin-bottom: 16px;
        }

        .header h1 {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
        }

        .meta-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #64748B;
            margin-bottom: 12px;
            padding: 0 4px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
        }

        thead tr {
            background: #1E293B;
            color: #FFFFFF;
        }

        th, td {
            padding: 6px 4px;
            text-align: right;
            border: 0.5px solid #CBD5E1;
        }

        th {
            font-weight: 600;
            text-align: center;
        }

        .col-center { text-align: center; }
        .col-num { text-align: center; width: 26px; color: #64748B; }

        tr.row-alt td {
            background: #F1F5F9;
        }
    </style>
    </head>
    <body>
        <div class="header">
            <h1>لائحة التلاميذ</h1>
        </div>

        <div class="meta-row">
            <span>${level ? `القسم: ${esc(level)}` : "جميع الأقسام"}</span>
            <span>عدد التلاميذ: ${students.length}</span>
        </div>

        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>اللقب</th>
                    <th>الاسم</th>
                    <th>الجنس</th>
                    <th>تاريخ الميلاد</th>
                    <th>القسم</th>
                    <th>الهاتف</th>
                    <th>العنوان</th>
                    <th>نوع الدفع</th>
                    <th>حالة الدفع</th>
                    <th>المبلغ</th>
                    <th>النقل</th>
                    <th>الكتاب</th>
                    <th>الزي</th>
                    <th>المنطقة</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    </body>
    </html>
    `;
}

async function buildStudentsExcel({ students, level }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "School Management System";

    const sheet = workbook.addWorksheet("التلاميذ", {
        views: [{ rightToLeft: true }],
    });

    sheet.addRow([level ? `لائحة التلاميذ - ${level}` : "لائحة التلاميذ"]).font = { bold: true, size: 14 };
    sheet.addRow([`عدد التلاميذ: ${students.length}`]);
    sheet.addRow([]);

    const header = sheet.addRow([
        "#", "اللقب", "الاسم", "الجنس", "تاريخ الميلاد", "القسم", "الهاتف", "العنوان",
        "نوع الدفع", "حالة الدفع", "المبلغ", "النقل", "الكتاب", "الزي", "المنطقة",
    ]);
    header.font = { bold: true };

    students.forEach((student, index) => {
        const birthday = student.birthday
            ? new Date(student.birthday).toLocaleDateString("fr-FR")
            : "";
        const phone = student.father_phone || student.mother_phone || "";
        const sub = getSubscriptionFields(student);

        sheet.addRow([
            index + 1,
            student.last_name || "",
            student.name || "",
            genderLabel(student.gender),
            birthday,
            student.class || "",
            phone,
            student.address || "",
            sub.paymentType,
            sub.status,
            sub.amount,
            sub.transport,
            sub.book,
            sub.uniform,
            sub.zone,
        ]);
    });

    sheet.columns.forEach((c) => (c.width = 18));

    return workbook.xlsx.writeBuffer();
}

function buildStudentsDisposition(rawName, ext) {
    // ASCII-only fallback: strip everything that is not A-Z a-z 0-9 _ -
    const ascii =
        rawName
            .replace(/[^\x20-\x7E]/g, "")
            .replace(/[^A-Za-z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "") || "students";
    const encoded = encodeURIComponent(`${rawName}.${ext}`);
    return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encoded}`;
}

exports.exportStudents = async (req, res) => {
    try {
        const { format, level } = req.query;

        if (!["pdf", "excel"].includes(format)) {
            return res.status(400).json({
                success: false,
                message: "Format must be pdf or excel.",
            });
        }

        const where = { is_deleted: false };
        if (level && level.trim() !== "") {
            where.class = level;
        }

        const students = await Student.findAll({
            where,
            include: [
                {
                    model: Subscription,
                    as: "subscriptions",
                    include: [
                        {
                            model: Zone,
                            as: "zone",
                        },
                    ],
                },
            ],
            order: [
                ["last_name", "ASC"],
                ["name", "ASC"],
            ],
        });

        const rawFilename = `لائحة-التلاميذ${level ? `-${level}` : ""}`;

        // =========================
        // PDF (Puppeteer)
        // =========================
        if (format === "pdf") {
            const html = buildStudentsHtml({ students, level });

            const browser = await puppeteer.launch({
                headless: "new",
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--no-zygote",
                ],
                timeout: 60000,
            });

            try {
                const page = await browser.newPage();
                page.setDefaultTimeout(60000);
                await page.setContent(html, { waitUntil: "load", timeout: 60000 });

                const pdfBuffer = await page.pdf({
                    format: "A4",
                    landscape: true,
                    printBackground: true,
                    margin: { top: "20px", bottom: "30px", left: "20px", right: "20px" },
                });

                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", buildStudentsDisposition(rawFilename, "pdf"));

                return res.send(Buffer.from(pdfBuffer));
            } finally {
                await browser.close();
            }
        }

        // =========================
        // EXCEL
        // =========================
        const buffer = await buildStudentsExcel({ students, level });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", buildStudentsDisposition(rawFilename, "xlsx"));

        return res.send(buffer);
    } catch (error) {
        console.error("Export students error:", error);
        return res.status(500).json({
            success: false,
            message: "Erreur lors de l'exportation des élèves.",
            error: error.message,
        });
    }
};

exports.downloadReport = async (req, res) => {
    try {
        const { year, month, type } = req.query;
        const yearNum = parseInt(year, 10);

        if (!yearNum || !type) {
            return res.status(400).json({ message: "year و type مطلوبين" });
        }

        const periods = await getDetailedReportData({ year: yearNum, month });
        const isAll = month === "all" || !month;
        const rawLabel = isAll ? `full-${yearNum}` : `${periods[0].label}-${yearNum}`;

        const buildDisposition = (ext) => {
            const asciiFallback = `report-${yearNum}.${ext}`;
            const encoded = encodeURIComponent(`report-${rawLabel}.${ext}`);
            return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
        };

        if (type === "excel") {
            const buffer = await buildExcelReport(periods);
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", buildDisposition("xlsx"));
            return res.send(buffer);
        }

        if (type === "pdf") {
            const buffer = await buildPdfReport(periods);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", buildDisposition("pdf"));
            return res.send(buffer);
        }

        return res.status(400).json({ message: "type غير صالح (pdf أو excel)" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "خطأ في إنشاء التقرير", error: error.message });
    }
};

async function getEarliestDataDate() {
    const [subMin, staffMin, teacherMin, purchaseMin, billMin] = await Promise.all([
        Subscription.min("createdAt"),
        StaffPayment.min("createdAt"),
        TeacherPayment.min("createdAt"),
        Purchase.min("createdAt"),
        Bill.min("bill_date"),
    ]);
    const dates = [subMin, staffMin, teacherMin, purchaseMin, billMin].filter(Boolean);
    if (!dates.length) return null;
    return new Date(Math.min(...dates.map((d) => new Date(d).getTime())));
}

exports.getAvailableReportPeriods = async (req, res) => {
    try {
        const earliest = await getEarliestDataDate();
        if (!earliest) return res.json({ years: [] });

        const now = new Date();
        const years = [];

        for (let year = earliest.getFullYear(); year <= now.getFullYear(); year++) {
            const monthsWithData = getYearPeriods(year)
                .filter((p) => p.start < now && p.end > earliest)
                .map((p) => ({ value: String(p.month).padStart(2, "0"), label: p.label }));

            if (monthsWithData.length) years.push({ year, months: monthsWithData });
        }

        return res.json({ years });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "خطأ في جلب الفترات المتاحة", error: error.message });
    }
};