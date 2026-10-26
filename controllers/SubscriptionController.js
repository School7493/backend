const { ActivityLog, StudentPayment, User, Transport } = require("../models");
const Student = require("../models/Student");
const Subscription = require("../models/Subscription");
const { Op, fn, col } = require("sequelize");
const { getCurrentPeriod } = require("../utils/period");
const sequelize = require("../config/db");


const getUser = async (req) => {
        const userId = req.userId;
        const user = await User.findByPk(userId);
        return user
}

const pad = (n) => String(n).padStart(2, "0");
const sumSubscriptions = async (field, where, studentInclude) => {
  const row = await Subscription.findOne({
    attributes: [[fn("COALESCE", fn("SUM", col(`subscriptions.${field}`)), 0), "total"]],
    where,
    include: studentInclude ? [studentInclude] : [],
    raw: true,
  });
  return Number(row?.total || 0);
};

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
      where.period = { [Op.like]: `${year}-%` };
    }
    if (status) where.status = status; // payé | en attente | non payé | partially_paid

    // ---- AND conditions (hide "not concerned with payment" + search)
    const andConditions = [
      {
        [Op.or]: [
          { payment_type: { [Op.ne]: "غير معني بالدفع" } },
          { payment_type: null },
        ],
      },
    ];

    // ---- search: student name / last_name / unique_id / subscription id
    const terms = (search || "").trim().split(/\s+/).filter(Boolean);
    terms.forEach((t) => {
      const conditions = [
        { "$student.name$": { [Op.like]: `%${t}%` } },
        { "$student.last_name$": { [Op.like]: `%${t}%` } },
        { "$student.unique_id$": { [Op.like]: `%${t}%` } },
      ];
      const idMatch = t.replace(/^#/, "");
      if (/^\d+$/.test(idMatch)) {
        conditions.push({ id: parseInt(idMatch, 10) });
      }
      andConditions.push({ [Op.or]: conditions });
    });

    where[Op.and] = andConditions;

    // ---- student filters
    const studentWhere = {};
    if (level) studentWhere.class = level;

    const studentInclude = (attributes) => ({
      model: Student,
      as: "student",
      attributes,
      where: studentWhere,
      required: true,
    });

    const TransportInclude = (attributes) => ({
      model: Transport,
      as: "transport",
      attributes,
      required: false,
    });

    // ---- paginated rows
    const { rows, count } = await Subscription.findAndCountAll({
      where,
      include: [
        studentInclude(["id", "name", "last_name", "class", "unique_id"]),
        {
          ...TransportInclude([
            "id",
            "amount",
            "paid_amount",
            "status",
            "period",
            "subscription_id", // required for separate: true
          ]),
          separate: true, // lets us order the transport rows themselves
          order: [["period", "ASC"]], // oldest period first; use "DESC" for newest first
        },
        {
          model: StudentPayment,
          as: "studentPayment",
          attributes: ["id", "subscription_id", "amount", "type", "date"],
          separate: true, // keeps LIMIT correct with hasMany
        },
      ],
      order: [["id", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });

    // ---- stats (same filters, whole result set, not just the page)
    const [
      totalAmount,
      totalPaid,
      unpaidCount,
      partiallyPaidCount,
      collectedCurrentPeriod,
      periods,
    ] = await Promise.all([
      sumSubscriptions("amount", where, studentInclude([])),
      sumSubscriptions("paid_amount", where, studentInclude([])),
      Subscription.count({
        where: { [Op.and]: [where, { status: "non payé" }] },
        include: [studentInclude([])],
        distinct: true,
      }),
      Subscription.count({
        where: { [Op.and]: [where, { status: "partially_paid" }] },
        include: [studentInclude([])],
        distinct: true,
      }),
      // money actually collected for the current period (ignores filters)
      sumSubscriptions("paid_amount", { period: getCurrentPeriod() }, null),
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
      // each row now includes paid_amount and remaining_amount (virtual)
      subscriptions: rows,
      pagination: { page, limit, total: count, totalPages: Math.max(Math.ceil(count / limit), 1) },
      stats: {
        totalAmount,                                   // total due
        totalPaid,                                     // sum of paid_amount
        totalRemaining: Math.max(totalAmount - totalPaid, 0),
        unpaidCount,                                   // status "non payé"
        partiallyPaidCount,                            // status "partially_paid"
        collectedCurrentPeriod,
      },
      availableYears: [...years].sort((a, b) => b - a),
    });
  } catch (error) {
    console.error("Get subscriptions error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};
const round3 = (n) => Math.round(Number(n) * 1000) / 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Shared logic: records a payment of `payAmount` on a subscription
async function applyPayment({ id, payAmount, user }) {
  return sequelize.transaction(async (t) => {
    // Lock the row so two requests can't pay at the same time
    // (no include here: FOR UPDATE can't be used with a LEFT JOIN)
    const subscription = await Subscription.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!subscription) throw new HttpError(404, "subscription not found.");
    if (subscription.status === "payé") {
      throw new HttpError(400, "subscription already paid.");
    }
    if (subscription.status === "en attente") {
      throw new HttpError(400, "subscription is pending and cannot be paid yet.");
    }

    const total = round3(subscription.amount);
    const alreadyPaid = round3(subscription.paid_amount ?? 0);
    const remaining = round3(total - alreadyPaid);

    // payAmount === null means "pay everything that remains"
    const amountToPay = payAmount === null ? remaining : round3(payAmount);

    if (!Number.isFinite(amountToPay) || amountToPay <= 0) {
      throw new HttpError(400, "invalid amount.");
    }
    if (amountToPay > remaining) {
      throw new HttpError(400, `amount exceeds remaining (${remaining}).`);
    }

    const newPaid = round3(alreadyPaid + amountToPay);
    const newRemaining = round3(total - newPaid);
    const isFullyPaid = newRemaining <= 0;

    await subscription.update(
      {
        paid_amount: newPaid,
        // only keep this line if remaining_amount is a real column (not a virtual getter)
        remaining_amount: newRemaining,
        status: isFullyPaid ? "payé" : "partially_paid",
      },
      { transaction: t }
    );

    await StudentPayment.create(
      {
        amount: amountToPay,
        date: new Date(),
        subscription_id: subscription.id,
      },
      { transaction: t }
    );

    const student = await Student.findByPk(subscription.student_id, {
      attributes: ["id", "name", "last_name"],
      transaction: t,
    });

    const studentName = student
      ? `${student.name} ${student.last_name}`
      : `Subscription #${subscription.id}`;

    await ActivityLog.create(
      {
        action: "pay",
        entity_type: "subscription",
        entity_id: subscription.id,
        entity_name: studentName,
        description: isFullyPaid
          ? `تم دفع اشتراك التلميذ ${studentName} بمبلغ ${amountToPay}`
          : `تم دفع جزء من اشتراك التلميذ ${studentName} بمبلغ ${amountToPay} (المتبقي ${newRemaining})`,
        user_name: `${user.name} ${user.last_name}`,
        user_role: user.role,
        user_id: user.id,
      },
      { transaction: t }
    );

    return { paid_amount: newPaid, remaining_amount: newRemaining, status: subscription.status };
  });
}

function handleError(res, error, label) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(label, error);
  return res.status(500).json({ message: "Server error." });
}

// POST /subscription/:id/pay  -> pays everything that remains
exports.paySubscription = async (req, res) => {
  try {
    const user = await getUser(req);
    const result = await applyPayment({
      id: req.params.id,
      payAmount: null,
      user,
    });
    return res.json({ message: "subscription payed with success.", ...result });
  } catch (error) {
    return handleError(res, error, "Pay subscription error:");
  }
};

// POST /subscription/:id/pay-partial  body: { amount }
exports.payPartialSubscription = async (req, res) => {
  try {
    const user = await getUser(req);
    const amount = Number(req.body?.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "invalid amount." });
    }

    const result = await applyPayment({
      id: req.params.id,
      payAmount: amount,
      user,
    });
    return res.json({ message: "payment recorded with success.", ...result });
  } catch (error) {
    return handleError(res, error, "Partial pay subscription error:");
  }
};

exports.payTransport = async (req, res) => {
  try {
    const user = await getUser(req);

    const result = await sequelize.transaction(async (t) => {
      // lock the row so a double click can't create two payments
      const transport = await Transport.findByPk(req.params.id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!transport) throw new HttpError(404, "transport not found.");
      if (transport.status === "payé") {
        throw new HttpError(400, "transport already paid.");
      }

      const total = round3(transport.amount);
      const alreadyPaid = round3(transport.paid_amount ?? 0);
      const amountToPay = round3(total - alreadyPaid);

      if (amountToPay <= 0) {
        throw new HttpError(400, "nothing left to pay.");
      }

      await transport.update(
        { paid_amount: total, status: "payé" },
        { transaction: t }
      );

      await StudentPayment.create(
        {
          amount: amountToPay,
          type: "transport",
          date: new Date(),
          subscription_id: transport.subscription_id,
        },
        { transaction: t }
      );

      // name for the activity log
      const subscription = await Subscription.findByPk(transport.subscription_id, {
        attributes: ["id", "student_id"],
        transaction: t,
      });
      const student = subscription
        ? await Student.findByPk(subscription.student_id, {
            attributes: ["id", "name", "last_name"],
            transaction: t,
          })
        : null;

      const studentName = student
        ? `${student.name} ${student.last_name}`
        : `Transport #${transport.id}`;

      await ActivityLog.create(
        {
          action: "pay",
          entity_type: "transport",
          entity_id: transport.id,
          entity_name: studentName,
          description: `تم دفع مصاريف النقل للتلميذ ${studentName} بمبلغ ${amountToPay}`,
          user_name: `${user.name} ${user.last_name}`,
          user_role: user.role,
          user_id: user.id,
        },
        { transaction: t }
      );

      return { paid_amount: total, status: "payé" };
    });

    return res.json({ message: "transport payed with success.", ...result });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Pay transport error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};