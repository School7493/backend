const express = require("express");
const { getAllScoring, createScoring, updateScoring, deleteScoring } = require("../controllers/ScoringController");
const router = express.Router()

router.get("/",getAllScoring)
router.post("/",createScoring)
router.put("/:id", updateScoring);
router.delete("/:id", deleteScoring);

module.exports = router