
const express = require("express");
const router = express.Router(); // 🔥 THIS IS MISSING
const pool = require("../db");   // adjust if your db path is different
const authMiddleware = require("../middleware/auth");


// =============================
// CREATE PURCHASE INVOICE
// =============================
const multer = require("multer");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // make sure this folder exists
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });


// =============================
// CREATE PURCHASE INVOICE
// =============================
router.post("/", authMiddleware, upload.single("attachment"), async (req, res) => {
  try {
    const companyId = req.user.companyId;

    console.log("📥 BODY:", req.body);
    console.log("📎 FILE:", req.file);

    // ✅ FIX: parse items
    const items = JSON.parse(req.body.items || "[]");

    const {
      supplier_id,
      supplier_name,
      email,
      phone,
      issue_date,
      due_date,
      tax = 0,
      discount = 0,
      notes
    } = req.body;

    if (!supplier_name) {
      return res.status(400).json({ error: "Supplier name required" });
    }

    if (!items.length) {
      return res.status(400).json({ error: "At least one item required" });
    }

    let subtotal = 0;
    items.forEach(i => {
      subtotal += Number(i.quantity) * Number(i.unit_price);
    });

    const total = subtotal + Number(tax) - Number(discount);

    // ✅ file path

const attachment = req.file ? req.file.filename : null;

    const invoiceResult = await pool.query(
      `INSERT INTO purchase_invoices (
        company_id, supplier_id, supplier_name, email, phone,
        issue_date, due_date,
        subtotal, tax, discount, total,
        status, balance, notes, attachment
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$11,$12,$13)
      RETURNING *`,
      [
        companyId,
        supplier_id || null,
        supplier_name,
        email || null,
        phone || null,
        issue_date || new Date(),
        due_date || null,
        subtotal,
        tax,
        discount,
        total,
        notes || null,
        attachment
      ]
    );

    const invoice = invoiceResult.rows[0];

    for (const item of items) {
      await pool.query(
        `INSERT INTO purchase_invoice_items
        (invoice_id, description, quantity, unit_price, total)
        VALUES ($1,$2,$3,$4,$5)`,
        [
          invoice.id,
          item.description,
          item.quantity,
          item.unit_price,
          item.quantity * item.unit_price
        ]
      );
    }

    res.json(invoice);

  } catch (err) {
    console.error("❌ CREATE ERROR:", err);
    res.status(500).json({ error: "Failed to create purchase invoice" });
  }
});

// =============================
// GET PURCHASE INVOICES
// =============================
router.get("/", authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const result = await pool.query(
      `SELECT * FROM purchase_invoices
       WHERE company_id = $1
       ORDER BY id DESC`,
      [companyId]
    );

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch purchase invoices" });
  }
});




// =============================
// PAY PURCHASE INVOICE
// =============================
router.post("/:id/pay", authMiddleware, async (req, res) => {
  try {
    const { amount, method } = req.body;
    const id = req.params.id;
    const companyId = req.user.companyId;

    // 1️⃣ Fetch invoice (secure)
    const invoiceRes = await pool.query(
      "SELECT * FROM purchase_invoices WHERE id=$1 AND company_id=$2",
      [id, companyId]
    );

    if (!invoiceRes.rows.length) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const invoice = invoiceRes.rows[0];

    // 2️⃣ Calculate payment safely
    const newPaid = Number(invoice.paid_amount || 0) + Number(amount);
    const safePaid = Math.min(newPaid, invoice.total);
    const newBalance = Number(invoice.total) - safePaid;

    // 3️⃣ Determine status
    let status = "pending";

    if (safePaid >= invoice.total) {
      status = "paid";
    } else if (safePaid > 0) {
      status = "partial";
    }

    // 4️⃣ Update DB
    await pool.query(
      `UPDATE purchase_invoices
       SET paid_amount=$1,
           balance=$2,
           status=$3,
           payment_method=$4,
           payment_date=NOW()
       WHERE id=$5`,
      [safePaid, newBalance, status, method, id]
    );

    res.json({
      success: true,
      paid_amount: safePaid,
      balance: newBalance,
      status
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment failed" });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  const invoice = await pool.query(
    "SELECT * FROM purchase_invoices WHERE id=$1",
    [id]
  );

  const items = await pool.query(
    "SELECT * FROM purchase_invoice_items WHERE invoice_id=$1",
    [id]
  );

  res.json({
    ...invoice.rows[0],
    items: items.rows
  });
});

module.exports = router;
