require("dotenv").config();   // ✅ MUST BE FIRST

const express = require("express");
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

const app = express();


const crypto = require("crypto");
const auth = require("./middleware/auth");
const requireAdmin = require("./middleware/requireAdmin");
const { sendEmail } = require("../utils/sendEmail");

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));


app.use(express.static("public"));


// ✅ Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// ✅ Root route loads login.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ✅ Mount invoice routes
app.use("/invoices", invoiceRoutes);

app.use(express.static("public"));

let contacts = [

{
id:1,
name:"MTN Zambia",
type:"customer",
email:"support@mtn.zm",
phone:"+260960000000",
balance:1800
},

{
id:2,
name:"Airtel Zambia",
type:"customer",
email:"support@airtel.com",
phone:"+260970000000",
balance:2500
},

{
id:3,
name:"Zamtel",
type:"supplier",
email:"info@zamtel.co.zm",
phone:"+260950000000",
balance:-1200
},

{
id:4,
name:"ZESCO Limited",
type:"supplier",
email:"info@zesco.co.zm",
phone:"+260211000000",
balance:-900
}

]


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
const { email, password } = req.body;

const result = await pool.query(
"SELECT * FROM users WHERE email = $1",
[email]
);

if (result.rows.length === 0) {
return res.status(400).json({ error: "Invalid credentials" });
}

const user = result.rows[0];

const valid = await bcrypt.compare(password, user.password);
if (!valid) {
return res.status(400).json({ error: "Invalid credentials" });
}

// 🔥 PUT IT HERE
const token = jwt.sign(
{
userId: user.id,
companyId: user.company_id,
role: user.role
},
process.env.JWT_SECRET,
{ expiresIn: "7d" }
);

res.json({ token });
});

app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    //  Only allow admin
    if (user.role !== "admin") {
      return res.status(403).json({ error: "Admin access only" });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        companyId: user.company_id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch (err) {
    console.error("ADMIN LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= CLIENTS ================= */

app.post("/clients", auth, async (req, res) => {
  try {
const { name, email, phone, country, avatar } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Client name required" });
    }

    const userResult = await pool.query(
      "SELECT company_id FROM users WHERE id = $1",
      [req.userId]
    );

    const companyId = userResult.rows[0].company_id;

    const result = await pool.query(
      `INSERT INTO clients
(name, email, phone, country, avatar, status, user_id, company_id)
VALUES ($1,$2,$3,$4,$5,'active',$6,$7)
       RETURNING *`,

[
  name,
  email || null,
  phone || null,
  country || null,
  avatar || null,
  req.userId,
  companyId
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
  COALESCE(SUM(i.total),0) AS total_revenue,
  COUNT(i.id) AS invoice_count

      FROM clients c
      LEFT JOIN invoices i 
        ON i.client_id = c.id
        AND i.company_id = $1
      WHERE c.company_id = $1
     GROUP BY
  c.id,
  c.name,
  c.email,
  c.phone,
  c.country,
  c.avatar,
  c.status
      ORDER BY c.created_at DESC
      `,
      [req.companyId]
    );

    res.json(result.rows);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "Failed to fetch clients" });

  }
});


app.delete("/clients/:id", auth, async (req, res) => {
  try {

    const id = req.params.id;

    console.log("Deleting client:", id);
    console.log("Company:", req.companyId);

    const result = await pool.query(
      `DELETE FROM clients
       WHERE id = $1 AND company_id = $2`,
      [id, req.companyId]
    );

    console.log("Rows deleted:", result.rowCount);

    if(result.rowCount === 0){
      return res.status(404).json({error:"Client not found"});
    }

    res.json({message:"Client deleted successfully"});

  } catch(err){
    console.error(err);
    res.status(500).json({error:"Delete failed"});
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

    // ✅ Calculate subtotal

let subtotal = 0;

for (const item of items) {
  const quantity = Number(item.quantity) || 0;

  // Accept both price and unit_price
  const unitPrice =
    Number(item.unit_price ?? item.price) || 0;

  subtotal += quantity * unitPrice;
}

    // ✅ Calculate tax
    const taxAmount = subtotal * (Number(tax_rate) / 100);

    // ✅ Calculate total
    const total = subtotal + taxAmount;

    // ✅ Insert invoice
    const invoiceResult = await client.query(
      `
      INSERT INTO invoices
      (user_id, client_id, amount, subtotal, tax_amount, total, tax_rate, status, created_at, due_date, company_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10)
      RETURNING id
      `,
      [
        userId,
        client_id,
        total,        // amount (NOT NULL)
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

    // ✅ Insert invoice items
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

    const companyId = req.companyId;

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

/* ================= DASHBOARD ================= */

app.get("/dashboard-summary", authenticateToken, async (req, res) => {

  try {
    const companyId = req.user.companyId;

    console.log("Dashboard company:", companyId);

    // Total Clients
    const clients = await pool.query(
      "SELECT COUNT(*) AS total FROM clients WHERE company_id = $1",
      [companyId]
    );

    // Active Clients (clients with invoices)
    const activeClients = await pool.query(
      `SELECT COUNT(DISTINCT client_id) AS total
       FROM invoices
       WHERE company_id = $1`,
      [companyId]
    );

    // Total Revenue (paid invoices)
    const revenue = await pool.query(
      `SELECT COALESCE(SUM(total),0) AS total
       FROM invoices
       WHERE company_id = $1 AND status = 'paid'`,
      [companyId]
    );

    // Outstanding
    const outstanding = await pool.query(
      `SELECT COALESCE(SUM(total),0) AS total
       FROM invoices
       WHERE company_id = $1 AND status != 'paid'`,
      [companyId]
    );

    // Recent invoices

const recentInvoices = await pool.query(`
  SELECT 
    invoices.id,
    clients.name AS client_name,
    invoices.status,
    invoices.total,
    invoices.due_date
  FROM invoices
  JOIN clients ON invoices.client_id = clients.id
  WHERE invoices.company_id = $1
  ORDER BY invoices.created_at DESC
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
    const result = await pool.query(
      `SELECT invoices.*, clients.email
       FROM invoices
       JOIN clients ON invoices.client_id=clients.id
       WHERE invoices.id=$1 AND invoices.user_id=$2`,
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
const companyId = req.companyId;

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
        req.companyId
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
    const result = await pool.query(
      "SELECT * FROM company_settings WHERE user_id = $1",
      [req.userId]
    );

    res.status(200).json(result.rows[0] || {});
  } catch (err) {
    console.error("GET COMPANY SETTINGS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.use("/invoices", invoiceRoutes);

app.post("/register", async (req,res)=>{

try{

const { company_name, company_code, email, password } = req.body;

if(!company_name || !company_code || !email || !password){
return res.status(400).json({error:"All fields required"});
}

const companyCheck = await pool.query(
"SELECT id FROM companies WHERE code=$1",
[company_code]
);

if(companyCheck.rows.length > 0){
return res.status(400).json({error:"Company code already taken"});
}

const hashedPassword = await bcrypt.hash(password,10);

const companyResult = await pool.query(
`INSERT INTO companies (name,email,password,code)
VALUES ($1,$2,$3,$4)
RETURNING id`,
[company_name,email,hashedPassword,company_code]
);

const companyId = companyResult.rows[0].id;

await pool.query(
`INSERT INTO users (email,password,role,company_id)
VALUES ($1,$2,'admin',$3)`,
[email,hashedPassword,companyId]
);

res.json({message:"Company created successfully"});

}catch(err){

console.error(err);
res.status(500).json({error:"Registration failed"});

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
const userId = req.user.userId;

const {
company_name,   // ✅ FIXED
registration_number,
email,
phone,
address,
country,

bank_name,
account_name,
account_number,
branch,
swift,          // ✅ INCLUDED
mobile_money,
invoice_footer

} = req.body;

const name = company_name; // ✅ MAP FIX

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
(user_id, bank_name, account_name, account_number, branch, swift, mobile_money, invoice_footer)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8)

ON CONFLICT (user_id)
DO UPDATE SET
bank_name = EXCLUDED.bank_name,
account_name = EXCLUDED.account_name,
account_number = EXCLUDED.account_number,
branch = EXCLUDED.branch,
swift = EXCLUDED.swift,                 -- ✅ FIX
mobile_money = EXCLUDED.mobile_money,
invoice_footer = EXCLUDED.invoice_footer`,
[
userId,
bank_name,
account_name,
account_number,
branch,
swift,          // ✅ FIX
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

    res.json(result.rows[0]);

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

    success_url:"http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url:"http://localhost:3000/dashboard.html"

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


app.post("/billing-portal", authenticateToken, async (req,res)=>{

  const result = await pool.query(
    "SELECT stripe_customer_id,email FROM users WHERE id=$1",
    [req.user.userId]
  );

  const user = result.rows[0];

  let customerId = user.stripe_customer_id;

  if(!customerId){

    const customer = await stripe.customers.create({
      email: user.email
    });

    customerId = customer.id;

    await pool.query(
      "UPDATE users SET stripe_customer_id=$1 WHERE id=$2",
      [customerId, req.user.userId]
    );

  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: "http://localhost:3000/dashboard.html"
  });

  res.json({url:session.url});

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

    console.log("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);

  }

  // Payment failed
  if (event.type === "invoice.payment_failed") {

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

      console.log("User downgraded to free plan");

    }

  }

  res.json({ received: true });

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
      "INSERT INTO companies (name, code) VALUES ($1,$2) RETURNING id",
      [company_name, company_code]
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

try{

const { email, invoiceId } = req.body;

if(!email || !invoiceId){
return res.status(400).json({ error: "Missing email or invoiceId" });
}

/* GET INVOICE */

const invoiceRes = await pool.query(
"SELECT * FROM invoices WHERE id = $1",
[invoiceId]
);

const invoice = invoiceRes.rows[0];

if(!invoice){
return res.status(404).json({ error: "Invoice not found" });
}





/* EMAIL CONTENT */

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

}catch(err){
console.error("EMAIL ERROR:", err);
res.status(500).json({ error: "Email failed" });
}


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




