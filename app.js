const express = require("express");
const router = express.Router()
const AuthRouter = require("./routers/AuthRouter")
const StudentRouter = require("./routers/StudentRouter")
const TeacherRouter = require("./routers/TeacherRouter")
const SupervisorRouter = require("./routers/SupervisorRouter")
const EmployRouter = require("./routers/EmployRouter")
const AbsenceRouter = require("./routers/AbsenceRouter")
const ScoringRouter = require("./routers/ScoringRouter")
const SubscriptionRouter = require("./routers/SubscriptionRouter")
const PriceRouter = require("./routers/PriceRouter")
const ZoneRouter = require("./routers/ZoneRouter")
const TeacherPaymentRoutes = require("./routers/TeacherPaymentRoutes")
const DashboardRouter = require("./routers/DashboardRouter")
const PurchaseRouter = require("./routers/PurchaseRouter")
const SchoolInfoRouter = require("./routers/SchoolInfoRouter")
const DownloadRouter = require("./routers/DownloadRouter")
const DaycareBooksFee = require("./routers/DaycareBooksFee");
const activityLogRoutes = require("./routers/activityLogRoutes");
const StaffPaymentRouter = require("./routers/StaffPaymentRouter");
const SchoolYearRouter = require("./routers/SchoolYearRouter");
const HolidayRouter = require("./routers/HolidayRouter");
const GroupRouter = require("./routers/GroupRouter");
const StudentGroupRoutes = require("./routers/StudentGroupRoutes");
const BillRouter = require("./routers/BillRouter");



const AuthenticateToken = require("./middlewares/AuthenticateToken");

router.use("/auth",AuthRouter)
router.use("/student",AuthenticateToken,StudentRouter)
router.use("/teacher",AuthenticateToken,TeacherRouter)
router.use("/supervisor",AuthenticateToken,SupervisorRouter)
router.use("/employ",AuthenticateToken,EmployRouter)
router.use("/absence",AuthenticateToken,AbsenceRouter)
router.use("/scoring",AuthenticateToken,ScoringRouter)
router.use("/subscription",AuthenticateToken,SubscriptionRouter)
router.use("/price",AuthenticateToken,PriceRouter)
router.use("/zone",AuthenticateToken,ZoneRouter)
router.use("/teacher-payments",AuthenticateToken,TeacherPaymentRoutes)
router.use("/dashboard",DashboardRouter)
router.use("/purchase",AuthenticateToken,PurchaseRouter)
router.use("/school-info",AuthenticateToken,SchoolInfoRouter)
router.use("/download",DownloadRouter)
router.use("/daycare-books-fee",AuthenticateToken,DaycareBooksFee)
router.use("/activity-logs",AuthenticateToken ,activityLogRoutes);
router.use("/staff-payment", AuthenticateToken ,StaffPaymentRouter);
router.use("/school-year",AuthenticateToken,SchoolYearRouter)
router.use("/holiday",AuthenticateToken,HolidayRouter)
router.use("/group",AuthenticateToken,GroupRouter)
router.use("/student-group",AuthenticateToken,StudentGroupRoutes)
router.use("/bill",AuthenticateToken,BillRouter)




module.exports = router