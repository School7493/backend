const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const Student = require("./Student");
const Zone = require("./Zone");

const Subscription  = sequelize.define("subscriptions",{
    id:{
        type:DataTypes.BIGINT,
        primaryKey:true,
        autoIncrement:true
    },
    amount:{
        type:DataTypes.DOUBLE,
    },
    // amount already paid
    paid_amount:{
        type:DataTypes.DOUBLE,
        allowNull:false,
        defaultValue:0
    },
    // amount still to pay (computed, not stored)
    remaining_amount:{
        type:DataTypes.VIRTUAL(DataTypes.DOUBLE),
        get(){
            const total = Number(this.getDataValue("amount") ?? 0);
            const paid = Number(this.getDataValue("paid_amount") ?? 0);
            return Math.max(total - paid, 0);
        }
    },
    transport:{
        type:DataTypes.BOOLEAN
    },
    payment_type:{
        type:DataTypes.ENUM('يدفع شهريًا',
            'يدفع بالثلاثي',
            'يدفع سنويًا',
            'غير معني بالدفع'),
    },
    status:{
        type:DataTypes.ENUM("payé","en attente","non payé","partially_paid"),
        defaultValue:"payé"
    },
    is_take_book:{
        type:DataTypes.BOOLEAN
    },
    is_take_uniform:{
        type:DataTypes.BOOLEAN
    },
    promotion:{
        type:DataTypes.ENUM('discount_50','free'),
        allowNull:true,
        defaultValue:null
    },
     period:{
        type: DataTypes.STRING,
    },
    siblings_count:{
        type:DataTypes.INTEGER,
        allowNull:true
    },
        book_type: {
    type: DataTypes.ENUM('one', 'all', 'same'),
    allowNull: true,
    defaultValue: "all",
    },
    books_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    },
    student_id:{
        type:DataTypes.BIGINT,
        references:{
            model:Student,
            key:"id"
        }
    },
    zone_id:{
        type:DataTypes.BIGINT,
        references:{
            model:Zone,
            key:"id"
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
    
})
module.exports = Subscription