
require("dotenv").config({ path: __dirname + "/.env" });
console.log("DB URL:", process.env.DATABASE_URL);

const express = require("express");
const adminAuth = require("./middleware/adminAuth");
const Stripe = require("stripe");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const bwipjs = require("bwip-js");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const fs = require("fs");

const pool = require("./db");
const invoiceRoutes = require("./routes/invoices");
const purchaseRoutes = require("./routes/purchaseInvoices");
const authMiddleware = require("./middleware/auth");

const app = express();

app.use(express.json());

app.get("/ping", (req, res) => {
  res.status(200).send("OK");
});

const crypto = require("crypto");
const auth = require("./middleware/auth");
const requireAdmin = require("./middleware/requireAdmin");
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const { sendEmail } = require("./utils/sendEmail");
const transporter = require("./mailer");
const { generateCode, sendVerificationEmail } = require("./utils/email");
const verificationCodes = {};

const multer = require("multer");

const uploadPath = path.join(__dirname, "uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

app.use("/uploads", express.static(uploadPath));



app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));





// ✅ Root route loads login.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ✅ Mount invoice routes
app.use("/invoices", invoiceRoutes);
app.use("/purchase-invoices", authMiddleware, purchaseRoutes);
app.use(express.static(path.join(__dirname, "public")));




// ===============================
// AUTH MIDDLEWARE
// ===============================
function authenticateToken(req, res, next) {

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token missing" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    req.user = user;
    next();
  });
}

/* ================= AUTH MIDDLEWARE ================= */


/* ================= LOGIN ================= */

app.post("/login", async (req, res) => {
try {
const { email, password } = req.body;

if (!email || !password) {  
  return res.status(400).json({ error: "Email and password required" });  
}  

const result = await pool.query(  
  "SELECT * FROM companies WHERE email = $1",  
  [email]  
);  

if (result.rows.length === 0) {  
  return res.status(400).json({ error: "Invalid credentials" });  
}  

const company = result.rows[0];  

// ✅ VERY IMPORTANT (prevents bcrypt crash)  
if (!company.password) {  
  return res.status(400).json({ error: "Account not properly set up" });  
}  

const valid = await bcrypt.compare(password, company.password);  

if (!valid) {  
  return res.status(400).json({ error: "Invalid credentials" });  
}  

// ✅ ensure verified  
if (!company.verified) {  
  return res.status(403).json({ error: "Please verify your email" });  
}  

const token = jwt.sign(  
  {  
    userId: company.id,  
    companyId: company.id,  
    role: "company"  
  },  
  process.env.JWT_SECRET,  
  { expiresIn: "7d" }  
);  

res.json({ token });

} catch (err) {
console.error("LOGIN ERROR:", err);
res.status(500).json({ error: "Server error" });
}
});
app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

  const user = result.rows[0];

// ✅ CORRECT
if (!user.is_super_admin) {
  return res.status(403).json({ error: "Access denied" });
}


  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

// ✅ CORRECT
const token = jwt.sign(
  {
    id: user.id,
    is_super_admin: user.is_super_admin
  },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);


  res.json({ token });
});


/* ================= CLIENTS ================= */

app.post("/clients", auth, upload.single("avatar"), async (req, res) => {
  try {
    const { name, email, phone, country } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Client name required" });
    }

    // ✅ FILE HANDLING
    const avatar = req.file ? req.file.filename : null;

    const result = await pool.query(
      `INSERT INTO clients
      (name, email, phone, country, avatar, status, company_id)
      VALUES ($1,$2,$3,$4,$5,'active',$6)
      RETURNING *`,
      [
        name,
        email || null,
        phone || null,
        country || null,
        avatar,
        req.user.companyId
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create client" });
  }
});


app.get("/clients", auth, async (req, res) => {
  try {

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.email,
        c.phone,
        c.country,
        c.avatar,
        c.status,
        COALESCE(SUM(i.total),0)::numeric AS total_revenue,
        COUNT(i.id)::int AS invoice_count
      FROM clients c
      LEFT JOIN invoices i
        ON i.client_id = c.id
        AND i.company_id = $1
      WHERE c.company_id = $1
        AND COALESCE(c.deleted, FALSE) = FALSE
      GROUP BY
        c.id,
        c.name,
        c.email,
        c.phone,
        c.country,
        c.avatar,
        c.status
      ORDER BY c.id DESC
      `,
      [req.user.companyId]
    );

    console.log("📦 CLIENTS FOUND:", result.rows.length);

    res.json({ data: result.rows });

  } catch (err) {

    console.error("GET CLIENTS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch clients" });

  }
});

app.delete("/clients/:id", auth, async (req, res) => {
  try {

    const id = req.params.id;

    console.log("Deleting client:", id);
    console.log("Company:", req.user.companyId);

    const result = await pool.query(
      `DELETE FROM clients
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.companyId]
    );

    console.log("Rows deleted:", result.rowCount);

    if(result.rowCount === 0){
      return res.status(404).json({ error: "Client not found" });
    }

    res.json({ message: "Client permanently deleted" });

  } catch(err){
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});


/* ================= INVOICES ================= */
app.post("/invoices", authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userId = req.user.userId;
    const companyId = req.user.companyId;

    const { client_id, items, tax_rate = 0, status = "draft", due_date } = req.body;

    if (!client_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Client and at least one item are required" });
    }


// ===============================
// 🔒 PLAN LIMIT CHECK
// ===============================

// 🔥 Get plan by COMPANY (not user)
const planResult = await client.query(
  "SELECT subscription_status FROM companies WHERE id = $1",
  [companyId]
);

let plan = "free"; // default

if (planResult.rows.length > 0) {
  plan = planResult.rows[0].subscription_status || "free";
}

// 2. Only enforce for FREE users
if (plan !== "pro") {

  const countResult = await client.query(
    "SELECT COUNT(*) FROM invoices WHERE company_id = $1",
    [companyId]
  );

  const invoiceCount = Number(countResult.rows[0].count);

  if (invoiceCount >= 5) {
    await client.query("ROLLBACK");

    return res.status(403).json({
      error: "limit_reached"
    });
  }
}


    // ===============================
    // 💰 CALCULATIONS
    // ===============================

    let subtotal = 0;

    for (const item of items) {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price ?? item.price) || 0;
      subtotal += quantity * unitPrice;
    }

    const taxAmount = subtotal * (Number(tax_rate) / 100);
    const total = subtotal + taxAmount;

    // ===============================
    // 🧾 INSERT INVOICE
    // ===============================

    const invoiceResult = await client.query(
      `
      INSERT INTO invoices
      (client_id, amount, subtotal, tax_amount, total, tax_rate, status, created_at, due_date, company_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9)
      RETURNING id
      `,
      [
        client_id,
        total,
        subtotal,
        taxAmount,
        total,
        tax_rate,
        status,
        due_date || null,
        companyId
      ]
    );

    const invoiceId = invoiceResult.rows[0].id;

    // ===============================
    // 📦 INSERT ITEMS
    // ===============================

    for (const item of items) {
      await client.query(
        `
        INSERT INTO invoice_items
        (invoice_id, description, quantity, unit_price)
        VALUES ($1,$2,$3,$4)
        `,
        [
          invoiceId,
          item.description || "",
          Number(item.quantity) || 0,
          Number(item.unit_price ?? item.price) || 0
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Invoice created successfully",
      invoiceId
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST invoice error:", error);
    res.status(500).json({ error: "Failed to create invoice" });
  } finally {
    client.release();
  }
});


    // ===============================
    // INSERT ITEMS
    // ===============================
app.get("/invoices", auth, async (req, res) => {
  try {

    const companyId = req.user.companyId;

    console.log("Company ID used in query:", companyId);

    const result = await pool.query(`
      SELECT
        i.id,
        i.client_id,
        i.created_at,
        i.due_date,
        i.total,
        i.status,
        c.name AS client_name
      FROM invoices i
      LEFT JOIN clients c
        ON c.id = i.client_id
        AND c.company_id = $1
      WHERE i.company_id = $1
      ORDER BY i.id DESC
    `, [companyId]);

    console.log("Invoices found:", result.rows.length);

    res.json(result.rows);

  } catch (error) {
    console.error("GET invoices error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/invoices/:id", auth, async (req, res) => {
  try {

    const id = req.params.id;

    console.log("Deleting invoice:", id);
    console.log("Company:", req.user.companyId);

    const result = await pool.query(
      `DELETE FROM invoices
       WHERE id = $1
       AND company_id = $2
       RETURNING *`,
      [id, req.user.companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json({ message: "Invoice permanently deleted" });

  } catch (err) {
    console.error("DELETE INVOICE ERROR:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

/* ================= DASHBOARD ================= */

app.get("/dashboard-summary", authenticateToken, async (req, res) => {

  try {
    const companyId = req.user.companyId;

    console.log("Dashboard company:", companyId);


// Total Clients
console.time("clients");
const clients = await pool.query(
  "SELECT COUNT(*) AS total FROM clients WHERE company_id = $1",
  [companyId]
);
console.timeEnd("clients");

// Active Clients
console.time("activeClients");
const activeClients = await pool.query(
  `SELECT COUNT(DISTINCT client_id) AS total
   FROM invoices
   WHERE company_id = $1`,
  [companyId]
);
console.timeEnd("activeClients");

// Revenue
console.time("revenue");
const revenue = await pool.query(
  `SELECT COALESCE(SUM(total),0) AS total
   FROM invoices
   WHERE company_id = $1 AND status = 'paid'`,
  [companyId]
);
console.timeEnd("revenue");

// Outstanding
console.time("outstanding");
const outstanding = await pool.query(
  `SELECT COALESCE(SUM(total),0) AS total
   FROM invoices
   WHERE company_id = $1 AND status IN ('pending','overdue')`,
  [companyId]
);
console.timeEnd("outstanding");

// Recent invoices
const recentInvoices = await pool.query(`
  SELECT
    i.id,
    c.name AS client_name,
    i.status,
    i.total,
    i.due_date
  FROM invoices i
  JOIN clients c 
    ON i.client_id = c.id 
    AND c.company_id = $1
  WHERE i.company_id = $1
  ORDER BY i.created_at DESC
  LIMIT 5
`, [companyId]);

    res.json({
      totalClients: Number(clients.rows[0].total),
      activeClients: Number(activeClients.rows[0].total),
      totalRevenue: Number(revenue.rows[0].total),
      outstanding: Number(outstanding.rows[0].total),
      recentInvoices: recentInvoices.rows,
      monthlyRevenue: [] // we fix chart later
    });

  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Dashboard error" });
  }
});


/* ================= PDF + QR + LOGO ================= */


app.get("/invoices/:id/pdf", async (req, res) => {
  try {
    const invoiceId = req.params.id;

    // ===============================
    // FETCH INVOICE + CLIENT
    // ===============================

    const invoiceResult = await pool.query(
      `
      SELECT invoices.*, clients.name AS client_name
      FROM invoices
      JOIN clients ON invoices.client_id = clients.id
      WHERE invoices.id = $1
      `,
      [invoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).send("Invoice not found");
    }

    const invoice = invoiceResult.rows[0];



    // ===============================
    // FETCH COMPANY SETTINGS
    // ===============================

let company = {};

if (invoice.user_id && Number.isInteger(invoice.user_id)) {
  const companyResult = await pool.query(
    "SELECT * FROM company_settings WHERE user_id = $1",
    [invoice.user_id]
  );

  company = companyResult.rows[0] || {};

console.log("Company fetched:", company);

}


    // ===============================
    // CREATE PDF
    // ===============================

    const doc = new PDFDocument({
      size: "A4",
      margin: 50
    });

    doc.on("error", (err) => {
      console.error("PDFKit Error:", err);
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=invoice-${invoice.id}.pdf`
    );

    doc.pipe(res);

    // ===============================
    // FORMAT HELPERS
    // ===============================

    const currency = invoice.currency || "USD";

    const formatCurrency = (amount) => {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency
      }).format(Number(amount) || 0);
    };

const formattedDate = invoice.created_at
  ? new Date(invoice.created_at).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    })
  : "";


    // ===============================
    // LOGO
    // ===============================

    if (company.logo_path) {
      const logoPath = path.join(process.cwd(), "public", company.logo_path);

      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, 50, 40, { width: 120 });
        } catch (e) {
          console.log("Logo failed to load");
        }
      }
    }

// ===============================
// COMPANY INFO (LEFT SIDE)
// ===============================

doc
  .fontSize(14)
  .fillColor("#000")
  .text(company.company_name || "", 50, 50);

doc
  .fontSize(10)
  .fillColor("#555")
  .text(company.address || "")
  .text(company.phone || "")
  .text(company.email || "");

doc
  .fontSize(10)
  .fillColor(
    invoice.status === "paid"
      ? "#16A34A"
      : invoice.status === "overdue"
      ? "#DC2626"
      : "#F59E0B"
  )
  .text(`Status: ${invoice.status.toUpperCase()}`, 400, 110, {
    align: "right"
  });

// Save position after company block
let startY = doc.y + 20;

// ===============================
// HEADER (RIGHT ALIGNED)
// ===============================

doc
  .fontSize(26)
  .fillColor("#111")
  .text("INVOICE", 400, 50, { align: "right" });

doc
  .fontSize(10)
  .fillColor("#555")
  .text(`Invoice #: INV-${invoice.id}`, 400, 80, { align: "right" })
  .text(`Date: ${formattedDate}`, 400, 95, { align: "right" });

    // ===============================
    // BILL TO
    // ===============================

    doc
      .fontSize(11)
      .fillColor("#000")
      .text("Bill To:", 50, 160);

    doc
      .fontSize(10)
      .fillColor("#444")
      .text(invoice.client_name || "", 50, 175);

    // ===============================
    // ITEMS SAFE PARSE
    // ===============================

    let items = [];

    if (invoice.items) {
      try {
        items =
          typeof invoice.items === "string"
            ? JSON.parse(invoice.items)
            : invoice.items;
      } catch (e) {
        items = [];
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      items = [
        {
          description: "Professional Services",
          amount: invoice.amount || 0
        }
      ];
    }

    // ===============================
    // TABLE HEADER
    // ===============================

    const tableTop = 220;

    doc.rect(50, tableTop, 500, 25).fill("#1D4ED8");

    doc
      .fillColor("white")
      .fontSize(11)
      .text("Description", 60, tableTop + 7)
      .text("Amount", 450, tableTop + 7, { align: "right" });

    // ===============================
    // TABLE ITEMS
    // ===============================

    let y = tableTop + 40;
    let subtotal = 0;

    items.forEach((item) => {
      doc
        .fillColor("#000")
        .fontSize(10)
        .text(item.description || "", 60, y, { width: 300 });

      doc.text(
        formatCurrency(item.amount || 0),
        450,
        y,
        { align: "right" }
      );

      subtotal += Number(item.amount) || 0;
      y += 40;
    });

// spacing
y += 20;

// tax calculation
const taxRate = Number(invoice.tax_rate) || 0;
const taxAmount = subtotal * (taxRate / 100);
const total = subtotal + taxAmount;

// Subtotal
doc.text("Subtotal:", 350, y);
doc.text(formatCurrency(subtotal), 450, y, { align: "right" });

y += 20;

// Tax
doc.text(`Tax (${taxRate}%):`, 350, y);
doc.text(formatCurrency(taxAmount), 450, y, { align: "right" });

y += 20;

// Total
doc.font("Helvetica-Bold");
doc.text("Total:", 350, y);
doc.text(formatCurrency(total), 450, y, { align: "right" });
doc.font("Helvetica");

    // ===============================
    // VAT + TOTAL
    // ===============================

    const vatRate = Number(invoice.vat) || 15;
    const vat = subtotal * (vatRate / 100);

    y += 10;

    doc.moveTo(300, y).lineTo(550, y).strokeColor("#E5E7EB").stroke();

    y += 15;

    doc
      .fillColor("#333")
      .fontSize(11)
      .text("Subtotal:", 350, y)
      .text(formatCurrency(subtotal), 450, y, { align: "right" });

    y += 20;

    doc
      .text(`VAT (${vatRate}%):`, 350, y)
      .text(formatCurrency(vat), 450, y, { align: "right" });

    y += 25;

    doc
      .fontSize(16)
      .fillColor("#000")
      .text("TOTAL:", 350, y)
      .text(formatCurrency(total), 450, y, { align: "right" });

    // ===============================
    // PAYMENT TERMS
    // ===============================

    y += 60;

    doc
      .fontSize(11)
      .fillColor("#000")
      .text("Payment Terms", 50, y);

    doc
      .fontSize(9)
      .fillColor("#555")
      .text("Payment due within 14 days.", 50, y + 15);

    // ===============================
    // WIRE DETAILS
    // ===============================

    y += 50;

doc
      .fontSize(11)
      .fillColor("#000")
      .text("Wire Transfer Details", 50, y);

    doc
      .fontSize(9)
      .fillColor("#555")
      .text(`Bank: ${company.bank_name || "Global Bank"}`, 50, y + 15)
      .text(`IBAN: ${company.iban || "XXXX-XXXX"}`, 50, y + 30)
      .text(`SWIFT: ${company.swift || "XXXXXXX"}`, 50, y + 45);

    // ===============================
    // QR CODE
    // ===============================

    try {
      const qrData = `Invoice INV-${invoice.id} Total ${formatCurrency(total)}`;
      const qrImage = await QRCode.toDataURL(qrData);
      const qrBase64 = qrImage.replace(/^data:image\/png;base64,/, "");
      const qrBuffer = Buffer.from(qrBase64, "base64");

      doc.image(qrBuffer, 400, y, { width: 100 });
    } catch (e) {
      console.log("QR generation failed");
    }

    // ===============================
    // BARCODE
    // ===============================

    try {
      const barcodeBuffer = await bwipjs.toBuffer({
        bcid: "code128",
        text: `INV-${invoice.id}`,
        scale: 2,
        height: 10,
        includetext: false
      });

      doc.image(barcodeBuffer, 50, 720, { width: 200 });
    } catch (e) {
      console.log("Barcode failed");
    }

    // ===============================
    // FOOTER
    // ===============================

    doc
      .fontSize(8)
      .fillColor("#888")
      .text(
        `${company.company_name || "Your Company"} • ${company.company_email || ""} • ${company.company_phone || ""}`,
        50,
        780,
        { align: "center", width: 500 }
      );

y += 40;

doc.fontSize(10);
doc.fillColor("gray");
doc.text(
  "This is an electronically generated invoice and does not require a signature.",
  50,
  y,
  { align: "center" }
);

doc.fillColor("black");
doc.fontSize(12);

    doc.end();

} catch (err) {
  console.error("========== PDF ERROR ==========");
  console.error(err);
  console.error(err.stack);
  console.error("================================");
  return res.status(500).send(err.stack);
}

});


/* ================= EMAIL ================= */

app.post("/invoices/:id/email", auth, async (req, res) => {
  try {

console.log("BODY:", req.body);
console.log("USER:", req.user);

    const result = await pool.query(
      `SELECT invoices.*, clients.email
       FROM invoices
       JOIN clients ON invoices.client_id=clients.id
       WHERE invoices.id=$1 AND invoices.company_id=$2`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Not found" });

    const invoice = result.rows[0];

    if (!invoice.email)
      return res.status(400).json({ error: "Client has no email" });

    await sgMail.send({
      to: invoice.email,
      from: process.env.EMAIL_FROM,
      subject: "Your Invoice",
      text: `Invoice Amount: $${invoice.amount}`
    });

    res.json({ message: "Email sent" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Email failed" });
  }
});

app.get("/invoices/:id", auth, async (req, res) => {
try {
const invoiceId = req.params.id;
const companyId = req.user.companyId;

// 1️⃣ Get invoice

const invoiceResult = await pool.query(
`SELECT 
invoices.*, 
clients.name AS client_name,
clients.email AS client_email   -- ✅ ADD THIS LINE
FROM invoices
JOIN clients
ON invoices.client_id = clients.id
AND clients.company_id = $2
WHERE invoices.id = $1
AND invoices.company_id = $2`,
[invoiceId, companyId]
);

if (invoiceResult.rows.length === 0) {
return res.status(404).json({ error: "Invoice not found" });
}

// 2️⃣ Get invoice items
const itemsResult = await pool.query(
`SELECT *
FROM invoice_items
WHERE invoice_id = $1`,
[invoiceId]
);

// 3️⃣ Return both
res.json({
invoice: invoiceResult.rows[0],
items: itemsResult.rows
});

} catch (err) {
console.error("View invoice error:", err);
res.status(500).json({ error: "Failed to load invoice" });
}
});


app.put("/invoices/:id", auth, async (req, res) => {
  try {
    const { amount, tax_rate, due_date, currency, status } = req.body;

    const subtotal = Number(amount) || 0;
    const rate = Number(tax_rate) || 0;

    const taxAmount = subtotal * (rate / 100);
    const total = subtotal + taxAmount;

    const result = await pool.query(
      `UPDATE invoices
       SET amount = $1,
           subtotal = $2,
           tax_rate = $3,
           tax_amount = $4,
           total = $5,
           due_date = $6,
           currency = $7,
           status = $8
       WHERE id = $9
       AND company_id = $10
       RETURNING *`,
      [
        subtotal,
        subtotal,
        rate,
        taxAmount,
        total,
        due_date,
        currency,
        status,
        req.params.id,
        req.user.companyId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("UPDATE INVOICE ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});


app.put("/company-settings", auth, async (req, res) => {
  try {
    const {
      bank_name,
      account_name,
      account_number,
      branch,
      mobile_money
    } = req.body;

    await pool.query(
      `UPDATE company_settings
       SET bank_name = $1,
           account_name = $2,
           account_number = $3,
           branch = $4,
           mobile_money = $5
       WHERE user_id = $6`,
      [
        bank_name,
        account_name,
        account_number,
        branch,
        mobile_money,
        req.userId
      ]
    );

    res.json({ message: "Company settings updated successfully" });

  } catch (err) {
    console.error("UPDATE COMPANY ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/company-settings", auth, async (req, res) => {
  try {

    const companyId = req.user.companyId;

    const result = await pool.query(
      `
      SELECT
        c.name AS company_name,
        c.email,
        c.phone,
        c.address,
        c.country,
        c.logo,          -- ✅ FIX
        c.currency,      -- ✅ FIX

        cs.bank_name,
        cs.account_name,
        cs.account_number,
        cs.branch,
        cs.swift,
        cs.mobile_money,
        cs.invoice_footer,
        cs.signature_path

      FROM companies c
      LEFT JOIN company_settings cs
        ON cs.company_id = c.id
      WHERE c.id = $1
      `,
      [companyId]
    );

    res.json(result.rows[0] || {});

  } catch (err) {
    console.error("GET COMPANY SETTINGS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});


app.get("/admin-test", auth, requireAdmin, (req, res) => {
  res.json({ message: "Admin access granted" });
});

app.put("/invoices/:id/pay", authenticateToken, async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const companyId = req.user.companyId;

    const result = await pool.query(`
      UPDATE invoices
      SET status = 'paid'
      WHERE id = $1 AND company_id = $2
      RETURNING *
    `, [invoiceId, companyId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    console.log("Invoice marked paid:", invoiceId);

    res.json({ success: true });

  } catch (error) {
    console.error("Mark paid error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


app.post("/company/settings", authenticateToken, async (req, res) => {
  try {

    const companyId = req.user.companyId;

    const {
      company_name,
      registration_number,
      email,
      phone,
      address,
      country,
      bank_name,
      account_name,
      account_number,
      branch,
      swift,
      mobile_money,
      invoice_footer
    } = req.body;

    const name = company_name;

    /* UPDATE COMPANY INFO */
    await pool.query(
      `UPDATE companies
       SET
         name = $1,
         registration_number = $2,
         email = $3,
         phone = $4,
         address = $5,
         country = $6
       WHERE id = $7`,
      [
        name,
        registration_number,
        email,
        phone,
        address,
        country,
        companyId
      ]
    );

    /* UPDATE COMPANY SETTINGS */
    await pool.query(
      `INSERT INTO company_settings
       (company_id, bank_name, account_name, account_number, branch, swift, mobile_money, invoice_footer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)

       ON CONFLICT (company_id)
       DO UPDATE SET
         bank_name = EXCLUDED.bank_name,
         account_name = EXCLUDED.account_name,
         account_number = EXCLUDED.account_number,
         branch = EXCLUDED.branch,
         swift = EXCLUDED.swift,
         mobile_money = EXCLUDED.mobile_money,
         invoice_footer = EXCLUDED.invoice_footer`,
      [
        companyId,
        bank_name,
        account_name,
        account_number,
        branch,
        swift,
        mobile_money,
        invoice_footer
      ]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

app.post("/settings/tax", authenticateToken, async (req,res)=>{

try{

const companyId = req.user.companyId;

const { currency, taxRate, taxName } = req.body;

const rate = taxRate === "" ? 0 : Number(taxRate);

const result = await pool.query(
`UPDATE companies
 SET currency=$1,
     tax_rate=$2,
     tax_name=$3
 WHERE id=$4
 RETURNING *`,
[currency, rate, taxName, companyId]
);

res.json(result.rows[0]);

}catch(err){

console.error(err);
res.status(500).json({error:"Failed to save tax settings"});

}

});


app.get("/users", authenticateToken, async (req, res) => {
  try {

    const companyId = req.user.companyId;

    const result = await pool.query(
      `SELECT id, email, role
       FROM users
       WHERE company_id = $1
       ORDER BY id`,
      [companyId]
    );

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.delete("/users/:id", authenticateToken, async (req, res) => {

  const userId = req.params.id;
  const companyId = req.user.companyId;

  await pool.query(
    `DELETE FROM users
     WHERE id=$1 AND company_id=$2`,
    [userId, companyId]
  );

  res.json({ success: true });

});


app.post("/users", authenticateToken, async (req,res)=>{

  try{

    const {email, role} = req.body;
    const companyId = req.user.companyId;

    const password = "temporary123";

    const result = await pool.query(
      `INSERT INTO users(email,password,role,company_id)
       VALUES($1,$2,$3,$4)
       RETURNING id,email,role`,
      [email,password,role,companyId]
    );

    res.json(result.rows[0]);

  }catch(err){
    console.error(err);
    res.status(500).json({error:"Failed to invite user"});
  }

});

app.get("/subscription", authenticateToken, async (req,res)=>{

  try{

    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT subscription_status
       FROM users
       WHERE id=$1`,
      [userId]
    );

    // ✅ FIX: handle missing user
    if(result.rows.length === 0){
      return res.json({ plan: "free" });
    }

    res.json({
      plan: result.rows[0].subscription_status || "free"
    });

  }catch(err){
    console.error(err);
    res.status(500).json({error:"Failed to load subscription"});
  }

});

app.post("/create-checkout-session", authenticateToken, async (req,res)=>{

  const session = await stripe.checkout.sessions.create({

    mode:"subscription",

    payment_method_types:["card"],

    line_items:[
      {
        price:"price_1TA8JePQja67freRdzHV2Ptn",
        quantity:1
      }
    ],

    client_reference_id: req.user.id,   // ← IMPORTANT

success_url:"https://your-render-url.onrender.com/success?session_id={CHECKOUT_SESSION_ID}",
cancel_url:"https://your-frontend-url.com/dashboard.html"


  });

  res.json({url:session.url});

});

app.get("/success", async (req,res)=>{

  const session = await stripe.checkout.sessions.retrieve(
    req.query.session_id
  );

  if(session.payment_status === "paid"){

    const userId = session.client_reference_id;

    await db.query(
      "UPDATE users SET plan = 'pro' WHERE id = ?",
      [userId]
    );

    console.log("User upgraded to PRO:", userId);
  }

  res.redirect("/dashboard.html");

});


app.get("/success", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(
      req.query.session_id
    );

    if (session && session.subscription) {

      const userId = session.client_reference_id;

      await pool.query(
        "UPDATE users SET plan = 'pro' WHERE id = $1",
        [userId]
      );

      console.log("User upgraded to PRO:", userId);
    }

    res.redirect("/dashboard.html");

  } catch (err) {
    console.error("SUCCESS ERROR:", err);
    res.send("Error processing payment");
  }
});

app.post("/cancel-subscription", authenticateToken, async (req,res)=>{

  const user = await db.query(
    "SELECT stripe_subscription_id FROM users WHERE id=?",
    [req.user.id]
  );

  await stripe.subscriptions.cancel(user[0].stripe_subscription_id);

  await db.query(
    "UPDATE users SET plan='free' WHERE id=?",
    [req.user.id]
  );

  res.json({message:"Subscription cancelled"});

});




// ✅ IMPORTANT: raw body for Stripe
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("❌ Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("✅ Stripe event:", event.type);

  try {

    switch (event.type) {

      // =========================
      // ✅ USER SUBSCRIBED (UPGRADE)
      // =========================
      case "checkout.session.completed": {

        const session = event.data.object;

        const customerId = session.customer;
        const subscriptionId = session.subscription;
        const email =
          session.customer_email ||
          session.customer_details?.email;

        const user = await pool.query(
          "SELECT id FROM users WHERE email = $1 OR stripe_customer_id = $2",
          [email, customerId]
        );

        if (user.rows.length > 0) {

          await pool.query(
            `UPDATE users 
             SET plan='pro',
                 stripe_customer_id=$1,
                 stripe_subscription_id=$2
             WHERE id=$3`,
            [customerId, subscriptionId, user.rows[0].id]
          );

          console.log("🚀 User upgraded to PRO:", email);

        } else {
          console.log("⚠️ No user found for:", email);
        }

        break;
      }

      // =========================
      // ❌ PAYMENT FAILED
      // =========================
      case "invoice.payment_failed": {

        const customerId = event.data.object.customer;

        const user = await pool.query(
          "SELECT id FROM users WHERE stripe_customer_id = $1",
          [customerId]
        );

        if (user.rows.length > 0) {

          await pool.query(
            "UPDATE users SET plan='free' WHERE id = $1",
            [user.rows[0].id]
          );

          console.log("⚠️ Payment failed → downgraded user");

        }

        break;
      }

      // =========================
      // ❌ SUBSCRIPTION CANCELLED
      // =========================
      case "customer.subscription.deleted": {

        const sub = event.data.object;

        const user = await pool.query(
          "SELECT id FROM users WHERE stripe_customer_id = $1",
          [sub.customer]
        );

        if (user.rows.length > 0) {

          await pool.query(
            "UPDATE users SET plan='free' WHERE id = $1",
            [user.rows[0].id]
          );

          console.log("❌ Subscription cancelled");

        }

        break;
      }

      default:
        console.log("ℹ️ Unhandled event:", event.type);
    }

    res.json({ received: true });

  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    res.status(500).send("Server error");
  }

});

app.get("/notification-settings", authenticateToken, async (req,res)=>{

  const result = await pool.query(
    "SELECT invoice_paid, overdue_reminders, weekly_reports, monthly_reports FROM users WHERE id=$1",
    [req.user.userId]
  );

  res.json(result.rows[0]);

});


app.post("/notification-settings", authenticateToken, async (req,res)=>{

  const {invoice_paid, overdue_reminders, weekly_reports, monthly_reports} = req.body;

  await pool.query(
    "UPDATE users SET invoice_paid=$1, overdue_reminders=$2, weekly_reports=$3, monthly_reports=$4 WHERE id=$5",
    [
      invoice_paid,
      overdue_reminders,
      weekly_reports,
      monthly_reports,
      req.user.userId
    ]
  );

  res.json({success:true});

});


app.post("/change-password", authenticateToken, async (req,res)=>{

  const {currentPassword, newPassword} = req.body;

  const result = await pool.query(
    "SELECT password FROM users WHERE id=$1",
    [req.user.userId]
  );

  const user = result.rows[0];

  const valid = await bcrypt.compare(currentPassword, user.password);

  if(!valid){
    return res.json({message:"Current password incorrect"});
  }

  const hashed = await bcrypt.hash(newPassword,10);

  await pool.query(
    "UPDATE users SET password=$1 WHERE id=$2",
    [hashed, req.user.userId]
  );

  res.json({message:"Password updated successfully"});
});

app.get("/generate-2fa", authenticateToken, async (req,res)=>{

const secret = speakeasy.generateSecret();

await pool.query(
"UPDATE users SET twofa_secret=$1 WHERE id=$2",
[secret.base32, req.user.userId]
);

const qr = await QRCode.toDataURL(secret.otpauth_url);

res.json({qr});

});


app.post("/forgot-password", async (req,res)=>{

const {email} = req.body;

const user = await pool.query(
"SELECT id FROM users WHERE email=$1",
[email]
);

if(user.rows.length === 0){
return res.json({message:"Email not found"});
}

const token = crypto.randomBytes(32).toString("hex");

const expiry = new Date(Date.now() + 3600000); // 1 hour

await pool.query(
"UPDATE users SET reset_token=$1, reset_token_expiry=$2 WHERE email=$3",
[token, expiry, email]
);

const resetLink = `http://localhost:3000/reset-password.html?token=${token}`;

console.log("Reset link:", resetLink);

res.json({message:"Reset link generated. Check server console."});

});


app.post("/reset-password", async (req,res)=>{

const {token,password} = req.body;

const user = await pool.query(
"SELECT * FROM users WHERE reset_token=$1 AND reset_token_expiry > NOW()",
[token]
);

if(user.rows.length === 0){
return res.json({message:"Invalid or expired token"});
}

await pool.query(
"UPDATE users SET password=$1, reset_token=NULL, reset_token_expiry=NULL WHERE id=$2",
[password, user.rows[0].id]
);

res.json({message:"Password updated successfully"});

});


app.post("/invoice/preferences", authenticateToken, async (req,res)=>{

const { prefix, startNumber, paymentTerms, footer } = req.body;

try{

await pool.query(
`UPDATE company_settings
SET invoice_prefix=$1,
invoice_start_number=$2,
payment_terms=$3,
invoice_footer=$4
WHERE user_id=$5`,
[
prefix,
startNumber,
paymentTerms,
footer,
req.user.userId
]
);

res.json({success:true});

}catch(err){

console.error("Invoice preferences error:", err);
res.status(500).json({success:false});

}

});

app.post("/integrations/stripe", authenticateToken, async (req,res)=>{

res.json({
message:"Stripe connected successfully"
});

});

app.post("/integrations/paypal", authenticateToken, async (req,res)=>{

res.json({
message:"PayPal connected successfully"
});

});

app.post("/integrations/zapier", authenticateToken, async (req,res)=>{

res.json({
message:"Zapier connected successfully"
});

});


app.get("/connect/stripe",(req,res)=>{

const token = req.query.token;

const stripeUrl =
"https://connect.stripe.com/oauth/authorize" +
"?response_type=code" +
"&client_id=" + process.env.STRIPE_CLIENT_ID +
"&scope=read_write" +
"&state=" + token +
"&redirect_uri=https://invoiceflow-qlb6.onrender.com/stripe/callback";

res.redirect(stripeUrl);


});


app.get("/stripe/callback", async (req,res)=>{

const code = req.query.code;

const response = await fetch("https://connect.stripe.com/oauth/token",{
method:"POST",
headers:{
"Content-Type":"application/x-www-form-urlencoded"
},
body:new URLSearchParams({
client_secret:process.env.STRIPE_SECRET_KEY,
code:code,
grant_type:"authorization_code"
})
});

const data = await response.json();

await pool.query(
"UPDATE integrations SET stripe_account_id=$1 WHERE user_id=$2",
[data.stripe_user_id, req.user.userId]
);

res.redirect("/integrations-settings.html");

});

app.post("/create-company", async (req, res) => {
  try {
    const { company_name, company_code, email, password } = req.body;

    if (!company_name || !company_code || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    const companyCheck = await pool.query(
      "SELECT id FROM companies WHERE code = $1",
      [company_code]
    );

    if (companyCheck.rows.length > 0) {
      return res.status(400).json({ error: "Company code already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

const company = await pool.query(
  "INSERT INTO companies (name, code, email, password) VALUES ($1,$2,$3,$4) RETURNING id",
  [company_name, company_code, email, hashedPassword]
);

    const companyId = company.rows[0].id;

    await pool.query(
      `INSERT INTO users (email,password,role,company_id)
       VALUES ($1,$2,'admin',$3)`,
      [email, hashedPassword, companyId]
    );

    res.json({ message: "Company created successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


app.get("/purchases",(req,res)=>{

const purchases=[

{
id:1,
supplier:"Huawei Zambia",
date:"2026-03-01",
status:"paid",
description:"5G network equipment",
reference:"INV-HUA-001",
total:7000
},

{
id:2,
supplier:"MTN Zambia",
date:"2026-03-05",
status:"pending",
description:"Mobile data packages",
reference:"INV-MTN-204",
total:1500
},

{
id:3,
supplier:"ZESCO Limited",
date:"2026-02-28",
status:"overdue",
description:"Office electricity bill",
reference:"BILL-778",
total:900
},

{
id:4,
supplier:"Airtel Zambia",
date:"2026-03-10",
status:"paid",
description:"Network infrastructure equipment",
reference:"INV-AIR-320",
total:2300
},

{
id:5,
supplier:"Zamtel Zambia",
date:"2026-03-12",
status:"pending",
description:"Fiber internet service",
reference:"INV-ZAM-550",
total:1800
}

]

res.json(purchases)

})

app.get("/cashbook", (req, res) => {

const transactions = [

{
date:"2026-03-01",
description:"Sales Invoice Payment",
party:"Huawei Zambia",
invoice:"INV-001",
type:"income",
amount:5000
},

{
date:"2026-03-03",
description:"Internet Services",
party:"Airtel Zambia",
invoice:"BILL-100",
type:"expense",
amount:1200
},

{
date:"2026-03-05",
description:"Network Maintenance",
party:"Zamtel Zambia",
invoice:"BILL-120",
type:"expense",
amount:800
},

{
date:"2026-03-06",
description:"Invoice Payment",
party:"MTN Zambia",
invoice:"INV-002",
type:"income",
amount:2500
}

]

res.json(transactions)

})


app.get("/contacts",(req,res)=>{

const type=req.query.type

if(type && type!=="all"){

const filtered=contacts.filter(c=>c.type===type)

return res.json(filtered)

}

res.json(contacts)

})


app.get("/contacts/:id",(req,res)=>{

const id=parseInt(req.params.id)

const contact=contacts.find(c=>c.id===id)

if(!contact){

return res.status(404).json({error:"Contact not found"})

}

res.json(contact)

})


app.post("/contacts",(req,res)=>{

const {name,type,email,phone}=req.body

const newContact={

id:contacts.length+1,
name,
type,
email,
phone,
balance:0

}

contacts.push(newContact)

res.json(newContact)

})

app.put("/contacts/:id",(req,res)=>{

const id=parseInt(req.params.id)

const contact=contacts.find(c=>c.id===id)

if(!contact){

return res.status(404).json({error:"Contact not found"})

}

const {name,type,email,phone}=req.body

contact.name=name || contact.name
contact.type=type || contact.type
contact.email=email || contact.email
contact.phone=phone || contact.phone

res.json(contact)

})

app.delete("/contacts/:id",(req,res)=>{

const id=parseInt(req.params.id)

contacts=contacts.filter(c=>c.id!==id)

res.json({message:"Contact deleted"})

})

let projects = [
{
id:1,
name:"5G Network Deployment",
client:"MTN Zambia",
status:"active",
revenue:12000,
expenses:7000
},
{
id:2,
name:"Fiber Installation",
client:"Airtel Zambia",
status:"active",
revenue:8000,
expenses:3000
},
{
id:3,
name:"Billing System Upgrade",
client:"Zamtel",
status:"completed",
revenue:10000,
expenses:4000
},
{
id:4,
name:"Smart Meter System",
client:"ZESCO Limited",
status:"pending",
revenue:6000,
expenses:2500
}
]

app.get("/projects",(req,res)=>{

res.json(projects)

})

app.post("/projects",(req,res)=>{

const {name,client,status,revenue,expenses} = req.body

const newProject={
id:projects.length+1,
name,
client,
status,
revenue:Number(revenue),
expenses:Number(expenses)
}

projects.push(newProject)

res.json(newProject)

})

app.delete("/projects/:id",(req,res)=>{

const id=parseInt(req.params.id)

projects=projects.filter(p=>p.id!==id)

res.json({message:"Project deleted"})

})


app.put("/projects/:id", (req,res)=>{

const id = Number(req.params.id)

projects = projects.map(p => 
p.id === id ? { ...p, ...req.body } : p
)

res.json({success:true})

})

/* PAYMENTS DATA */

let payments = [

{
id:1,
date:"2026-03-01",
method:"MTN MoMo",
description:"Invoice Payment",
reference:"INV-001",
amount:1800,
type:"income"
},

{
id:2,
date:"2026-03-02",
method:"Airtel Money",
description:"Customer Payment",
reference:"INV-002",
amount:2500,
type:"income"
},

{
id:3,
date:"2026-03-03",
method:"Zamtel Kwacha",
description:"Internet Purchase",
reference:"BILL-201",
amount:1200,
type:"expense"
},

{
id:4,
date:"2026-03-05",
method:"Bank Transfer",
description:"Equipment Purchase",
reference:"BILL-305",
amount:900,
type:"expense"
}

]


/* GET PAYMENTS */

app.get("/payments",(req,res)=>{

res.json(payments)

})


/* ADD PAYMENT */

app.post("/payments",(req,res)=>{

const payment={

id:Date.now(),
date:req.body.date,
method:req.body.method,
description:req.body.description,
reference:req.body.reference,
amount:Number(req.body.amount),
type:req.body.type

}

payments.push(payment)

res.json(payment)

})

app.post("/purchases",(req,res)=>{

console.log("New purchase:",req.body)

res.json({message:"Purchase saved"})

})

app.get("/cashbook",(req,res)=>{

const {start,end}=req.query

const transactions=[

{
date:"2026-03-01",
description:"Sales Invoice Payment",
party:"Huawei Zambia",
invoice:"INV-001",
type:"income",
amount:5000
},

{
date:"2026-03-03",
description:"Internet Services",
party:"Airtel Zambia",
invoice:"BILL-100",
type:"expense",
amount:1200
},

{
date:"2026-03-05",
description:"Network Maintenance",
party:"Zamtel Zambia",
invoice:"BILL-120",
type:"expense",
amount:800
},

{
date:"2026-03-06",
description:"Invoice Payment",
party:"MTN Zambia",
invoice:"INV-002",
type:"income",
amount:2500
},

{
date:"2026-02-15",
description:"Office Rent",
party:"Property Manager",
invoice:"BILL-090",
type:"expense",
amount:1500
}

]

let filtered=transactions

if(start && end){

filtered=transactions.filter(t=>{

const d=new Date(t.date)

return d>=new Date(start) && d<=new Date(end)

})

}

res.json(filtered)

})



app.post("/send-invoice-email", authenticateToken, async (req, res) => {
  try {

    const { email, invoiceId } = req.body;

    if (!email || !invoiceId) {
      return res.status(400).json({ error: "Missing email or invoiceId" });
    }

    /* GET INVOICE */
    const invoiceRes = await pool.query(
      "SELECT * FROM invoices WHERE id = $1",
      [invoiceId]
    );

    const invoice = invoiceRes.rows[0];

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    /* SEND EMAIL */
    await sendEmail(
      email,
      `Invoice #INV-${invoiceId}`,
      `
      <h3>Invoice from InvoiceFlow</h3>
      <p>Amount: ${invoice.amount}</p>
      <p>Status: ${invoice.status}</p>
      `
    );

    res.json({ message: "Email sent successfully" });

  } catch (err) {
    console.error("EMAIL ERROR:", err);
    res.status(500).json({ error: "Email failed" });
  }
});


app.post("/restore/client/:id", auth, async (req, res) => {
  await pool.query(
    `UPDATE clients SET deleted = FALSE
     WHERE id = $1 AND company_id = $2`,
    [req.params.id, req.user.companyId]
  );

  res.json({ message: "Client restored" });
});

/* RESTORE INVOICE */
app.post("/restore/invoice/:id", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE invoices
       SET deleted = FALSE
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [req.params.id, req.user.companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json({ message: "Invoice restored successfully" });

  } catch (err) {
    console.error("RESTORE INVOICE ERROR:", err);
    res.status(500).json({ error: "Restore failed" });
  }
});

app.get("/recycle-bin", auth, async (req, res) => {

  console.log("TOKEN USER:", req.userId);
  console.log("COMPANY ID:", req.user.companyId);

  try {

    const clients = await pool.query(
      `SELECT id, name, email
       FROM clients
       WHERE company_id = $1
       AND deleted = TRUE`,
      [req.user.companyId]
    );

    res.json({ clients: clients.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/reports", auth, async (req, res) => {
  try {

    const invoices = await pool.query(
      `SELECT 
          i.id,
          i.total,
          i.status,
          i.created_at,
          c.name AS client_name
       FROM invoices i
       LEFT JOIN clients c 
         ON i.client_id = c.id
       WHERE i.company_id = $1`,
      [req.user.companyId]
    );

    const clients = await pool.query(
      `SELECT COUNT(*) FROM clients
       WHERE company_id = $1`,
      [req.user.companyId]
    );

    res.json({
      invoices: invoices.rows,
      totalClients: Number(clients.rows[0].count)
    });

  } catch (err) {
    console.error("REPORT ERROR:", err);
    res.status(500).json({ error: "Failed to load reports" });
  }
});






app.post("/signup", async (req, res) => {
  const { email, password, companyName } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  if (!companyName) {
    return res.status(400).json({ message: "Company name is required" });
  }

  const existing = await pool.query(
    "SELECT * FROM companies WHERE email = $1",
    [email]
  );

  if (existing.rows.length > 0) {
    return res.status(400).json({ message: "Email already exists" });
  }

  // ✅ HASH AFTER VALIDATION
  const hashedPassword = await bcrypt.hash(password, 10);

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  verificationCodes[email] = {
    code,
    companyName,
    password: hashedPassword,
    expires: Date.now() + 10 * 60 * 1000
  };



  // ✅ FIXED PART
  try {

await transporter.sendMail({
  from: `"InvoiceFlow" <${process.env.EMAIL_USER}>`,
  to: email,
  subject: "Verify your email - InvoiceFlow",
  html: `
  <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:40px;">
    <div style="max-width:520px; margin:auto; background:white; border-radius:12px; padding:30px; box-shadow:0 10px 25px rgba(0,0,0,0.1);">

      <!-- Brand -->
      <h2 style="color:#4f46e5; margin-bottom:5px;">InvoiceFlow</h2>
      <p style="color:#888; font-size:13px; margin-top:0;">Smart Invoicing Platform</p>

      <!-- Title -->
      <h3 style="margin-top:20px;">Verify your email</h3>

      <!-- Message -->
      <p style="color:#555; font-size:14px;">
        Welcome to <strong>InvoiceFlow</strong>. Please use the verification code below to complete your account setup.
      </p>

      <!-- Code -->
      <div style="text-align:center; margin:30px 0;">
        <span style="
          display:inline-block;
          background:#4f46e5;
          color:white;
          font-size:30px;
          letter-spacing:8px;
          padding:15px 25px;
          border-radius:10px;
          font-weight:bold;
        ">
          ${code}
        </span>
      </div>

      <!-- Info -->
      <p style="color:#777; font-size:13px;">
        This code will expire in 10 minutes.
      </p>

      <p style="color:#777; font-size:13px;">
        If you didn’t request this, you can safely ignore this email.
      </p>

      <!-- Footer -->
      <hr style="margin:30px 0; border:none; border-top:1px solid #eee;">

      <p style="font-size:12px; color:#999; text-align:center;">
        © ${new Date().getFullYear()} InvoiceFlow. All rights reserved.
      </p>

    </div>
  </div>
  `
});


    console.log("Email sent successfully");
  } catch (err) {
    console.error("Email error:", err);
    return res.status(500).json({ message: "Failed to send email" });
  }

  res.json({ message: "Verification code sent" });
});


app.post("/verify", async (req, res) => {
  const { email, userInputCode } = req.body;

  if (!email || !userInputCode) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const record = verificationCodes[email];

  if (!record) {
    return res.status(400).json({ message: "No code found" });
  }

  if (Date.now() > record.expires) {
    return res.status(400).json({ message: "Code expired" });
  }

  if (record.code !== userInputCode) {
    return res.status(400).json({ message: "Invalid code" });
  }

  // ✅ CHECK FIRST
  const existing = await pool.query(
    "SELECT * FROM companies WHERE email = $1",
    [email]
  );

  if (existing.rows.length > 0) {
    return res.status(400).json({ message: "Email already registered" });
  }

  // ✅ THEN INSERT

await pool.query(
  "INSERT INTO companies (name, email, password, verified) VALUES ($1, $2, $3, $4)",
  [record.companyName, email, record.password, true]
);

  delete verificationCodes[email];

  res.json({ message: "Verified successfully" });
});



app.get("/admin/companies", adminAuth, async (req, res) => {
console.log("🔥 ADMIN COMPANIES ROUTE HIT");  

const result = await pool.query(`
    SELECT 
      id, 
      name, 
      email, 
      verified,
      plan,
      status,
      trial_ends_at
    FROM companies 
    ORDER BY id DESC
  `);

  res.json(result.rows);
});


app.delete("/admin/company/:id", adminAuth, async (req, res) => {
  const { id } = req.params;

  await pool.query("DELETE FROM companies WHERE id = $1", [id]);

  res.json({ message: "Company deleted" });
});


app.put("/admin/company/:id/verify", adminAuth, async (req, res) => {
  const { id } = req.params;

  await pool.query(
    "UPDATE companies SET verified = NOT verified WHERE id = $1",
    [id]
  );

  res.json({ message: "Status updated" });
});

app.get("/admin-login", (req, res) => {
  res.sendFile(__dirname + "/admin-login.html");
});



app.get("/me", async (req, res) => {
  try {
    // 1. Get token
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Fetch user + company info
    const result = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.is_super_admin,
        c.id AS company_id,
        c.name AS company_name,
        c.plan,
        c.status
      FROM users u
      LEFT JOIN companies c 
        ON c.id = u.active_company_id
      WHERE u.id = $1
    `, [decoded.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];

    // 4. Send response
    res.json({
      id: user.id,
      email: user.email,
      is_super_admin: user.is_super_admin || false,

      company: user.company_id
        ? {
            id: user.company_id,
            name: user.company_name,
            plan: user.plan || "free",
            status: user.status || "active"
          }
        : null
    });

  } catch (err) {
    console.error("❌ /me error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


app.get("/debug-columns", async (req, res) => {
  const result = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'companies'
  `);
  res.json(result.rows);
});


app.get("/invitations", auth, async (req, res) => {
  try {

    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(400).json({ error: "No companyId in token" }); // 🔥 ADD
    }

    const result = await pool.query(
      `
      SELECT
        i.id,
        i.email,
        i.role,
        i.status,
        i.created_at,
        c.name AS company_name,
        CASE 
          WHEN i.status = 'pending' THEN i.token
          ELSE NULL
        END AS token
      FROM invitations i
      JOIN companies c ON c.id = i.company_id
      WHERE i.company_id = $1
      ORDER BY i.id DESC
      `,
      [companyId]
    );

    res.json({ data: result.rows });

  } catch (err) {
    console.error("❌ Invitations error FULL:", err); // 🔥 important
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/invitations", auth, async (req, res) => {
  try {
    const { email, role = "staff" } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const companyId = req.user.companyId;

    // 🔒 prevent duplicate pending invite
    const existing = await pool.query(
      `SELECT * FROM invitations
       WHERE email = $1 AND company_id = $2 AND status = 'pending'`,
      [email, companyId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Invitation already sent" });
    }

    // 🔑 generate secure token
    const token = crypto.randomBytes(32).toString("hex");

    const result = await pool.query(
      `
      INSERT INTO invitations (email, role, status, company_id, token, expires_at)
      VALUES ($1, $2, 'pending', $3, $4, NOW() + INTERVAL '7 days')
      RETURNING *
      `,
      [email, role, companyId, token]
    );

    // 📩 SEND EMAIL
    const inviteLink = `${process.env.FRONTEND_URL}/accept-invite.html?token=${token}`;

    await sgMail.send({
      to: email,
      from: process.env.EMAIL_FROM,
      subject: "You're invited to join a company",
      html: `
        <h2>You're invited 🎉</h2>
        <p>You’ve been invited to join a company.</p>
        <a href="${inviteLink}" style="padding:10px 15px;background:#4f46e5;color:#fff;text-decoration:none;">
          Accept Invitation
        </a>
        <p>This link expires in 7 days.</p>
      `
    });

    res.json({
      message: "Invitation sent",
      invitation: result.rows[0]
    });

  } catch (err) {
    console.error("Create invitation error:", err);
    res.status(500).json({ error: "Failed to send invitation" });
  }
});


app.post("/invitations/:id/accept", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const invite = await pool.query(
      "SELECT * FROM invitations WHERE id = $1",
      [id]
    );

    if (invite.rows.length === 0) {
      return res.status(404).json({ error: "Invite not found" });
    }

    const inv = invite.rows[0];

    // 1. Add user to company
    await pool.query(`
      INSERT INTO user_companies (user_id, company_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, [userId, inv.company_id, inv.role]);

    // 2. Mark invite accepted
    await pool.query(
      "UPDATE invitations SET status = 'accepted' WHERE id = $1",
      [id]
    );

    res.json({ message: "Joined company" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


app.post("/invitations/accept", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token required" });
    }

    // 🔍 find invitation
    const result = await pool.query(
      `
      SELECT * FROM invitations
      WHERE token = $1
      AND status = 'pending'
      AND expires_at > NOW()
      `,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired invitation" });
    }

    const invite = result.rows[0];

    // 👤 find user
    const userResult = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [invite.email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: "User not found. Please register first."
      });
    }

    const user = userResult.rows[0];

    // 🔗 attach user to company
    await pool.query(
      `UPDATE users
       SET company_id = $1, role = $2
       WHERE id = $3`,
      [invite.company_id, invite.role, user.id]
    );

    // ✅ mark invitation accepted
    await pool.query(
      `UPDATE invitations
       SET status = 'accepted'
       WHERE id = $1`,
      [invite.id]
    );

    res.json({ message: "Invitation accepted" });

  } catch (err) {
    console.error("Accept invitation error:", err);
    res.status(500).json({ error: "Failed to accept invitation" });
  }
});


app.post("/invitations/:id/decline", auth, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      "UPDATE invitations SET status = 'declined' WHERE id = $1",
      [id]
    );

    res.json({ message: "Invite declined" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


app.post("/invitations/accept", auth, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token required" });
    }

    // 🔍 Find invitation by token
    const result = await pool.query(
      `SELECT * FROM invitations WHERE token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invalid invitation link" });
    }

    const invite = result.rows[0];

    // ❌ Already used
    if (invite.status !== "pending") {
      return res.status(400).json({ error: "Invitation already used" });
    }

    // ❌ Expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: "Invitation expired" });
    }

    const userId = req.user.userId;

    // ✅ Add user to company
    await pool.query(
      `
      INSERT INTO user_companies (user_id, company_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
      `,
      [userId, invite.company_id, invite.role]
    );

    // ✅ Mark accepted
    await pool.query(
      `UPDATE invitations SET status = 'accepted' WHERE id = $1`,
      [invite.id]
    );

    res.json({ message: "Invitation accepted" });

  } catch (err) {
    console.error("Accept invite error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


app.put("/company/logo", auth, upload.single("logo"), async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const logo = req.file.filename;

    const result = await pool.query(
      `UPDATE companies
       SET logo = $1
       WHERE id = $2
       RETURNING logo`,
      [logo, req.user.companyId]
    );

    res.json({ logo: result.rows[0].logo });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload logo" });
  }
});



/* ================= SERVER ================= */

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, "0.0.0.0");

server.on("listening", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

server.on("error", (err) => {
  console.error("SERVER ERROR:");
  console.error(err);
});




// redeploy

