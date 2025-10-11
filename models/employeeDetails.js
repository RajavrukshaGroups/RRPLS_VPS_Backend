const mongoose = require("mongoose");

const employeeDetailsSchema = new mongoose.Schema(
  {
    employeeName: { type: String, required: true, trim: true },
    employeeId: { type: String, required: true, trim: true, unique: true },
    designation: { type: String, trim: true },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminCompany",
      required: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmpDept",
      required: true,
    },
    dateOfJoining: { type: Date },
    aadhar: { type: String, trim: true },
    UAN: { type: String, trim: true },
    pfNo: { type: String, trim: true },
    esiNo: { type: String, trim: true },
    bankName: { type: String, trim: true },
    bankAccountNo: { type: String, trim: true },
    bankIFSCNo: { type: String, trim: true },
    bankBranchName: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
      match: [/^[0-9]{10}$/, "Please enter a valid 10-digit mobile number"],
    },
  },
  { timestamps: true }
);

// Useful index for listing employees by company/department
employeeDetailsSchema.index({ company: 1, department: 1 });

module.exports = mongoose.model("Employee", employeeDetailsSchema);
