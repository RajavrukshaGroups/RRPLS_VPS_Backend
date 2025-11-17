const mongoose = require("mongoose");
const { decryptField } = require("../utils/encryption");

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
    basicSalaryEnc: { type: String, default: null },
    hraEnc: { type: String, default: null },
    trAllowanceEnc: { type: String, default: null },
    specialAllowanceEnc: { type: String, default: null },
    vdaEnc: { type: String, default: null },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

// Useful index for listing employees by company/department
employeeDetailsSchema.index({ company: 1, department: 1 });

function safeParseFloat(s) {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
employeeDetailsSchema.virtual("basicSalary").get(function () {
  if (!this.basicSalaryEnc) return null;
  try {
    return safeParseFloat(decryptField(this.basicSalaryEnc));
  } catch (e) {
    return null;
  }
});

employeeDetailsSchema.virtual("hra").get(function () {
  if (!this.hraEnc) return null;
  try {
    return safeParseFloat(decryptField(this.hraEnc));
  } catch (e) {
    return null;
  }
});

employeeDetailsSchema.virtual("trAllowance").get(function () {
  if (!this.trAllowanceEnc) return null;
  try {
    return safeParseFloat(decryptField(this.trAllowanceEnc));
  } catch (e) {
    return null;
  }
});

employeeDetailsSchema.virtual("specialAllowance").get(function () {
  if (!this.specialAllowanceEnc) return null;
  try {
    return safeParseFloat(decryptField(this.specialAllowanceEnc));
  } catch (e) {
    return null;
  }
});

employeeDetailsSchema.virtual("vda").get(function () {
  if (!this.vdaEnc) return null;
  try {
    return safeParseFloat(decryptField(this.vdaEnc));
  } catch (e) {
    return null;
  }
});

module.exports = mongoose.model("Employee", employeeDetailsSchema);
