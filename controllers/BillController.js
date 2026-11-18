const { Op } = require('sequelize');
const Bill = require('../models/Bill');

const CATEGORIES = ['electricity', 'water', 'internet', 'telephone', 'rent', 'other'];
const STATUSES = ['non payé', 'payé', 'partially_paid'];
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'check', 'other'];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Validates + normalizes a bill payload.
 * Returns { error } or { data }.
 */
function buildBillData(body, existing = null) {
  const src = { ...(existing ? existing.toJSON() : {}), ...body };

  const title = String(src.title || '').trim();
  if (title.length < 2) return { error: 'عنوان الفاتورة مطلوب (حرفان على الأقل)' };

  const category = src.category || 'other';
  if (!CATEGORIES.includes(category)) return { error: 'صنف غير صالح' };

  const amount = Number(src.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'المبلغ يجب أن يكون أكبر من 0' };

  if (!src.bill_date) return { error: 'تاريخ الفاتورة مطلوب' };

  const status = src.status || 'non payé';
  if (!STATUSES.includes(status)) return { error: 'حالة غير صالحة' };

  if (src.payment_method && !PAYMENT_METHODS.includes(src.payment_method)) {
    return { error: 'طريقة دفع غير صالحة' };
  }

  let paid_amount = 0;
  let paid_date = null;
  let payment_method = null;

  if (status === 'payé') {
    paid_amount = amount;
    paid_date = src.paid_date || today();
    payment_method = src.payment_method || null;
  } else if (status === 'partially_paid') {
    paid_amount = Number(src.paid_amount);
    if (!Number.isFinite(paid_amount) || paid_amount <= 0 || paid_amount >= amount) {
      return { error: 'المبلغ المدفوع يجب أن يكون أكبر من 0 وأقل من مبلغ الفاتورة' };
    }
    paid_date = src.paid_date || today();
    payment_method = src.payment_method || null;
  }

  return {
    data: {
      title,
      category,
      description: src.description || null,
      amount,
      bill_date: src.bill_date,
      due_date: src.due_date || null,
      status,
      paid_amount,
      paid_date,
      payment_method,
      reference_number: src.reference_number || null,
      receipt_url: src.receipt_url || null,
    },
  };
}

// GET /bill
exports.getBills = async (req, res) => {
  try {
    const { search, category, status, month } = req.query;
    const where = {};

    if (search) where.title = { [Op.like]: `%${search.trim()}%` };
    if (category) where.category = category;
    if (status) where.status = status;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      const start = `${month}-01`;
      const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // first day of next month
      where.bill_date = { [Op.gte]: start, [Op.lt]: end };
    }

    const bills = await Bill.findAll({
      where,
      order: [
        ['bill_date', 'DESC'],
        ['id', 'DESC'],
      ],
    });

    res.json({ bills });
  } catch (err) {
    console.error('getBills error:', err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// GET /bill/:id
exports.getBillById = async (req, res) => {
  try {
    const bill = await Bill.findByPk(req.params.id);
    if (!bill) return res.status(404).json({ message: 'الفاتورة غير موجودة' });
    res.json({ bill });
  } catch (err) {
    console.error('getBillById error:', err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// POST /bill
exports.createBill = async (req, res) => {
  try {
    const { error, data } = buildBillData(req.body);
    if (error) return res.status(400).json({ message: error });

    const bill = await Bill.create(data);
    res.status(201).json({ bill });
  } catch (err) {
    console.error('createBill error:', err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// PUT /bill/:id
exports.updateBill = async (req, res) => {
  try {
    const bill = await Bill.findByPk(req.params.id);
    if (!bill) return res.status(404).json({ message: 'الفاتورة غير موجودة' });

    const { error, data } = buildBillData(req.body, bill);
    if (error) return res.status(400).json({ message: error });

    await bill.update(data);
    res.json({ bill });
  } catch (err) {
    console.error('updateBill error:', err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// DELETE /bill/:id
exports.deleteBill = async (req, res) => {
  try {
    const bill = await Bill.findByPk(req.params.id);
    if (!bill) return res.status(404).json({ message: 'الفاتورة غير موجودة' });

    await bill.destroy();
    res.json({ message: 'تم حذف الفاتورة' });
  } catch (err) {
    console.error('deleteBill error:', err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};