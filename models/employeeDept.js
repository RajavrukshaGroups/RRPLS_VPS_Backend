const mongoose = require("mongoose");

const employeeDeptSchema = new mongoose.Schema(
  {
    department: { type: String, required: true, trim: true },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminCompany",
      required: true,
    },
  },
  { timestamps: true }
);

// Ensure unique department name per company
employeeDeptSchema.index(
  { company: 1, department: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("EmpDept", employeeDeptSchema);
