const { validationResult, body } = require("express-validator");
const Supervisor = require("../models/Supervisor");
const User = require("../models/Users");
const sequelize = require("../config/db");
const bcrypt = require("bcryptjs");
const ActivityLog = require("../models/ActivityLog");
const StaffSalary = require("../models/StaffSalary");
const { getPayPeriod } = require("../utils/period");
const { Op } = require("sequelize");

const getUser = async (req) => {
        const userId = req.userId;
        const user = await User.findByPk(userId);
        return user
}

exports.createSupervisors = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("Name is required."),

    body("last_name")
        .trim()
        .notEmpty()
        .withMessage("Last name is required."),

    body("phone")
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^\d{8}$/)
        .withMessage("Invalid phone number."),

    body("cin")
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^\d{8}$/)
        .withMessage("Invalid cin."),

    body("salary")
        .notEmpty()
        .withMessage("Salary is required.")
        .isNumeric()
        .withMessage("Salary must be a number.")
        .custom((value) => {
            if (Number(value) < 0) {
                throw new Error("Salary cannot be negative.");
            }
            return true;
        }),

    body("status")
        .isIn(['نشط', 'في إجازة', 'غير نشط'])
        .withMessage("Invalid teacher status."),

    body("role")
        .isIn([
            "قيم(ة)",
            "كاتب(ة)",
            "مقتصد",
            "مدير(ة)",
            "نائب مدير"
        ])
        .withMessage("Invalid role."),

    async (req, res) => {
        try {
            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(400).json({
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const user = await getUser(req);
            const {
                name,
                last_name,
                cin,
                phone,
                salary,
                status,
                role,
                email,
                password,
            } = req.body;

            const isAdminRole =
                role === "مقتصد" || role === "مدير(ة)" || role === "نائب مدير";

            if (isAdminRole && (!email || !password)) {
                return res.status(400).json({
                    message: "Email and password are required for this role.",
                });
            }

            // Check CIN and email together so both errors can be returned at once
            const duplicates = {};

            if (cin) {
                const cinSupervisor = await Supervisor.findOne({ where: { cin } });
                if (cinSupervisor) duplicates.cin = true;
            }

            if (isAdminRole) {
                const emailUser = await User.findOne({ where: { email } });
                if (emailUser) duplicates.email = true;
            }

            if (duplicates.cin || duplicates.email) {
                let message = "cin exist";
                if (duplicates.cin && duplicates.email) message = "cin and email exist";
                else if (duplicates.email) message = "email exist";

                return res.status(400).json({ message, duplicates });
            }

            let admins = null;

            if (isAdminRole) {
                const passwordHash = await bcrypt.hash(password, 10);
                admins = await User.create({
                    name,
                    email,
                    last_name,
                    password: passwordHash,
                    role,
                });
            }

            const supervisor = await Supervisor.create({
                name,
                last_name,
                cin,
                phone,
                salary,
                status,
                role,
                user_id: admins?.id ?? null,
                joined_date: new Date(), // always today, not sent by the client
            });

            // Pay period: 20th -> 20th, pay day always the 10th
            const { month, year, daysInPeriod, payDate } = getPayPeriod();

            await StaffSalary.create({
                person_type: "supervisor",
                person_id: supervisor.id,
                month,
                year,
                base_salary: salary,
                absence_days: 0,
                unjustified_absence_days: 0,
                worked_days: null, // new supervisor = full current period, no proration
                days_in_month: daysInPeriod,
                pay_date: payDate,
            });

            await ActivityLog.create({
                action: "create",
                entity_type: "supervisor",
                entity_id: supervisor.id,
                entity_name: `${supervisor.name} ${supervisor.last_name}`,
                description: `تمت إضافة المشرف ${supervisor.name} ${supervisor.last_name}`,
                user_name: `${user.name} ${user.last_name}`,
                user_role: user.role,
                user_id: user.id,
            });

            return res.status(201).json({
                message: "Supervisor added successfully.",
                supervisor,
            });

        } catch (error) {
            console.error("Create supervisor error:", error);

            return res.status(500).json({
                message: "Server error.",
            });
        }
    }
];

exports.getAllSupervisors = async (req, res) => {
    try {
        const supervisors = await Supervisor.findAll({
            where: { is_deleted: false },
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "email"], // never include password
                    required: false,             // LEFT JOIN: supervisors without a user still appear
                },
            ],
            order: [["createdAt", "DESC"]],
        });

        return res.status(200).json({
            message: "Supervisors retrieved successfully.",
            supervisors,
        });
    } catch (error) {
        console.error("Get Supervisors error:", error);
        return res.status(500).json({ message: "Server error." });
    }
};

exports.deleteSupervisor = async (req, res) => {
    try {
        const user = await getUser(req)
        const { id } = req.params;
        const supervisor = await Supervisor.findByPk(id);
        if(!supervisor){
            return res.status(404).json({
            message: "supervisor not found.",
        });
        }
        supervisor.update({is_deleted:true})

        await ActivityLog.create({
    action: "delete",
    entity_type: "supervisor",
    entity_id: supervisor.id,
    entity_name: `${supervisor.name} ${supervisor.last_name}`,
    description: `تم حذف المشرف ${supervisor.name} ${supervisor.last_name}`,
    user_name: `${user.name} ${user.last_name}`,
    user_role: user.role,
    user_id: user.id,
});

        return res.status(200).json({
            message: "supervisor deleted.",
        });

    } catch (error) {
        console.error("Get teacher error:", error);

        return res.status(500).json({
            message: "Server error.",
        });
    }
};

exports.updateSupervisor = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("Name is required."),

    body("last_name")
        .trim()
        .notEmpty()
        .withMessage("Last name is required."),

    body("cin")
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^\d{8}$/)
        .withMessage("Invalid cin."),

    body("phone")
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^\d{8}$/)
        .withMessage("Invalid phone number."),

    body("salary")
        .notEmpty()
        .withMessage("Salary is required.")
        .isNumeric()
        .withMessage("Salary must be a number.")
        .custom((value) => {
            if (Number(value) < 0) {
                throw new Error("Salary cannot be negative.");
            }
            return true;
        }),

    body("status")
        .isIn(["نشط", "في إجازة", "غير نشط"])
        .withMessage("Invalid supervisor status."),

    body("role")
        .isIn([
            'مقتصد',
            'مدير(ة)',
            'نائب مدير',
            'قيم(ة)',
            'كاتب(ة)',
        ])
        .withMessage("Invalid supervisor role."),

    async (req, res) => {
        const transaction = await sequelize.transaction();

        try {
            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                await transaction.rollback();

                return res.status(400).json({
                    message: "Validation failed",
                    errors: errors.array(),
                });
            }

            const { id } = req.params;
            const user = await getUser(req);

            const {
                name,
                last_name,
                phone,
                salary,
                date_deposited,
                status,
                role,
                cin,
                email,
                password
            } = req.body;

            // Find supervisor
            const supervisor = await Supervisor.findByPk(id, {
                transaction
            });

            if (!supervisor) {
                await transaction.rollback();

                return res.status(404).json({
                    message: "Supervisor not found."
                });
            }

            // Check duplicate CIN
            if (cin) {
                const existingSupervisor = await Supervisor.findOne({
                    where: {
                        cin,
                        id: {
                            [Op.ne]: id
                        },
                        is_deleted: false
                    },
                    transaction
                });

                if (existingSupervisor) {
                    await transaction.rollback();

                    return res.status(400).json({
                        message: "CIN already exists."
                    });
                }
            }

            // Update supervisor
            await supervisor.update(
                {
                    name,
                    last_name,
                    phone,
                    cin,
                    salary,
                    date_deposited,
                    status,
                    role
                },
                { transaction }
            );

            /*
             * If supervisor is "متصرف",
             * create/update the User account
             */
            if (role === "متصرف") {

                if (supervisor.user_id) {

                    const supervisorUser = await User.findByPk(
                        supervisor.user_id,
                        { transaction }
                    );

                    if (supervisorUser) {
                        const userData = {
                            name,
                            last_name,
                            phone,
                            email
                        };

                        // Hash password only if changed/provided
                        if (password) {
                            userData.password = await bcrypt.hash(
                                password,
                                10
                            );
                        }

                        await supervisorUser.update(
                            userData,
                            { transaction }
                        );
                    }

                } else {

                    // Create User account
                    const passwordHash = password
                        ? await bcrypt.hash(password, 10)
                        : null;

                    const newUser = await User.create(
                        {
                            name,
                            last_name,
                            phone,
                            email,
                            password: passwordHash,
                            role: "متصرف"
                        },
                        { transaction }
                    );

                    // Link user to supervisor
                    await supervisor.update(
                        {
                            user_id: newUser.id
                        },
                        { transaction }
                    );
                }
            }

            // Activity Log
            await ActivityLog.create(
                {
                    action: "update",
                    entity_type: "supervisor",
                    entity_id: supervisor.id,
                    entity_name: `${supervisor.name} ${supervisor.last_name}`,
                    description: `تم تعديل بيانات المشرف ${supervisor.name} ${supervisor.last_name}`,
                    user_name: `${user.name} ${user.last_name}`,
                    user_role: user.role,
                    user_id: user.id,
                },
                { transaction }
            );

            await transaction.commit();

            return res.status(200).json({
                message: "Supervisor updated successfully.",
                supervisor
            });

        } catch (error) {

            await transaction.rollback();

            console.error("Update supervisor error:", error);

            return res.status(500).json({
                message: "Server error."
            });
        }
    }
];
