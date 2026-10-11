const express = require("express");
require("dotenv").config();
const cors = require("cors");
const sequelize = require("./config/db");
const app = express();
const appStart = require("./app");
require("./models/index")
const startScheduler = require("./jobs/scheduler");
const startSalaryJob = require("./jobs/salaryJob");
const { startMonthlySubscriptionJob } = require("./jobs/generateMonthlySubscriptions");
const { startTrimesterSubscriptionJob  } = require("./jobs/generateTrimesterSubscriptions");
const { startMarkUnpaidSubscriptionsJob  } = require("./jobs/MarkUnpaidSubscriptions");
const { startGenerateMonthlyStaffSalariesJob } = require("./jobs/generateMonthlyStaffSalaries");
const { startFinalizeStaffSalariesJob } = require("./jobs/finalizeStaffSalaries");
const { startSummerBreakSubscriptionJob } = require("./jobs/summerBreakSubscriptionJob");


const port = process.env.PORT || 5000;

sequelize.authenticate()
  .then(() => {
    console.log("✅ Neon PostgreSQL connected");
    sequelize.sync({alter:true})
    console.log("✅ Database synchronized");
  })
  
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
  });
app.use(express.json());
app.use(cors());

app.use("/api/v1", appStart);


app.listen(port, async () => {
  console.log(`Server started on port ${port}`);
  startSalaryJob()
    startMonthlySubscriptionJob();
    startTrimesterSubscriptionJob ()
    startMarkUnpaidSubscriptionsJob()
    startGenerateMonthlyStaffSalariesJob()
    startFinalizeStaffSalariesJob()
    startSummerBreakSubscriptionJob()
});
