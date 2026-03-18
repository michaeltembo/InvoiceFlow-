const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail(to, subject, html) {
  try {
    await sgMail.send({
      to,
      from: "michaeltembo8035@gmail.com",
      subject,
      html
    });
  } catch (err) {
    console.error("SENDGRID ERROR:", err.response?.body || err);
  }
}

module.exports = { sendEmail };
