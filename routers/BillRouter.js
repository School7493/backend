const express = require('express');
const router = express.Router();
const billController = require('../controllers/BillController');
// const auth = require('../middleware/auth'); // add your auth middleware if the other routes use one
// router.use(auth);

router.get('/', billController.getBills);
router.get('/:id', billController.getBillById);
router.post('/', billController.createBill);
router.put('/:id', billController.updateBill);
router.delete('/:id', billController.deleteBill);

module.exports = router;