const ActivityLog = require("./ActivityLog");
const Group = require("./Group");
const SchoolYear = require("./SchoolYear");
const Scoring = require("./Scoring");
const Student = require("./Student");
const StudentGroup = require("./StudentGroup");
const StudentPayment = require("./StudentPayment");
const Subject = require("./Subject");
const Subscription = require("./Subscription");
const Teacher = require("./Teacher");
const TeacherPayment = require("./TeacherPayment");
const Transport = require("./Transport");
const User = require("./Users");
const Zone = require("./Zone");

Teacher.hasMany(Subject,{
    foreignKey:"teacher_id",
    as:"subject"
})
Subject.belongsTo(Teacher,{
    foreignKey:"teacher_id",
    as:"teacher"
})

Teacher.hasMany(Subject,{
    foreignKey:"teacher_id",
    as:"scoring"
})
Scoring.belongsTo(Teacher,{
    foreignKey:"teacher_id",
    as:"scoringTeacher"
})

Student.hasMany(Subscription,{
    foreignKey:"student_id",
    as:"subscriptions"
})
Subscription.belongsTo(Student,{
    foreignKey:"student_id",
    as:"student"
})

Zone.hasOne(Subscription,{
    foreignKey:"zone_id",
    as:"subscriptionZone"
})
Subscription.belongsTo(Zone,{
    foreignKey:"zone_id",
    as:"zone"
})

Subscription.hasMany(StudentPayment,{
    foreignKey:"subscription_id",
    as:"studentPayment"
})
StudentPayment.belongsTo(Subscription,{
    foreignKey:"subscription_id",
    as:"subscriptionStudentPayment"
})

Teacher.hasMany(TeacherPayment, {
    foreignKey: "teacher_id",
    as:"TeacherPayment"
});
TeacherPayment.belongsTo(Teacher, {
    foreignKey: "teacher_id",
    as: "paymentTeacher" 
});

User.hasMany(ActivityLog, {
    foreignKey: "user_id",
    as:"activityLog"
});
ActivityLog.belongsTo(User, {
    foreignKey: "user_id",
    as: "user" 
});


Student.belongsToMany(Group, {
  through: StudentGroup,
  foreignKey: 'student_id',
  otherKey: 'group_id',
});

Group.belongsToMany(Student, {
  through: StudentGroup,
  foreignKey: 'group_id',
  otherKey: 'student_id',
});

SchoolYear.hasMany(StudentGroup, {
  foreignKey: 'school_year_id',
});

StudentGroup.belongsTo(SchoolYear, {
  foreignKey: 'school_year_id',
});




Student.hasMany(Transport, { foreignKey: "student_id",as:"transport" });
Transport.belongsTo(Student, { foreignKey: "student_id",as:"student" });

Subscription.hasMany(Transport, { foreignKey: "subscription_id",as:"transport" });
Transport.belongsTo(Subscription, { foreignKey: "subscription_id",as:"subscription" });

Zone.hasMany(Transport, { foreignKey: "zone_id",as:"transport" });
Transport.belongsTo(Zone, { foreignKey: "zone_id",as:"zone" });

module.exports = {Teacher,Subject,Scoring,Student,Subscription,TeacherPayment,
                    Zone,User,StudentPayment,ActivityLog,StudentGroup,Group,Transport
                }