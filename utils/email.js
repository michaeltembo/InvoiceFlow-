const transporter = require("../mailer");

// STEP 2 — Generate code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// STEP 3 — Send email
async function sendVerificationEmail(email, code) {
  await transporter.sendMail({
    from: '"InvoiceFlow" <yourgmail@gmail.com>',
    to: email,
    subject: "Your Verification Code",
    html: `
      <h2>Email Verification</h2>
      <p>Your code is:</p>
      <h1>${code}</h1>
      <p>This code expires in 10 minutes.</p>
    `
  });
}

module.exports = { generateCode, sendVerificationEmail };
