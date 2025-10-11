// models/Salary.js
const mongoose = require("mongoose");

const SalarySchema = new mongoose.Schema(
  {
    // Links
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminCompany",
      required: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmpDept",
      required: true,
    },

    // pay period
    payMonth: { type: Number, min: 1, max: 12, required: true },
    payYear: { type: Number, required: true },

    // Earnings (numeric fields preserved for backward compatibility)
    basicSalary: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    trAllowance: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    vda: { type: Number, default: 0 },

    // Deductions (numeric)
    epf: { type: Number, default: 0 },
    esic: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    uniform_deduction: { type: Number, default: 0 },
    late_login: { type: Number, default: 0 },
    others: { type: Number, default: 0 },
    lop: { type: Number, default: 0 },
    advance: { type: Number, default: 0 },

    // Attendance
    totalWorkingDays: { type: Number, default: 0 },
    paidDays: { type: Number, default: 0 },
    lopDays: { type: Number, default: 0 },
    leaves_taken: { type: Number, default: 0 },

    // Computed totals (numeric)
    totalEarnings: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    // tax: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 },

    // Optional metadata
    salarySlipNumber: { type: String, trim: true, index: true },
    notes: { type: String },

    // --- Encrypted fields (string) ---
    basicSalary_enc: { type: String },
    hra_enc: { type: String },
    trAllowance_enc: { type: String },
    specialAllowance_enc: { type: String },
    vda_enc: { type: String },

    epf_enc: { type: String },
    esic_enc: { type: String },
    professionalTax_enc: { type: String },
    uniform_deduction_enc: { type: String },
    late_login_enc: { type: String },
    others_enc: { type: String },
    advance_enc: { type: String },
    lop_enc: { type: String },

    totalEarnings_enc: { type: String },
    totalDeductions_enc: { type: String },
    // tax_enc: { type: String },
    netPay_enc: { type: String },

    snapshot_enc: { type: String }, // encrypted JSON string of snapshot
    notes_enc: { type: String },

    // flag indicating encrypted storage was used
    isEncrypted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// unique per employee + month + year
SalarySchema.index({ employee: 1, payMonth: 1, payYear: 1 }, { unique: true });

// compute totals before save/validate only when NOT encrypted
SalarySchema.pre("validate", function (next) {
  // If document is stored encrypted, skip numeric computations (controller already computed totals)
  if (this.isEncrypted) {
    return next();
  }

  const gross =
    Number(this.basicSalary || 0) +
    Number(this.hra || 0) +
    Number(this.trAllowance || 0) +
    Number(this.specialAllowance || 0) +
    Number(this.vda || 0);

  this.totalEarnings = Math.round((gross + Number.EPSILON) * 100) / 100;

  const uniform = Number(this.uniform_deduction || 0);
  const late = Number(this.late_login || 0);
  const otherComp = Number(this.others || 0);

  const computedAdvance =
    Math.round((uniform + late + otherComp + Number.EPSILON) * 100) / 100;
  this.advance = computedAdvance;

  const deductions =
    Number(this.epf || 0) +
    Number(this.esic || 0) +
    Number(this.professionalTax || 0) +
    Number(this.advance || 0) +
    Number(this.lop || 0); // <-- lop included

  this.totalDeductions = Math.round((deductions + Number.EPSILON) * 100) / 100;

  // const net =
  //   Number(this.totalEarnings || 0) -
  //   Number(this.totalDeductions || 0) -
  //   Number(this.tax || 0);
  // this.netPay = Math.round((net + Number.EPSILON) * 100) / 100;

  const net =
    Number(this.totalEarnings || 0) - Number(this.totalDeductions || 0);
  this.netPay = Math.round((net + Number.EPSILON) * 100) / 100;

  next();
});

module.exports = mongoose.model("Salary", SalarySchema);
