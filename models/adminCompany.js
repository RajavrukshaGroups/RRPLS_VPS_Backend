const mongoose = require("mongoose");

const adminCompanySchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
    companyAddress: { type: String, required: true, trim: true },
    companyLogo: {
      url: { type: String },
      filename: { type: String },
    },
    companyEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminCompany", adminCompanySchema);
