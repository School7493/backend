const { ActivityLog, StudentPayment, User } = require("../models");
const Student = require("../models/Student");
const Subscription = require("../models/Subscription");
const { Op, fn, col } = require("sequelize");
const { getCurrentPeriod } = require("../utils/period");


const getUser = async (req) => {
        const userId = req.userId;
        const user = await User.findByPk(userId);
        return user
}


const pad = (n) => String(n).padStart(2, "0");

exports.getAllSubscription = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 100);
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    const { search, level, status } = req.query;

    // ---- subscription filters (period keys: "YYYY-MM", "YYYY-T#", "YYYY-YYYY")
    const where = {};
    if (year && month >= 1 && month <= 12) {
      where.period = `${year}-${pad(month)}`;
    } else if (year) {
      where.period = { [Op.like]: `${year}-%` }; // whole year (monthly + trimester + yearly)
    }
    if (status) where.status = status;

    // ---- student filters
    const studentWhere = {};
    if (level) studentWhere.class = level;
    const terms = (search || "").trim().split(/\s+/).filter(Boolean);
    if (terms.length) {
      studentWhere[Op.and] = terms.map((t) => ({
        [Op.or]: [
          { name: { [Op.like]: `%${t}%` } },
          { last_name: { [Op.like]: `%${t}%` } },
        ],
      }));
    }

    const studentInclude = (attributes) => ({
      model: Student,
      as: "student",
      attributes,
      where: studentWhere,
      required: true,
    });

    // ---- paginated rows
    const { rows, count } = await Subscription.findAndCountAll({
      where,
      include: [
        studentInclude(["id", "name", "last_name", "class", "unique_id"]),
        {
          model: StudentPayment,
          as: "studentPayment",
          attributes: ["id", "amount", "date"],
          separate: true, // keeps LIMIT correct with hasMany
        },
      ],
      order: [["id", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });

    // ---- stats (same filters, whole result set, not just the page)
    const [totalPaid, unpaidCount, collectedCurrentPeriod, periods] = await Promise.all([
      Subscription.sum("amount", {
        where: { [Op.and]: [where, { status: { [Op.in]: ["payé","en attente","non payé"] } }] },
        include: [studentInclude([])],
      }),
      Subscription.count({
        where: { [Op.and]: [where, { status: "non payé" }] },
        include: [studentInclude([])],
      }),
      Subscription.sum("amount", {
        where: {
          period: getCurrentPeriod(),
          status: { [Op.in]: ["payé","en attente","non payé"] },
        },
      }),
      Subscription.findAll({
        attributes: [[fn("DISTINCT", col("period")), "period"]],
        raw: true,
      }),
    ]);

    const years = new Set(
      periods.map((p) => parseInt(String(p.period).slice(0, 4), 10)).filter(Boolean)
    );
    years.add(new Date().getFullYear());

    return res.json({
      message: "subscriptions retrieved successfully.",
      subscriptions: rows,
      pagination: { page, limit, total: count, totalPages: Math.max(Math.ceil(count / limit), 1) },
      stats: {
        totalPaid: totalPaid || 0,
        unpaidCount,
        collectedCurrentPeriod: collectedCurrentPeriod || 0,
      },
      availableYears: [...years].sort((a, b) => b - a),
    });
  } catch (error) {
    console.error("Get subscriptions error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

exports.paySubscription = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await getUser(req);

        const subscription = await Subscription.findByPk(id, {
            include: [
                {
                    model: Student,
                    as:"student",
                    attributes: ["id", "name", "last_name"],
                },
            ],
        });

        if (!subscription) {
            return res.status(404).json({
                message: "subscription not found.",
            });
        }

        // Already paid
        if (subscription.status === "payé") {
            return res.status(400).json({
                message: "subscription already paid.",
            });
        }

        await subscription.update({
            status: "payé",
        });
        await StudentPayment.create({
            amount: subscription.amount,
            date: new Date(),
            subscription_id: subscription.id,
        });

        const studentName = subscription.Student
            ? `${subscription.Student.name} ${subscription.Student.last_name}`
            : `Subscription #${subscription.id}`;

        await ActivityLog.create({
            action: "pay",
            entity_type: "subscription",
            entity_id: subscription.id,
            entity_name: studentName,
            description: `تم دفع اشتراك التلميذ ${studentName} بمبلغ ${subscription.amount}`,
            user_name: `${user.name} ${user.last_name}`,
            user_role: user.role,
            user_id: user.id,
        });

        return res.json({
            message: "subscription payed with success.",
        });

    } catch (error) {
        console.error("Pay subscription error:", error);

        return res.status(500).json({
            message: "Server error.",
        });
    }
};