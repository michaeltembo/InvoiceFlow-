const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const requireAdmin = require("../middleware/requireAdmin");

const { sendEmail } = require("../utils/sendEmail");


// DELETE INVOICE
router.delete("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM invoices
       WHERE id = $1
       AND company_id = $2
       RETURNING *`,
      [req.params.id, req.user.companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json({ message: "Invoice deleted" });

  } catch (err) {
    console.error("DELETE INVOICE ERROR:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});


// SEND EMAIL
router.post("/send-invoice", async (req, res) => {
  try {
    const { email, invoiceId } = req.body;

    const link = `https://your-frontend-url.com/invoice.html?id=${invoiceId}`;

    await sendEmail(
      email,
      `Invoice #INV-${invoiceId}`,
      `
      <h3>Invoice from InvoiceFlow</h3>
      <p>You have received an invoice.</p>
      <p><a href="${link}">View Invoice</a></p>
      `
    );

    res.json({ success: true });

  } catch (err) {
    console.error("EMAIL ERROR:", err);
    res.status(500).json({ error: "Email failed" });
  }
});

module.exports = router;
