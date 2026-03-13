const express = require("express");
const router = express.Router();
const pool = require("../db"); // adjust if your db file is named differently
const auth = require("../middleware/auth");
const requireAdmin = require("../middleware/requireAdmin");

router.delete("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM invoices
       WHERE id = $1
       AND company_id = $2
       RETURNING *`,
      [req.params.id, req.companyId]
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

module.exports = router;
