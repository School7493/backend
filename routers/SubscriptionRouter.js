const express = require("express");
const { getAllSubscription, paySubscription, payPartialSubscription, payTransport } = require("../controllers/SubscriptionController");
const router = express.Router()

router.get("/",getAllSubscription)
router.post("/:id/pay",paySubscription)
router.post("/:id/pay-partial", payPartialSubscription);
router.post("/transport/:id/pay", payTransport);

module.exports = router