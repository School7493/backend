const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const Student = require("./Student");
const Zone = require("./Zone");
const Subscription = require("./Subscription");

const Transport = sequelize.define("transports", {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
    },
    amount: {
        type: DataTypes.DOUBLE,
    },
    paid_amount: {
        type: DataTypes.DOUBLE,
        allowNull: false,
        defaultValue: 0
    },
    remaining_amount: {
        type: DataTypes.VIRTUAL(DataTypes.DOUBLE),
        get() {
            const total = Number(this.getDataValue("amount") ?? 0);
            const paid = Number(this.getDataValue("paid_amount") ?? 0);
            return Math.max(total - paid, 0);
        }
    },
    status: {
        type: DataTypes.ENUM("payé", "en attente", "non payé", "partially_paid"),
        defaultValue: "non payé"
    },
    period: {
        type: DataTypes.STRING,
    },
    student_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
            model: Student,
            key: "id"
        }
    },
    // optional link to the tuition subscription it belongs to
    subscription_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
            model: Subscription,
            key: "id"
        }
    },
    zone_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
            model: Zone,
            key: "id"
        }
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    deactivated_by_break: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
});

module.exports = Transport;