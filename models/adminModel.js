const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
  },
  password: {
    type: String,
  },
  otpHash: { type: String },
  otpExpires: { type: Date },
});

module.exports = mongoose.model("adminLogin", adminSchema);
