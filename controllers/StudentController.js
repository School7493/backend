const { validationResult, body, query } = require("express-validator");
const Student = require("../models/Student");
const { Subscription, StudentPayment, StudentGroup, Group } = require("../models");
const Price = require("../models/TuitionFee");
const Zone = require("../models/Zone");
const { Op } = require("sequelize");
const DaycareBooksFee = require("../models/DaycareBooksFee");
const ActivityLog = require("../models/ActivityLog");
const User = require("../models/Users");
const SchoolInfo = require("../models/SchoolInfo");
const SchoolYear = require("../models/SchoolYear");
const Transport = require("../models/Transport");
const Enrollment = require("../models/Enrollment");
const getUser = async (req) => {
        const userId = req.userId;
        const user = await User.findByPk(userId);
        return user
}

// Keep your existing imports at the top of the file (body, validationResult, Op,
// Student, Subscription, StudentPayment, StudentGroup, Group, SchoolYear, Price, Zone,
// DaycareBooksFee, SchoolInfo, ActivityLog, getUser ...).

// The form sends booleans as the strings "true" / "false"
// Keep your existing imports at the top of the file (body, validationResult, Op,
// Student, Subscription, StudentPayment, StudentGroup, Group, SchoolYear, Price, Zone,
// DaycareBooksFee, SchoolInfo, ActivityLog, getUser ...).

// The form sends booleans as the strings "true" / "false"
const toBool = (v) => v === true || v === "true";

// "632 145 20" -> "63214520"
const stripSpaces = (v) => (typeof v === "string" ? v.replace(/\s+/g, "") : v);

const SIXTH_YEAR = "السنة السادسة";
const SIXTH_YEAR_MODEL = "السنة السادسة نموذجي";
const SIXTH_YEAR_MODEL_GROUP_ID = 31;

exports.createStudent = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("Name is required."),

    body("last_name")
        .trim()
        .notEmpty()
        .withMessage("Last name is required."),

    body("father_name")
        .optional()
        .trim(),

    body("mother_name")
        .optional()
        .trim(),

    // the form allows spaces in phone numbers, so remove them before checking
    body("father_phone")
        .optional({ checkFalsy: true })
        .trim()
        .customSanitizer(stripSpaces)
        .matches(/^\d{8}$/)
        .withMessage("Invalid father phone number."),

    body("mother_phone")
        .optional({ checkFalsy: true })
        .trim()
        .customSanitizer(stripSpaces)
        .matches(/^\d{8}$/)
        .withMessage("Invalid mother phone number."),

    body("gender")
        .isIn(["بنت", "ولد"])
        .withMessage("Gender must be M or F."),

    body("birthday")
        .notEmpty()
        .withMessage("birthday place required.")
        .isISO8601()
        .withMessage("Invalid date of birth."),

    body("classe")
        .trim()
        .notEmpty()
        .withMessage("Class is required."),

    body("address")
        .trim()
        .notEmpty()
        .withMessage("Address is required."),

    body("promotion")
        .optional({ checkFalsy: true })
        .isIn(["discount_50", "free"])
        .withMessage("Invalid promotion type."),

    // amount paid now (only used for yearly payment, = partial payment)
    body("amount")
        .optional({ checkFalsy: true })
        .isFloat({ min: 0 })
        .withMessage("Invalid amount."),

    body("book_type")
        .optional({ checkFalsy: true })
        .isIn(["one", "all", "same"])
        .withMessage("Invalid book type."),

    // only checked when the student takes books AND the type is "same"
    body("books_count")
        .if((value, { req }) => toBool(req.body.is_take_book) && req.body.book_type === "same")
        .isInt({ min: 2, max: 20 })
        .withMessage("Books count must be between 2 and 20.")
        .toInt(),

    // a zone is required when the student takes transport
    body("zone_id")
        .if((value, { req }) => toBool(req.body.transport))
        .isInt({ min: 1 })
        .withMessage("Zone is required when transport is selected."),

    body("group_id")
        .optional({ checkFalsy: true })
        .isInt({ min: 1 })
        .withMessage("Invalid group."),

    async (req, res) => {
        try {
            const user = await getUser(req);

            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(400).json({
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const {
                name,
                last_name,
                father_name,
                mother_name,
                father_phone,
                mother_phone,
                address,
                classe,
                gender,
                birthday,
                birth_place,
                unique_id,
                transport,
                is_take_book,
                is_take_uniform,
                payment_type,
                zone_id,
                promotion,
                siblings_count,
                amount,
                book_type,
                books_count,
                group_id,
            } = req.body;

            if (unique_id != null && unique_id !== "") {
                const studentUnique = await Student.findOne({ where: { unique_id } });
                if (studentUnique) {
                    return res.status(400).json({
                        message: "unique id exist",
                    });
                }
            }

            const daycareBooksFee = await DaycareBooksFee.findOne({ where: { label: classe } });
            if (!daycareBooksFee) {
                return res.status(400).json({
                    message: "that class not exist.",
                });
            }

            // ---- normalized flags (strings from the form -> real booleans) ----
            const hasTransport = toBool(transport);
            const takesBook = toBool(is_take_book);
            const takesUniform = toBool(is_take_uniform);

            // ---- zone (transport only, checked BEFORE creating the student) ----
            let zone = null;
            if (hasTransport) {
                zone = await Zone.findByPk(zone_id);
                if (!zone) {
                    return res.status(400).json({
                        message: "that zone not exist.",
                    });
                }
            }

            // ---- books: type + count (count only exists for "same") ----
            const savedBookType = takesBook ? (book_type || null) : null;
            const isSameBooks = takesBook && savedBookType === "same";
            const savedBooksCount = isSameBooks ? parseInt(books_count, 10) : null;

            // ---- optional group (checked BEFORE creating the student) ----
            let group = null;
            let schoolYear = null;

            if (group_id) {
                group = await Group.findByPk(group_id);
                if (!group) {
                    return res.status(400).json({
                        message: "that group not exist.",
                    });
                }
                if (group.level !== classe) {
                    return res.status(400).json({
                        message: "that group does not belong to the selected class.",
                    });
                }

                const today = new Date();
                schoolYear = await SchoolYear.findOne({
                    where: {
                        start_date: { [Op.lte]: today },
                        end_date: { [Op.gte]: today },
                    },
                });
                if (!schoolYear) {
                    schoolYear = await SchoolYear.findOne({ order: [["start_date", "DESC"]] });
                }
                if (!schoolYear) {
                    return res.status(400).json({
                        message: "no school year defined.",
                    });
                }
            }

            // ---- pricing label: 6th year group "أ" uses the "نموذجي" prices ----
            const priceLabel =
                classe === SIXTH_YEAR && Number(group_id) === SIXTH_YEAR_MODEL_GROUP_ID
                    ? SIXTH_YEAR_MODEL
                    : classe;

            // ---- payment type flags (tuition only) ----
            const isYearly = payment_type === "يدفع سنويًا";

            // ---- optional custom amount = amount paid now ----
            // Partial payment is allowed ONLY for yearly payment.
            // For monthly / trimester the custom amount is ignored.
            const hasCustomAmount = amount !== undefined && amount !== null && amount !== "";
            const useCustomAmount = hasCustomAmount && isYearly;
            const customAmount = useCustomAmount ? parseFloat(amount) : null;

            if (useCustomAmount && !(customAmount > 0)) {
                return res.status(400).json({
                    message: "Paid amount must be greater than 0.",
                });
            }

            // DECIMAL comes back as a string -> parse
            //   all  -> full set price        (books)
            //   one  -> price of one book     (books_unit_price)
            //   same -> same book x its count (books_unit_price * books_count)
            const allBooksFee = parseFloat(daycareBooksFee.books) || 0;
            const unitBookFee = parseFloat(daycareBooksFee.books_unit_price) || 0;

            let bookFee = 0;
            if (takesBook && !daycareBooksFee.books_disabled) {
                if (savedBookType === "same") bookFee = unitBookFee * savedBooksCount;
                else if (savedBookType === "one") bookFee = unitBookFee;
                else bookFee = allBooksFee;
            }

            const uniformFee = takesUniform
                ? parseFloat(daycareBooksFee.uniform)
                : 0;

            const { register_fee } = (await SchoolInfo.findOne()) || {};

            // DECIMAL comes back from Sequelize as a string -> always parse
            const registerFee = parseFloat(register_fee) || 70;

            const addition = bookFee + uniformFee + registerFee;

            let totalPrice = null;
            let normalPrice = null;

            if (
                payment_type === "يدفع شهريًا" ||
                payment_type === "يدفع بالثلاثي" ||
                payment_type === "يدفع سنويًا"
            ) {
                const priceType = isYearly ? "yearly" : "monthly";

                const price = await Price.findOne({ where: { label: priceLabel, type: priceType } });
                if (!price) {
                    return res.status(400).json({
                        message: "that class not exist.",
                    });
                }

                // tuition only: transport is billed separately in `transports`
                const baseAmount = parseFloat(price.amount);

                if (isYearly) {
                    // addition already includes registerFee
                    totalPrice = baseAmount + addition;
                } else {
                    const monthlyAmount = baseAmount / 2;
                    normalPrice = baseAmount;
                    totalPrice = payment_type === "يدفع بالثلاثي"
                        ? (monthlyAmount + (baseAmount * 2)) + addition
                        : monthlyAmount + addition;
                }

                // تطبيق عرض الإخوة: الطفل الثالث 50%، الطفل الرابع مجاني بالكامل
                if (promotion === "discount_50") {
                    totalPrice = totalPrice / 2;
                } else if (promotion === "free") {
                    totalPrice = 0;
                }

                // yearly: the full price (after promotion) is what they should pay
                if (isYearly) {
                    normalPrice = totalPrice;

                    // partial payment can't be more than what they should pay
                    if (useCustomAmount && customAmount > totalPrice) {
                        return res.status(400).json({
                            message: "Paid amount cannot exceed the total amount.",
                        });
                    }
                }

            } else if (payment_type !== "غير معني بالدفع") {
                return res.status(400).json({
                    message: "Invalid payment type.",
                });
            }

            // ---- transport: always monthly (zone.amount), same promotion applies ----
            let transportAmount = 0;
            if (zone) {
                transportAmount = parseFloat(zone.amount) || 0;
                if (promotion === "discount_50") transportAmount = transportAmount / 2;
                else if (promotion === "free") transportAmount = 0;
            }

            const student = await Student.create({
                name,
                last_name,
                father_name,
                mother_name,
                father_phone,
                mother_phone,
                gender,
                birthday,
                birth_place,
                unique_id: unique_id || null, // "" would count as a duplicate of other empty ids
                class: classe,
                address,
            });

            if (group && schoolYear) {
                await StudentGroup.create({
                    student_id: student.id,
                    group_id: group.id,
                    school_year_id: schoolYear.id,
                });
            }

            const date = new Date();
            const year = date.getFullYear();
            const month = date.getMonth() + 1; // 1-indexed
            const day = date.getDate();

            const firstPeriodPass = !(month === 9 && day >= 1 && day <= 20);

            // current billing month: before the 20th it still belongs to the previous month
            let periodYear = date.getFullYear();
            let periodMonth = date.getMonth(); // 0-indexed
            if (date.getDate() < 20) {
                periodMonth -= 1;
                if (periodMonth < 0) { periodMonth = 11; periodYear -= 1; }
            }
            const period = `${periodYear}-${String(periodMonth + 1).padStart(2, "0")}`;

            // fields shared by every subscription row created below
            const subscriptionBase = {
                student_id: student.id,
                is_take_book: takesBook,
                book_type: savedBookType,
                books_count: savedBooksCount,
                is_take_uniform: takesUniform,
                payment_type,
                promotion: promotion || null,
                siblings_count: siblings_count || null,
            };

            let subscription = null;

            if (payment_type !== "غير معني بالدفع") {
                if (payment_type == "يدفع شهريًا" && firstPeriodPass) {
                    const firstSubscription = await Subscription.create({
                        ...subscriptionBase,
                        amount: totalPrice,
                        paid_amount: totalPrice,
                        period: `${year}-08`,
                    });
                    await StudentPayment.create({
                        amount: totalPrice,
                        date: new Date(),
                        subscription_id: firstSubscription.id,
                    });
                }

                // amount = what they should pay, paid = what they paid now
                let subAmount;
                let subPaid;
                let subStatus;

                if (isYearly) {
                    subAmount = totalPrice;
                    subPaid = useCustomAmount ? customAmount : totalPrice;
                    subStatus = subPaid < subAmount ? "partially_paid" : "payé";
                } else {
                    subAmount = firstPeriodPass ? normalPrice : totalPrice;
                    const isPending = payment_type == "يدفع شهريًا" && firstPeriodPass;
                    subStatus = isPending ? "en attente" : "payé";
                    subPaid = isPending ? 0 : subAmount;
                }

                subscription = await Subscription.create({
                    ...subscriptionBase,
                    amount: subAmount,
                    paid_amount: subPaid,
                    period: payment_type == "يدفع شهريًا" ? period : payment_type == "يدفع بالثلاثي" ? "2026-T1" : "2026-2027",
                    status: subStatus,
                });

                // yearly: record only what was actually paid
                await StudentPayment.create({
                    amount: isYearly ? subPaid : subAmount,
                    date: new Date(),
                    subscription_id: subscription.id,
                });
            }

            // transport row for the current month, whatever the tuition payment type
            if (zone) {
                await Transport.create({
                    student_id: student.id,
                    subscription_id: subscription ? subscription.id : null,
                    zone_id: zone.id,
                    amount: transportAmount,
                    paid_amount: 0,
                    status: transportAmount === 0 ? "payé" : "en attente",
                    period,
                });
            }
             await Enrollment.create(
        { student_id: student.id, school_year_id: schoolYear.id })

            await ActivityLog.create({
                action: "create",
                entity_type: "student",
                entity_id: student.id,
                entity_name: `${student.name} ${student.last_name}`,
                description: `تمت إضافة التلميذ ${student.name} ${student.last_name}`,
                user_name: `${user.name} ${user.last_name}`,
                user_role: user.role,
                user_id: user.id,
            });

            return res.status(201).json({
                message: "Student added successfully.",
                student,
            });

        } catch (error) {
            console.error("Create student error:", error);

            return res.status(500).json({
                message: "Server error.",
            });
        }
    }
];


exports.getAllStudents = async (req, res) => {
    try {
        const students = await Student.findAll({
            where: {
                is_deleted: false,
            },
            order: [["createdAt", "DESC"]],
            include: [
                   {
                    model: Transport,
                    as: "transport",
                    attributes: ["id", "amount", "paid_amount", "remaining_amount", "status", "zone_id"],
                    include: [{ model: Zone, as: "zone", attributes: ["id", "label"] }],
                },
                {
                    model:Group,
                    attributes: ["id", "name"],         
                    through: { attributes: ["group_id"] },
                },
                {
                    model: Subscription,
                    as: "subscriptions",
                    attributes: [
                        "id",
                        "amount", "paid_amount",         
                        "student_id",
                        "is_take_uniform",
                        "is_take_book",
                        "payment_type",
                        "promotion",
                        "siblings_count",
                    ],
                },
            ],
        });

        return res.status(200).json({
            message: "Students retrieved successfully.",
            students,
        });
    } catch (error) {
        console.error("Get students error:", error);

        return res.status(500).json({
            message: "Server error.",
        });
    }
};


exports.deleteStudents = async (req, res) => {
    try {
        const user = await getUser(req);
        const { id } = req.params;
        const student = await Student.findByPk(id);
        if (!student) {
            return res.status(404).json({
                message: "Student not found.",
            });
        }
        student.update({ is_deleted: true })
        await Subscription.update(
  { is_active: false },
  {
    where: {
      student_id: id,
      is_active: true
    }
  }
);

        await ActivityLog.create({
    action: "delete",
    entity_type: "student",
    entity_id: student.id,
    entity_name: `${student.name} ${student.last_name}`,
    description: `تم حذف التلميذ ${student.name} ${student.last_name}`,
    user_name: `${user.name} ${user.last_name}`,
    user_role: user.role,
    user_id: user.id,
});

        return res.status(200).json({
            message: "Student deleted.",
        });

    } catch (error) {
        console.error("Get students error:", error);

        return res.status(500).json({
            message: "Server error.",
        });
    }
};

exports.updateStudent = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("Name is required."),

    body("last_name")
        .trim()
        .notEmpty()
        .withMessage("Last name is required."),

    body("father_name")
        .optional()
        .trim(),

    body("mother_name")
        .optional()
        .trim(),

    body("father_phone")
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^\d{8}$/)
        .withMessage("Invalid father phone number."),

    body("mother_phone")
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^\d{8}$/)
        .withMessage("Invalid mother phone number."),

    body("gender")
        .isIn(["بنت", "ولد"])
        .withMessage("Gender must be M or F."),

    body("birthday")
        .notEmpty()
        .withMessage("Date of birth is required.")
        .isISO8601()
        .withMessage("Invalid date of birth."),

    body("classe")
        .trim()
        .notEmpty()
        .withMessage("Class is required."),

    body("address")
        .trim()
        .notEmpty()
        .withMessage("Address is required."),

    async (req, res) => {
        try {
            const user = await getUser(req);

            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(400).json({
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const {
                name,
                last_name,
                father_name,
                mother_name,
                father_phone,
                mother_phone,
                address,
                classe,
                gender,
                birthday,
                unique_id,
                is_take_book,
                is_take_uniform,
                zone_id
            } = req.body;

            const { id } = req.params;

            // Find student
            const student = await Student.findByPk(id);

            if (!student) {
                return res.status(404).json({
                    message: "Student not found.",
                });
            }

            if (unique_id) {
                const studentUnique = await Student.findOne({
                    where: {
                        unique_id,
                        id: { [Op.ne]: id }
                    }
                });

                if (studentUnique) {
                    return res.status(400).json({
                        message: "Unique ID already exists.",
                    });
                }
            }

            // Check class price
            const price = await Price.findOne({
                where: { label: classe }
            });

            if (!price) {
                return res.status(400).json({
                    message: "That class does not exist.",
                });
            }

            // Zone (added / changed / removed)
            let zone = null;
            if (zone_id) {
                zone = await Zone.findByPk(zone_id);
                if (!zone) {
                    return res.status(400).json({
                        message: "Zone not found.",
                    });
                }
            }

            const bookBool = toBool(is_take_book);
            const uniformBool = toBool(is_take_uniform);
            const transportBool = !!zone_id;

            await student.update({
                name,
                last_name,
                father_name,
                mother_name,
                father_phone,
                mother_phone,
                gender,
                birthday,
                unique_id,
                class: classe,
                address,
            });

            // All subscriptions of the student, oldest first
            const subscriptions = await Subscription.findAll({
                where: { student_id: student.id },
                order: [["id", "ASC"]],
            });

            if (subscriptions.length === 0) {
                // No subscription yet: create one with its first amount
                const schoolInfo = await SchoolInfo.findOne();
                const registerFee = parseFloat(schoolInfo?.register_fee) || 0;

                const daycareBooksFee = await DaycareBooksFee.findOne({
                    where: { label: classe }
                });

                const bookFee = (bookBool && daycareBooksFee && !daycareBooksFee.books_disabled)
                    ? parseFloat(daycareBooksFee.books) || 0
                    : 0;

                const uniformFee = (uniformBool && daycareBooksFee)
                    ? parseFloat(daycareBooksFee.uniform) || 0
                    : 0;

                const zoneAmount = zone ? parseFloat(zone.amount) || 0 : 0;

                const firstAmount =
                    (parseFloat(price.amount) + zoneAmount + bookFee + uniformFee + registerFee) / 2;

                await Subscription.create({
                    amount: firstAmount,
                    student_id: student.id,
                    transport: transportBool,
                    is_take_book: bookBool,
                    is_take_uniform: uniformBool,
                    zone_id: zone_id || null
                });
            } else {
                // The LAST (most recent) subscription gets the updates
                const last = subscriptions[subscriptions.length - 1];
                const others = subscriptions.slice(0, -1);

                // Last subscription: attributes only, amount unchanged
                await last.update({
                    transport: transportBool,
                    is_take_book: bookBool,
                    is_take_uniform: uniformBool,
                    zone_id: zone_id || null
                });

                // Older subscriptions: zone/transport only, no additions, amount unchanged
                for (const sub of others) {
                    await sub.update({
                        transport: transportBool,
                        zone_id: zone_id || null
                    });
                }
            }

            await ActivityLog.create({
                action: "update",
                entity_type: "student",
                entity_id: student.id,
                entity_name: `${student.name} ${student.last_name}`,
                description: `تم تعديل بيانات التلميذ ${student.name} ${student.last_name}`,
                user_name: `${user.name} ${user.last_name}`,
                user_role: user.role,
                user_id: user.id,
            });

            return res.status(200).json({
                message: "Student updated successfully.",
                student,
            });

        } catch (error) {
            console.error("Update student error:", error);

            return res.status(500).json({
                message: "Server error.",
            });
        }
    }
];
exports.reenrollStudent  = [
    body("type")
        .trim()
        .notEmpty()
        .withMessage("type is required."),

    async (req, res) => {
        try {
            const user = await getUser(req);

            const levels = [
    "التحضيري",
    "السنة الأولى",
    "السنة الثانية",
    "السنة الثالثة",
    "السنة الرابعة",
    "السنة الخامسة",
    "السنة السادسة",
];

            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(400).json({
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const { type } = req.body;
            const { id } = req.params;

            const student = await Student.findByPk(id);

            if (!student) {
                return res.status(404).json({
                    message: "Student not found.",
                });
            }


            // If successful, promote student to next class
            if (type === "ناجح") {
                const currentIndex = levels.indexOf(student.class);

                if (currentIndex === -1) {
                    return res.status(400).json({
                        message: `Invalid student class: ${student.class}`,
                    });
                }
                if (currentIndex < levels.length - 1) {
                    student.class = levels[currentIndex + 1];
                }
            }

            // Save changes
            await student.save();

            await ActivityLog.create({
                action: "update",
                entity_type: "student",
                entity_id: student.id,
                entity_name: `${student.name} ${student.last_name}`,
                description: `تم تسجيل نتيجة التلميذ ${student.name} ${student.last_name} كـ ${type}`,
                user_name: `${user.name} ${user.last_name}`,
                user_role: user.role,
                user_id: user.id,
            });

            return res.status(200).json({
                message: "Student registration result saved successfully.",
                student,
            });

        } catch (error) {
            console.error("Register student error:", error);

            return res.status(500).json({
                message: "Server error.",
            });
        }
    },
];


async function calculatePrice({
  classe,
  payment_type,
  transport,
  is_take_book,
  is_take_uniform,
  zone_id,
  promotion,
  book_type,
  books_count,
  group_id,
}) {
  const daycareBooksFee = await DaycareBooksFee.findOne({ where: { label: classe } });
  if (!daycareBooksFee) {
    throw { status: 400, message: "that class not exist." };
  }

  const hasTransport = toBool(transport);
  const takesBook = toBool(is_take_book);
  const takesUniform = toBool(is_take_uniform);
  const isYearly = payment_type === "يدفع سنويًا";
  const isNoPayment = payment_type === "غير معني بالدفع";

  if (
    !isNoPayment &&
    !["يدفع شهريًا", "يدفع بالثلاثي", "يدفع سنويًا"].includes(payment_type)
  ) {
    throw { status: 400, message: "Invalid payment type." };
  }

  // ---- pricing label: 6th year group "أ" uses the "نموذجي" prices ----
  const priceLabel =
    classe === SIXTH_YEAR && Number(group_id) === SIXTH_YEAR_MODEL_GROUP_ID
      ? SIXTH_YEAR_MODEL
      : classe;

  // ---- books: all / one / same (unit price x count) ----
  const savedBookType = takesBook ? (book_type || null) : null;
  const isSameBooks = takesBook && savedBookType === "same";
  const savedBooksCount = isSameBooks ? parseInt(books_count, 10) || 0 : 0;

  const allBooksFee = parseFloat(daycareBooksFee.books) || 0;
  const unitBookFee = parseFloat(daycareBooksFee.books_unit_price) || 0;

  let bookFee = 0;
  if (takesBook && !daycareBooksFee.books_disabled) {
    if (savedBookType === "same") bookFee = unitBookFee * savedBooksCount;
    else if (savedBookType === "one") bookFee = unitBookFee;
    else bookFee = allBooksFee;
  }

  const uniformFee = takesUniform ? parseFloat(daycareBooksFee.uniform) || 0 : 0;

  const { register_fee } = (await SchoolInfo.findOne()) || {};
  const registerFee = parseFloat(register_fee) || 70;

  const addition = bookFee + uniformFee + registerFee;

  // ---- transport: always monthly (zone.amount), independent of tuition payment type ----
  let zoneAmount = 0;
  if (hasTransport && zone_id) {
    const zone = await Zone.findOne({ where: { id: zone_id } });
    if (!zone) {
      throw { status: 400, message: "that zone not exist." };
    }
    zoneAmount = parseFloat(zone.amount) || 0;
  }

  const applyPromotion = (value) => {
    if (promotion === "discount_50") return value / 2;
    if (promotion === "free") return 0;
    return value;
  };

  // ---- no tuition: only transport can be due ----
  if (isNoPayment) {
    return {
      creationMonthPrice: zoneAmount > 0 ? applyPromotion(zoneAmount) : null,
      normalMonthPrice: null,
      breakdown: { addition, base: 0, zoneAmount },
    };
  }

  const priceType = isYearly ? "yearly" : "monthly";

  const price = await Price.findOne({ where: { label: priceLabel, type: priceType } });
  if (!price) {
    throw { status: 400, message: "that class not exist." };
  }

  // tuition only, transport is NOT inside it anymore
  const base = parseFloat(price.amount) || 0;

  let creationMonthPrice;
  let normalMonthPrice;

  if (isYearly) {
    // addition already includes registerFee
    const yearlyTuition = base + addition;
    creationMonthPrice = applyPromotion(yearlyTuition + zoneAmount);
    normalMonthPrice = applyPromotion(yearlyTuition);
  } else {
    // monthly: base + transport + addition (no more halving)
    // trimester: same structure as before, on tuition only
    const tuitionDue =
      payment_type === "يدفع بالثلاثي" ? base / 2 + base * 2 : base;

    creationMonthPrice = applyPromotion(tuitionDue + zoneAmount + addition);
    normalMonthPrice = base;
  }

  return {
    creationMonthPrice,
    normalMonthPrice,
    breakdown: { addition, base, zoneAmount },
  };
}

exports.previewPrice = [
  query("classe").trim().notEmpty().withMessage("Class is required."),
  query("payment_type").trim().notEmpty().withMessage("Payment type is required."),
  query("promotion")
    .optional({ checkFalsy: true })
    .isIn(["discount_50", "free"])
    .withMessage("Invalid promotion type."),
  query("book_type")
    .optional({ checkFalsy: true })
    .isIn(["one", "all", "same"])
    .withMessage("Invalid book type."),
  query("books_count")
    .if((value, { req }) => toBool(req.query.is_take_book) && req.query.book_type === "same")
    .isInt({ min: 2, max: 20 })
    .withMessage("Books count must be between 2 and 20."),
  query("group_id")
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Invalid group."),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "Validation failed", errors: errors.array() });
    }

    const {
      classe,
      payment_type,
      transport,
      is_take_book,
      is_take_uniform,
      zone_id,
      promotion,
      book_type,
      books_count,
      group_id,
    } = req.query;

    try {
      const { creationMonthPrice, normalMonthPrice, breakdown } = await calculatePrice({
        classe,
        payment_type,
        transport,
        is_take_book,
        is_take_uniform,
        zone_id,
        promotion,
        book_type,
        books_count,
        group_id,
      });

      return res.status(200).json({ creationMonthPrice, normalMonthPrice, breakdown });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ message: err.message });
      }
      console.error("Preview price error:", err);
      return res.status(500).json({ message: "Server error." });
    }
  },
];