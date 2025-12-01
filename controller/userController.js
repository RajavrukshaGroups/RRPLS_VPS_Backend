require("dotenv").config();
const Admin = require("../models/adminModel");
const { decryptField } = require("../utils/encryption"); // ADJUST path to your crypto file
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// generate 6-digit OTP
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();
// hash OTP before saving
const hashOTP = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    }

    // Try direct lookup first (works if email is stored plaintext)
    let adminDoc = await Admin.findOne({ email }).exec(); // removed .lean()

    // If not found, fallback: fetch all docs and decrypt emails to find a match
    if (!adminDoc) {
      const allAdmins = await Admin.find().exec(); // removed .lean()
      for (const doc of allAdmins) {
        try {
          const decryptedEmail = decryptField(doc.email);
          if (decryptedEmail === email) {
            adminDoc = doc;
            break;
          }
        } catch (err) {
          // ignore decryption errors for this doc and continue
        }
      }
    }

    if (!adminDoc) {
      return res
        .status(400)
        .json({ success: false, message: "Incorrect email ID" });
    }

    // ✅ now adminDoc is a full Mongoose document (can call .save())

    let storedPassword = adminDoc.password;
    if (
      typeof storedPassword === "string" &&
      storedPassword.split(":").length === 3
    ) {
      try {
        storedPassword = decryptField(storedPassword);
      } catch (err) {
        console.error("Failed to decrypt stored password:", err);
      }
    }

    if (typeof storedPassword === "string" && storedPassword.startsWith("$2")) {
      const ok = await bcrypt.compare(password, storedPassword);
      if (!ok)
        return res
          .status(400)
          .json({ success: false, message: "Incorrect password" });
    } else if (password !== storedPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Incorrect password" });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    adminDoc.otpHash = otpHash;
    adminDoc.otpExpires = otpExpires;
    await adminDoc.save(); // ✅ will now work properly

    // Send OTP
    const toEmail = process.env.ADMIN_EMAIL || "technical@rajavrukshagroup.in";
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: toEmail,
      subject: "Admin Login OTP",
      text: `Your OTP is ${otp}. It is valid for 5 minutes.`,
      html: `<p>Your OTP is <strong>${otp}</strong>.</p><p>It is valid for 5 minutes.</p>`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP ${otp} sent to ${toEmail}`);

    return res.status(200).json({
      success: true,
      otpSent: true,
      message: `OTP sent to admin email (${toEmail}).`,
    });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const adminVerifyOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp)
      return res
        .status(400)
        .json({ success: false, message: "OTP is required." });

    const admins = await Admin.find();
    const adminDoc = admins[0];

    if (!adminDoc || !adminDoc.otpHash)
      return res.status(400).json({
        success: false,
        message: "No OTP request found. Please login again.",
      });

    if (new Date() > new Date(adminDoc.otpExpires))
      return res
        .status(400)
        .json({ success: false, message: "OTP expired. Please re-login." });

    const hash = hashOTP(otp);
    if (hash !== adminDoc.otpHash)
      return res
        .status(400)
        .json({ success: false, message: "Invalid OTP entered." });

    adminDoc.otpHash = undefined;
    adminDoc.otpExpires = undefined;
    await adminDoc.save();

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully.",
    });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const verifyDeploy = async (req, res) => {};

module.exports = { login, adminVerifyOTP, verifyDeploy };
