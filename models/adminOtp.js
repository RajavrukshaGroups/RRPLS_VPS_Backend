// models/AdminOtp.js
const mongoose = require("mongoose");

const AdminOtpSchema = new mongoose.Schema(
  {
    contact: { type: String, required: true, index: true }, // email here
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// optional TTL index if you want Mongo to auto-delete expired docs (remove expireAfterSeconds if you manage expiry differently)
AdminOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AdminOtp", AdminOtpSchema);
