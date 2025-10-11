require("dotenv").config();
const nodemailer = require("nodemailer");

async function testMail() {
  let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // use TLS (587)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const info = await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: process.env.ADMIN_EMAIL,
    subject: "SMTP Test",
    text: "Hello! ✅ Your SMTP setup works. You’ll receive OTPs here.",
  });

  console.log("Message sent:", info.messageId);
}

testMail().catch(console.error);
