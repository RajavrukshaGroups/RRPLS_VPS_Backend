// controllers/adminController.js
require("dotenv").config();
const { error } = require("console");
const AdminOtp = require("../models/adminOtp");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const path = require("path");

const AdminCompany = require("../models/adminCompany");
const { title } = require("process");
const { url } = require("inspector");
const employeeDept = require("../models/employeeDept");
const Employee = require("../models/employeeDetails");
const Salary = require("../models/employeeSalary");
const { encryptField, decryptField } = require("../utils/encryption");
const { default: mongoose } = require("mongoose");
const ejs = require("ejs");
const puppeteer = require("puppeteer");

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL, ADMIN_EMAIL } =
  process.env;

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  // verify transporter (optional)
  transporter
    .verify()
    .catch((err) =>
      console.warn("SMTP transporter verify failed:", err.message)
    );
} else {
  console.warn("SMTP not configured - OTPs will be logged to console.");
}

const generateOtp = () => {
  return String(crypto.randomInt(100000, 1000000)); // 6-digit
};

const adminSendOTP = async (req, res) => {
  try {
    // We accept an optional `contact` (email) in body; fallback to ADMIN_EMAIL env var
    const contact = (req.body.contact || ADMIN_EMAIL || "").toString().trim();
    if (!contact) {
      return res
        .status(400)
        .json({ success: false, message: "contact (email) required" });
    }

    // rate-limiting: prevent more than 1 per 60s
    const recent = await AdminOtp.findOne({ contact }).sort({ createdAt: -1 });
    if (recent && new Date() - recent.createdAt < 60 * 1000) {
      return res.status(429).json({
        success: false,
        message: "Please wait a bit before requesting another OTP.",
      });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes
    const doc = new AdminOtp({ contact, otp, expiresAt });
    await doc.save();

    // send email if transporter available
    if (transporter) {
      const mailOptions = {
        from: FROM_EMAIL || SMTP_USER,
        to: contact,
        subject: "Your Admin OTP",
        text: `Your OTP is ${otp}. It will expire in 2 minutes.`,
        html: `<p>Your OTP is <strong>${otp}</strong>. It will expire in 2 minutes.</p>`,
      };
      try {
        await transporter.sendMail(mailOptions);
      } catch (mailErr) {
        console.error("Error sending OTP email:", mailErr);
        // don't fail the whole request — fallback to console logging
        console.log(
          `OTP for ${contact}: ${otp} (expires ${expiresAt.toISOString()})`
        );
      }
    } else {
      // dev fallback
      console.log(
        `ADMIN OTP for ${contact}: ${otp} (expires ${expiresAt.toISOString()})`
      );
    }

    return res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    console.error("adminSendOTP error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// const adminVerifyOTP = async (req, res) => {
//   try {
//     const contact = (req.body.contact || ADMIN_EMAIL || "").toString().trim();
//     const otp = (req.body.otp || "").toString().trim();

//     if (!contact || !otp) {
//       return res
//         .status(400)
//         .json({ success: false, message: "contact and otp required" });
//     }

//     const doc = await AdminOtp.findOne({ contact }).sort({ createdAt: -1 });
//     if (!doc)
//       return res
//         .status(400)
//         .json({ success: false, message: "No OTP requested for this contact" });

//     if (doc.used)
//       return res
//         .status(400)
//         .json({ success: false, message: "OTP already used" });

//     if (new Date() > doc.expiresAt)
//       return res.status(400).json({ success: false, message: "OTP expired" });

//     if (doc.attempts >= 5) {
//       return res.status(429).json({
//         success: false,
//         message: "Too many attempts. Request a new OTP.",
//       });
//     }

//     if (doc.otp !== otp) {
//       doc.attempts += 1;
//       await doc.save();
//       return res.status(400).json({ success: false, message: "Invalid OTP" });
//     }

//     doc.used = true;
//     await doc.save();

//     // optionally: create session JWT here. For now we just return success
//     return res.json({ success: true, message: "OTP verified" });
//   } catch (err) {
//     console.error("adminVerifyOTP error:", err);
//     return res.status(500).json({ success: false, message: "Server error" });
//   }
// };

const adminVerifyOTP = async (req, res) => {};

const addCompany = async (req, res) => {
  try {
    const { companyName, companyAddress, companyEmail } = req.body;
    const file = req.file;

    // Validate companyName
    if (
      !companyName ||
      typeof companyName !== "string" ||
      companyName.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Company name is required.",
      });
    }

    // Validate companyAddress
    if (
      !companyAddress ||
      typeof companyAddress !== "string" ||
      companyAddress.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Company address is required.",
      });
    }

    if (!companyEmail || !/^\S+@\S+\.\S+$/.test(companyEmail)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid email is required" });
    }

    // ✅ Check for duplicate companyName (case-insensitive)
    const existingCompany = await AdminCompany.findOne({
      companyName: { $regex: new RegExp(`^${companyName}$`, "i") },
    });

    if (existingCompany) {
      return res.status(400).json({
        success: false,
        message: "This company name is already added.",
      });
    }

    // Validate file upload
    if (!file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a company logo.",
      });
    }

    const validImageTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    // ⚠️ It's `file.mimetype` not `file.mimeType`
    if (!validImageTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Only image files are allowed.",
      });
    }

    const url = file.path; // Cloudinary URL
    const filename = file.filename;

    const newCompany = new AdminCompany({
      companyName: companyName.trim(),
      companyAddress: companyAddress.trim(),
      companyEmail: companyEmail.trim(),
      companyLogo: { url, filename },
    });

    await newCompany.save();

    return res.status(201).json({
      success: true,
      message: "Company profile submitted successfully!",
      company: newCompany,
    });
  } catch (err) {
    console.error("addCompany error", err);
    return res.status(500).json({
      success: false,
      message: "Server error while adding company.",
      error: err.message,
    });
  }
};

const getCompanyList = async (req, res) => {
  try {
    const companyList = await AdminCompany.find();
    console.log("companies", companyList);
    res.status(200).json({ success: true, company: companyList });
  } catch (err) {
    console.error("error fetching company details", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch career details" });
  }
};

const getCompanyDetails = async (req, res) => {
  try {
    const indCompanyDetails = await AdminCompany.findById(req.params.id);
    if (!indCompanyDetails) {
      return res
        .status(404)
        .json({ success: false, message: "Company details not found" });
    }
    res.status(200).json({ success: true, data: indCompanyDetails });
  } catch (e) {
    console.error("error fetching career details", e);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch career details" });
  }
};

// utils: helper to escape regex special chars
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const updateCompanyDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyName, companyAddress, companyEmail } = req.body;
    const file = req.file;

    if (
      !companyName ||
      typeof companyName !== "string" ||
      companyName.trim().length === 0
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or missing company name." });
    }

    if (
      !companyAddress ||
      typeof companyAddress !== "string" ||
      companyAddress.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing company address.",
      });
    }

    if (
      !companyEmail ||
      !/^\S+@\S+\.\S+$/.test(companyEmail) ||
      companyEmail.trim().length === 0
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Valid email is required" });
    }

    const trimmedName = companyName.trim();
    const trimmedAddress = companyAddress.trim();
    const trimmedEmail = companyEmail.trim();

    // -------------- DUPLICATE CHECK --------------
    // case-insensitive exact match (anchored)
    const escaped = escapeRegExp(trimmedName);
    const existing = await AdminCompany.findOne({
      companyName: { $regex: `^${escaped}$`, $options: "i" },
      _id: { $ne: id }, // exclude the company being edited
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message:
          "A company with this name already exists. Please pick a different name.",
      });
    }
    // ---------------------------------------------

    const updatedData = {
      companyName: trimmedName,
      companyAddress: trimmedAddress,
      companyEmail: trimmedEmail,
    };

    if (file) {
      updatedData.companyLogo = { url: file.path, filename: file.filename };
    }

    const updatedCompanyDetails = await AdminCompany.findByIdAndUpdate(
      id,
      updatedData,
      { new: true }
    );

    if (!updatedCompanyDetails) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }

    res.status(200).json({
      success: true,
      message: "Company updated successfully!",
      data: updatedCompanyDetails,
    });
  } catch (error) {
    console.error("error updating company", error);
    res
      .status(500)
      .json({ success: false, message: "An error occurred while updating" });
  }
};

// const deleteCompanyDetails = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!id || !mongoose.Types.ObjectId.isValid(id)) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Valid company id is required" });
//     }

//     const deletedCompany = await AdminCompany.findByIdAndDelete(id);

//     if (!deletedCompany) {
//       return res.status(404).json({
//         success: false,
//         message: "Company not found",
//       });
//     }

//     await employeeDept.deleteMany({ company: id });

//     res.status(200).json({
//       success: true,
//       message: "Company and its departments deleted successfully!",
//       data: deletedCompany,
//     });
//   } catch (error) {
//     console.error("Error deleting company:", error);
//     res.status(500).json({
//       success: false,
//       message: "An error occurred while deleting the company",
//     });
//   }
// };

const deleteCompanyDetails = async (req, res) => {
  const { id } = req.params;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json({ success: false, message: "Valid company id is required" });
  }

  const session = await mongoose.startSession();

  try {
    // Use withTransaction so all deletes commit/abort together
    const result = await session.withTransaction(
      async () => {
        // Ensure company exists
        const company = await AdminCompany.findById(id).session(session);
        if (!company) {
          // Throw an object so outer catch can handle status/message
          throw { status: 404, message: "Company not found" };
        }

        // Delete departments for the company
        const deptDeleteRes = await employeeDept
          .deleteMany({
            company: company._id,
          })
          .session(session);

        // Delete employees for the company
        const empDeleteRes = await Employee.deleteMany({
          company: company._id,
        }).session(session);

        // Delete salary records for the company (you said company id is present in salary docs)
        const salaryDeleteRes = await Salary.deleteMany({
          company: company._id,
        }).session(session);

        // Finally delete the company itself
        const companyDeleteRes = await AdminCompany.deleteOne({
          _id: company._id,
        }).session(session);

        // return a summary
        return {
          deletedCompany: company.toObject(),
          deletedCounts: {
            departments: deptDeleteRes.deletedCount ?? 0,
            employees: empDeleteRes.deletedCount ?? 0,
            salaries: salaryDeleteRes.deletedCount ?? 0,
            companyDeleted: companyDeleteRes.deletedCount ?? 0,
          },
        };
      },
      {
        readPreference: "primary",
        readConcern: { level: "local" },
        writeConcern: { w: "majority" },
      }
    );

    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Company and related data deleted successfully.",
      data: result,
    });
  } catch (err) {
    // If we threw a custom object in the transaction callback (e.g., 404), handle it
    if (err && err.status) {
      session.endSession();
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    }

    const errMsg = (err && err.message) || "";

    // If transactions are not supported (e.g., standalone mongod), fallback to sequential deletes
    const txnNotSupported =
      /transactions are not supported|Transaction numbers|InvalidOperation: transactions are not supported/i.test(
        errMsg
      );

    if (txnNotSupported) {
      session.endSession();
      try {
        // Best-effort sequential deletes (non-transactional)
        const companyDoc = await AdminCompany.findByIdAndDelete(id);
        if (!companyDoc) {
          return res
            .status(404)
            .json({ success: false, message: "Company not found" });
        }

        const deptRes = await employeeDept.deleteMany({ company: id });
        const empRes = await Employee.deleteMany({ company: id });
        const salaryRes = await Salary.deleteMany({ company: id });

        return res.status(200).json({
          success: true,
          message:
            "Company and related records deleted (no transactions available). " +
            "This was performed as best-effort sequential deletes.",
          data: {
            deletedCompany: companyDoc.toObject(),
            deletedCounts: {
              departments: deptRes.deletedCount ?? 0,
              employees: empRes.deletedCount ?? 0,
              salaries: salaryRes.deletedCount ?? 0,
              companyDeleted: 1,
            },
          },
        });
      } catch (fallbackErr) {
        console.error("Fallback deletion error:", fallbackErr);
        return res.status(500).json({
          success: false,
          message:
            "Error deleting company and related records during fallback.",
          error: fallbackErr.message,
        });
      }
    }

    // Otherwise it's a general server error
    console.error("deleteCompanyDetails error:", err);
    session.endSession();
    return res.status(500).json({
      success: false,
      message: "Server error while deleting company",
      error: errMsg,
    });
  }
};

const createDept = async (req, res) => {
  try {
    // expecting JSON body like: { companyId: "...", department: "Sales" }
    const { companyId, department } = req.body;

    // basic validation
    if (
      !companyId ||
      typeof companyId !== "string" ||
      companyId.trim() === ""
    ) {
      return res
        .status(400)
        .json({ success: false, message: "companyId is required" });
    }
    if (
      !department ||
      typeof department !== "string" ||
      department.trim() === ""
    ) {
      return res
        .status(400)
        .json({ success: false, message: "department name is required" });
    }

    // validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid companyId" });
    }

    // check company exists
    const company = await AdminCompany.findById(companyId);
    if (!company) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }

    const deptName = department.trim();

    const existingDept = await employeeDept.findOne({
      company: companyId,
      department: { $regex: new RegExp(`^${deptName}$`, "i") },
    });

    if (existingDept) {
      return res.status(409).json({
        success: false,
        message:
          "Department already exists for this company (case-insensitive match)",
      });
    }

    // create and save (unique index on { company, department } will prevent duplicates)
    const newDept = new employeeDept({
      department: deptName,
      company: companyId,
    });

    await newDept.save();

    return res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: newDept,
    });
  } catch (err) {
    // duplicate key error from unique index
    if (err && err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Department already exists for this company",
      });
    }

    console.error("createDept error:", err);
    return res.status(500).json({
      success: false,
      message: "An error occurred while creating the department",
    });
  }
};

const getDepartmentListUnderEachCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({
        success: false,
        message: "Valid companyId route param is required",
      });
    }
    const company = await AdminCompany.findById(companyId).lean();
    if (!company) {
      return res.status(404).json({
        success: false,
        message: `Company with id "${companyId}" not found`,
      });
    }

    const departments = await employeeDept
      .find({ company: company._id })
      .sort({ department: 1 })
      .lean();

    if (!departments || departments.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No departments have been added for this company",
        company: { _id: company._id, companyName: company.companyName },
      });
    }

    return res.status(200).json({
      success: true,
      company: { _id: company._id, companyName: company.companyName },
      departments,
    });
  } catch (err) {
    console.error("get departments error", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching departments",
    });
  }
};

const editDepartmentUnderEachCompany = async (req, res) => {
  try {
    const { companyId, deptId } = req.params;
    const { department } = req.body; // expecting { department: "New Name" }

    // validate ids
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid companyId param is required" });
    }
    if (!deptId || !mongoose.Types.ObjectId.isValid(deptId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid deptId param is required" });
    }

    // validate input
    if (
      !department ||
      typeof department !== "string" ||
      department.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "department name is required in request body",
      });
    }

    const newName = department.trim();

    // ensure company exists
    const company = await AdminCompany.findById(companyId).lean();
    if (!company) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }

    // ensure department exists and belongs to this company
    const dept = await employeeDept.findById(deptId).lean();
    if (!dept) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }
    if (String(dept.company) !== String(companyId)) {
      return res.status(400).json({
        success: false,
        message: "This department does not belong to the specified company",
      });
    }

    // case-insensitive duplicate check: is there another dept in the same company with the same name?
    const duplicate = await employeeDept
      .findOne({
        company: companyId,
        _id: { $ne: deptId }, // exclude the current dept
        department: { $regex: new RegExp(`^${escapeRegExp(newName)}$`, "i") },
      })
      .lean();

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "Another department with the same name already exists for this company (case-insensitive)",
      });
    }

    // perform update
    const updated = await employeeDept
      .findOneAndUpdate(
        { _id: deptId },
        { $set: { department: newName } },
        { new: true, runValidators: true }
      )
      .lean();

    return res.status(200).json({
      success: true,
      message: "Department updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("editDepartmentListUnderEachCompany error:", err);

    // handle duplicate-key db-level (index) error fallback
    if (err && err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Department already exists for this company (duplicate key).",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while updating department",
    });
  }
};

// helper: escape regex metacharacters for department names
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const deleteDepartmentUnderEachCompany = async (req, res) => {
  const { companyId, deptId } = req.params;

  if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
    return res
      .status(400)
      .json({ success: false, message: "Valid companyId param is required" });
  }
  if (!deptId || !mongoose.Types.ObjectId.isValid(deptId)) {
    return res
      .status(400)
      .json({ success: false, message: "Valid deptId param is required" });
  }

  const session = await mongoose.startSession();

  try {
    // Run all deletes in a transaction if possible
    const result = await session.withTransaction(
      async () => {
        // ensure company exists
        const company = await AdminCompany.findById(companyId).session(session);
        if (!company) {
          throw { status: 404, message: "Company not found" };
        }

        // ensure dept exists and belongs to company
        const dept = await employeeDept
          .findOne({
            _id: deptId,
            company: companyId,
          })
          .session(session);
        if (!dept) {
          throw {
            status: 404,
            message: "Department not found for this company",
          };
        }

        // Delete salary records for this department and company
        const salaryDeleteRes = await Salary.deleteMany({
          company: company._id,
          department: dept._id,
        }).session(session);

        // Delete employees for this department and company
        const empDeleteRes = await Employee.deleteMany({
          company: company._id,
          department: dept._id,
        }).session(session);

        // Delete the department itself
        const deptDeleteRes = await employeeDept
          .deleteOne({
            _id: dept._id,
          })
          .session(session);

        return {
          deleted: {
            departmentId: deptId,
            departmentName: dept.department,
            departmentsDeleted: deptDeleteRes.deletedCount ?? 0,
            employeesDeleted: empDeleteRes.deletedCount ?? 0,
            salariesDeleted: salaryDeleteRes.deletedCount ?? 0,
          },
        };
      },
      {
        readPreference: "primary",
        readConcern: { level: "local" },
        writeConcern: { w: "majority" },
      }
    );

    session.endSession();

    return res.status(200).json({
      success: true,
      message:
        "Department, its employees and related salary records deleted successfully.",
      data: result.deleted,
    });
  } catch (err) {
    // handle custom thrown errors
    if (err && err.status) {
      session.endSession();
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    }

    const errMsg = (err && err.message) || "";

    // fallback when transactions are not supported (standalone mongod)
    const txnNotSupported =
      /transactions are not supported|Transaction numbers|InvalidOperation: transactions are not supported/i.test(
        errMsg
      );

    if (txnNotSupported) {
      session.endSession();
      try {
        // best-effort sequential deletes
        const company = await AdminCompany.findById(companyId);
        if (!company) {
          return res
            .status(404)
            .json({ success: false, message: "Company not found" });
        }

        const dept = await employeeDept.findOne({
          _id: deptId,
          company: companyId,
        });
        if (!dept) {
          return res.status(404).json({
            success: false,
            message: "Department not found for this company",
          });
        }

        const salaryRes = await Salary.deleteMany({
          company: companyId,
          department: deptId,
        });
        const empRes = await Employee.deleteMany({
          company: companyId,
          department: deptId,
        });
        const deptRes = await employeeDept.deleteOne({ _id: deptId });

        return res.status(200).json({
          success: true,
          message:
            "Department and related employees/salaries deleted (no transactions available).",
          data: {
            departmentId: deptId,
            departmentName: dept.department,
            departmentsDeleted: deptRes.deletedCount ?? 0,
            employeesDeleted: empRes.deletedCount ?? 0,
            salariesDeleted: salaryRes.deletedCount ?? 0,
          },
        });
      } catch (fallbackErr) {
        console.error(
          "Fallback deleteDepartmentUnderEachCompany error:",
          fallbackErr
        );
        return res.status(500).json({
          success: false,
          message:
            "Error deleting department and related records during fallback.",
          error: fallbackErr.message,
        });
      }
    }

    // Other errors
    console.error("deleteDepartmentUnderEachCompany error:", err);
    session.endSession();
    return res.status(500).json({
      success: false,
      message: "Server error while deleting department",
      error: errMsg,
    });
  }
};

const createEmployeeRecord = async (req, res) => {
  try {
    const { companyId, deptId } = req.params;
    const body = req.body || {};

    // validate IDs
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid companyId param required" });
    }
    if (!deptId || !mongoose.Types.ObjectId.isValid(deptId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid deptId param required" });
    }

    // required fields
    const { employeeName, employeeId, email, mobileNumber } = body;
    if (
      !employeeName ||
      typeof employeeName !== "string" ||
      !employeeName.trim()
    ) {
      return res
        .status(400)
        .json({ success: false, message: "employeeName is required" });
    }
    if (!employeeId || typeof employeeId !== "string" || !employeeId.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "employeeId is required" });
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid email is required" });
    }

    if (!mobileNumber || !/^[0-9]{10}$/.test(mobileNumber)) {
      return res.status(400).json({
        success: false,
        message: "Valid 10-digit mobile number is required",
      });
    }

    // check company exists
    const company = await AdminCompany.findById(companyId).lean();
    if (!company) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }

    // check department exists and belongs to this company
    const dept = await employeeDept.findById(deptId).lean();
    if (!dept) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }
    if (String(dept.company) !== String(companyId)) {
      return res.status(400).json({
        success: false,
        message: "Department does not belong to the specified company",
      });
    }

    // prevent duplicate employeeId
    const existing = await Employee.findOne({
      employeeId: employeeId.trim(),
    }).lean();
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "employeeId already exists" });
    }

    // parse dateOfJoining (supports DD-MM-YYYY or ISO)
    let doj;
    if (body.dateOfJoining) {
      const ddmmyyyy = /^(\d{2})-(\d{2})-(\d{4})$/;
      const m = String(body.dateOfJoining).trim().match(ddmmyyyy);
      if (m) {
        const [, dd, mm, yyyy] = m;
        doj = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
      } else {
        const maybe = new Date(body.dateOfJoining);
        if (!isNaN(maybe.getTime())) doj = maybe;
      }
    }

    // build document and encrypt sensitive fields

    const newEmployeeData = {
      employeeName: employeeName.trim(),
      employeeId: employeeId.trim(),
      designation: body.designation
        ? String(body.designation).trim()
        : undefined,
      company: companyId,
      department: deptId,
      dateOfJoining: doj || undefined,
      email: email.trim().toLowerCase(),
      mobileNumber: mobileNumber.trim(),
      aadhar: body.aadhar
        ? encryptField(String(body.aadhar).trim())
        : undefined,
      UAN: body.UAN ? encryptField(String(body.UAN).trim()) : undefined,
      pfNo: body.pfNo ? encryptField(String(body.pfNo).trim()) : undefined,
      esiNo: body.esiNo ? encryptField(String(body.esiNo).trim()) : undefined,
      bankName: body.bankName ? String(body.bankName).trim() : undefined,
      bankAccountNo: body.bankAccountNo
        ? encryptField(String(body.bankAccountNo).trim())
        : undefined,
      bankIFSCNo: body.bankIFSCNo
        ? encryptField(String(body.bankIFSCNo).trim())
        : undefined,
      bankBranchName: body.bankBranchName
        ? String(body.bankBranchName).trim()
        : undefined,
      basicSalaryEnc: body.basicSalary
        ? encryptField(String(body.basicSalary).trim())
        : undefined,
      hraEnc: body.hra ? encryptField(String(body.hra).trim()) : undefined,
      trAllowanceEnc: body.trAllowance
        ? encryptField(String(body.trAllowance).trim())
        : undefined,
      specialAllowanceEnc: body.specialAllowance
        ? encryptField(String(body.specialAllowance).trim())
        : undefined,
      vdaEnc: body.vda ? encryptField(String(body.vda).trim()) : undefined,
    };

    // strip undefined fields
    Object.keys(newEmployeeData).forEach(
      (k) => newEmployeeData[k] === undefined && delete newEmployeeData[k]
    );

    const employee = new Employee(newEmployeeData);
    const saved = await employee.save();

    const response = {
      _id: saved._id,
      employeeName: saved.employeeName,
      employeeId: saved.employeeId,
      email: saved.email,
      mobileNumber: saved.mobileNumber,
      designation: saved.designation,
      company: saved.company,
      department: saved.department,
      dateOfJoining: saved.dateOfJoining,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };

    return res
      .status(201)
      .json({ success: true, message: "Employee created", data: response });
  } catch (err) {
    console.error("createEmployeeRecord error:", err);

    if (err && err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate key (employeeId probably exists)",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Server error while creating employee",
    });
  }
};

const viewDepartmentEmployeesUnderCompany = async (req, res) => {
  try {
    const { companyId, deptId } = req.params;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(req.query.limit || "15", 10))
    );
    const reveal = String(req.query.reveal || "false").toLowerCase() === "true";

    // Validate IDs
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid companyId param is required" });
    }
    if (!deptId || !mongoose.Types.ObjectId.isValid(deptId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid deptId param is required" });
    }

    //ensure company exists
    const company = await AdminCompany.findById(companyId).lean();
    if (!company)
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });

    // Ensure department exists and belongs to the company
    const dept = await employeeDept.findById(deptId).lean();
    if (!dept)
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    if (String(dept.company) !== String(companyId)) {
      return res.status(400).json({
        success: false,
        message: "Department does not belong to the specified company",
      });
    }

    const skip = (page - 1) * limit;
    const [employees, total] = await Promise.all([
      Employee.find({ company: companyId, department: deptId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Employee.countDocuments({ company: companyId, department: deptId }),
    ]);

    if (!total || total === 0) {
      return res.status(200).json({
        success: true,
        message:
          "No employees found for this department under the given company",
        company: { _id: company._id, companyName: company.companyName },
        department: { _id: dept._id, department: dept.department },
        employees: [],
        pagination: { total: 0, page, limit, pages: 0 },
      });
    }

    // Map employees: attempt to decrypt sensitive fields if decryptField is available.
    // By default we mask some PII. If reveal=true and decryptField exists, we'll return decrypted values.
    const mapped = employees.map((e) => {
      const tryDecryptString = (val) => {
        if (!val || typeof val !== "string") return val;
        if (!decryptField) return val;
        try {
          return decryptField(val);
        } catch (err) {
          console.warn("decrypt failed, returning raw:", err?.message || err);
          return val;
        }
      };

      const tryDecryptNumber = (val) => {
        // val is expected to be an encrypted string (e.g. basicSalaryEnc). Return a Number or null.
        if (!val || typeof val !== "string") return null;
        if (!decryptField) return null;
        try {
          const plain = decryptField(val);
          if (plain === null || plain === undefined || plain === "")
            return null;
          const n = parseFloat(String(plain));
          return Number.isFinite(n) ? n : null;
        } catch (err) {
          console.warn("decrypt number failed:", err?.message || err);
          return null;
        }
      };

      const mask = (val, keepLast = 4) => {
        if (!val || typeof val !== "string") return val;
        if (val.length <= keepLast) return "*".repeat(val.length);
        const last = val.slice(-keepLast);
        return "*".repeat(Math.max(0, val.length - keepLast)) + last;
      };

      // If reveal requested, attempt decrypt then return; otherwise return masked stored data.
      const aadharRaw = e.aadhar;
      const UANRaw = e.UAN;
      const bankRaw = e.bankAccountNo;
      const bankBranchNameRaw = e.bankBranchName;
      const bankIFSCNo = e.bankIFSCNo;
      const pfRaw = e.pfNo;
      const esiRaw = e.esiNo;

      // salary ciphertext fields (note names in DB)
      const basicSalaryEnc = e.basicSalaryEnc ?? e.basicSalary; // fallback if your DB still has old field names
      const hraEnc = e.hraEnc ?? e.hra;
      const trAllowanceEnc = e.trAllowanceEnc ?? e.trAllowance;
      const specialAllowanceEnc = e.specialAllowanceEnc ?? e.specialAllowance;
      const vdaEnc = e.vdaEnc ?? e.vda;

      return {
        _id: e._id,
        employeeName:
          reveal && decryptField && typeof e.employeeName === "string"
            ? tryDecryptString(e.employeeName)
            : e.employeeName,
        employeeId:
          reveal && decryptField && typeof e.employeeId === "string"
            ? tryDecryptString(e.employeeId)
            : e.employeeId,
        designation:
          reveal && decryptField && typeof e.designation === "string"
            ? tryDecryptString(e.designation)
            : e.designation,
        dateOfJoining: e.dateOfJoining || null,
        // PII fields: return masked values unless reveal=true
        aadhar: reveal ? tryDecryptString(aadharRaw) : mask(aadharRaw, 4),
        UAN: reveal ? tryDecryptString(UANRaw) : mask(UANRaw, 4),
        pfNo: reveal ? tryDecryptString(pfRaw) : mask(pfRaw, 4),
        esiNo: reveal ? tryDecryptString(esiRaw) : mask(esiRaw, 4),
        bankName: e.bankName || null,
        bankAccountNo: reveal ? tryDecryptString(bankRaw) : mask(bankRaw, 4),
        bankBranchName: reveal
          ? tryDecryptString(bankBranchNameRaw)
          : mask(bankBranchNameRaw, 4),
        bankIFSCNo: reveal ? tryDecryptString(bankIFSCNo) : mask(bankIFSCNo, 4),

        // SALARY fields: decrypt numbers when reveal=true, otherwise keep null
        basicSalary: reveal ? tryDecryptNumber(basicSalaryEnc) : null,
        vda: reveal ? tryDecryptNumber(vdaEnc) : null,
        hra: reveal ? tryDecryptNumber(hraEnc) : null,
        trAllowance: reveal ? tryDecryptNumber(trAllowanceEnc) : null,
        specialAllowance: reveal ? tryDecryptNumber(specialAllowanceEnc) : null,

        email: e.email || null,
        mobileNumber: e.mobileNumber || null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      company: { _id: company._id, companyName: company.companyName },
      department: { _id: dept._id, department: dept.department },
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      employees: mapped,
    });
  } catch (err) {
    console.error("viewDepartmentEmployeesUnderCompany error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching employees",
    });
  }
};

const editDepartmentEmployeeUnderCompany = async (req, res) => {
  try {
    const { companyId, deptId, employeeId } = req.params;
    const body = req.body || {};

    //validate id's
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid companyId param required" });
    }
    if (!deptId || !mongoose.Types.ObjectId.isValid(deptId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid deptId param required" });
    }
    if (!employeeId || !mongoose.Types.ObjectId.isValid(employeeId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid employeeId param required" });
    }

    //ensure company exists
    const company = await AdminCompany.findById(companyId).lean();
    if (!company) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }

    // Ensure department exists and belongs to company
    const dept = await employeeDept.findById(deptId).lean();
    if (!dept) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }
    if (String(dept.company) !== String(companyId)) {
      return res.status(400).json({
        success: false,
        message: "Department does not belong to the specified company",
      });
    }

    // Load employee and ensure it belongs to the company & department
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }
    if (
      String(employee.company) !== String(companyId) ||
      String(employee.department) !== String(deptId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Employee does not belong to the specified company/department",
      });
    }

    // Helper to validate money-like inputs
    const isValidMoney = (val) => {
      if (val === undefined || val === null || val === "") return false;
      const n = Number(val);
      return Number.isFinite(n) && n >= 0;
    };

    // Prepare updates (only provided fields)
    const updates = {};

    // Plain-string fields (you previously stored these as plaintext)
    if (body.employeeName !== undefined) {
      if (!body.employeeName || !String(body.employeeName).trim()) {
        return res
          .status(400)
          .json({ success: false, message: "employeeName cannot be empty" });
      }
      updates.employeeName = String(body.employeeName).trim();
    }

    if (body.employeeId !== undefined) {
      const newEmpId = String(body.employeeId).trim();
      if (!newEmpId) {
        return res
          .status(400)
          .json({ success: false, message: "employeeId cannot be empty" });
      }

      // Check duplicate employeeId (exclude current employee)
      const dup = await Employee.findOne({
        employeeId: newEmpId,
        _id: { $ne: employeeId },
      }).lean();
      if (dup) {
        return res
          .status(409)
          .json({ success: false, message: "employeeId already exists" });
      }
      updates.employeeId = newEmpId;
    }

    if (body.designation !== undefined) {
      updates.designation = body.designation
        ? String(body.designation).trim()
        : undefined;
    }

    if (body.email !== undefined) {
      if (!body.email) {
        // clear if explicitly empty
        updates.email = undefined;
      } else {
        const emailRaw = String(body.email).trim().toLowerCase();
        const emailRe = /^\S+@\S+\.\S+$/;
        if (!emailRe.test(emailRaw)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid email format" });
        }
        // uniqueness check excluding current employee
        // const dupEmail = await Employee.findOne({
        //   email: emailRaw,
        //   _id: { $ne: employeeId },
        // }).lean();
        // if (dupEmail) {
        //   return res
        //     .status(409)
        //     .json({ success: false, message: "Email already in use" });
        // }
        // updates.email = emailRaw;
      }
    }

    if (body.mobileNumber !== undefined) {
      if (!body.mobileNumber) {
        updates.mobileNumber = undefined;
      } else {
        const mobileRaw = String(body.mobileNumber).trim();
        const mobileRe = /^[0-9]{10}$/;
        if (!mobileRe.test(mobileRaw)) {
          return res.status(400).json({
            success: false,
            message: "Invalid mobile number. Expect 10 digits.",
          });
        }
        // uniqueness check excluding current employee
        // const dupMobile = await Employee.findOne({
        //   mobileNumber: mobileRaw,
        //   _id: { $ne: employeeId },
        // }).lean();
        // if (dupMobile) {
        //   return res
        //     .status(409)
        //     .json({ success: false, message: "Mobile number already in use" });
        // }
        // updates.mobileNumber = mobileRaw;
      }
    }

    // Allow updating dateOfJoining (accept ISO or DD-MM-YYYY)
    if (body.dateOfJoining !== undefined) {
      if (!body.dateOfJoining) {
        updates.dateOfJoining = undefined;
      } else {
        const ddmmyyyy = /^(\d{2})-(\d{2})-(\d{4})$/;
        const m = String(body.dateOfJoining).trim().match(ddmmyyyy);
        if (m) {
          const [, dd, mm, yyyy] = m;
          updates.dateOfJoining = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
        } else {
          const maybe = new Date(body.dateOfJoining);
          if (isNaN(maybe.getTime())) {
            return res
              .status(400)
              .json({ success: false, message: "Invalid dateOfJoining" });
          }
          updates.dateOfJoining = maybe;
        }
      }
    }

    // If moving employee to another department: validate department belongs to same company
    if (body.department !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(body.department)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid department id" });
      }
      const newDept = await employeeDept.findById(body.department).lean();
      if (!newDept) {
        return res
          .status(404)
          .json({ success: false, message: "Target department not found" });
      }
      if (String(newDept.company) !== String(companyId)) {
        return res.status(400).json({
          success: false,
          message: "Target department does not belong to this company",
        });
      }
      updates.department = body.department;
    }

    const encryptIfPresent = (fieldName) => {
      if (body[fieldName] === undefined) return;
      if (body[fieldName] === null || body[fieldName] === "") {
        // explicitly clear sensitive field if empty string/null provided
        updates[fieldName] = undefined;
        return;
      }
      const raw = String(body[fieldName]).trim();
      updates[fieldName] = encryptField ? encryptField(raw) : raw;
    };

    encryptIfPresent("aadhar");
    encryptIfPresent("UAN");
    encryptIfPresent("pfNo");
    encryptIfPresent("esiNo");
    encryptIfPresent("bankAccountNo");
    encryptIfPresent("bankBranchName");
    encryptIfPresent("bankIFSCNo");

    if (body.bankName !== undefined) {
      updates.bankName = body.bankName
        ? String(body.bankName).trim()
        : undefined;
    }

    const handleSalaryField = (clientKey, encKey) => {
      if (body[clientKey] === undefined) return;
      // clear if explicitly empty / null provided
      if (body[clientKey] === null || body[clientKey] === "") {
        updates[encKey] = undefined;
        return;
      }
      // Validate numeric
      const rawStr = String(body[clientKey]).trim();
      if (!isValidMoney(rawStr)) {
        throw {
          status: 400,
          message: `${clientKey} must be a non-negative number or decimal`,
        };
      }
      updates[encKey] = encryptField ? encryptField(rawStr) : rawStr;
    };

    try {
      handleSalaryField("basicSalary", "basicSalaryEnc");
      handleSalaryField("hra", "hraEnc");
      handleSalaryField("trAllowance", "trAllowanceEnc");
      handleSalaryField("specialAllowance", "specialAllowanceEnc");
      handleSalaryField("vda", "vdaEnc");
    } catch (validationErr) {
      if (validationErr && validationErr.status) {
        return res.status(validationErr.status).json({
          success: false,
          message: validationErr.message,
        });
      }
      throw validationErr;
    }

    // remove undefined keys so mongoose doesn't set to undefined inadvertently
    Object.keys(updates).forEach(
      (k) => updates[k] === undefined && delete updates[k]
    );

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided to update",
      });
    }

    // Apply update
    const updated = await Employee.findByIdAndUpdate(employeeId, updates, {
      new: true,
      runValidators: true,
    }).lean();

    if (!updated) {
      // rare: removed meanwhile
      return res.status(404).json({
        success: false,
        message: "Employee not found after update attempt",
      });
    }

    const safeResp = { ...updated };
    const tryDecryptString = (val) => {
      if (!val || typeof val !== "string") return null;
      try {
        return decryptField ? decryptField(val) : val;
      } catch (err) {
        console.warn("decrypt failed, returning raw:", err?.message || err);
        return val;
      }
    };

    const tryDecryptNumber = (val) => {
      if (!val || typeof val !== "string") return null;
      try {
        const plain = decryptField ? decryptField(val) : val;
        if (plain === null || plain === undefined || plain === "") return null;
        const n = parseFloat(String(plain));
        return Number.isFinite(n) ? n : null;
      } catch (err) {
        console.warn("decrypt number failed:", err?.message || err);
        return null;
      }
    };

    safeResp.aadhar = safeResp.aadhar
      ? tryDecryptString(safeResp.aadhar)
      : null;
    safeResp.UAN = safeResp.UAN ? tryDecryptString(safeResp.UAN) : null;
    safeResp.pfNo = safeResp.pfNo ? tryDecryptString(safeResp.pfNo) : null;
    safeResp.esiNo = safeResp.esiNo ? tryDecryptString(safeResp.esiNo) : null;
    safeResp.bankAccountNo = safeResp.bankAccountNo
      ? tryDecryptString(safeResp.bankAccountNo)
      : null;
    safeResp.bankBranchName = safeResp.bankBranchName
      ? tryDecryptString(safeResp.bankBranchName)
      : null;
    safeResp.bankIFSCNo = safeResp.bankIFSCNo
      ? tryDecryptString(safeResp.bankIFSCNo)
      : null;

    // Salary — decrypt ciphertext fields into numeric fields for response
    safeResp.basicSalary = safeResp.basicSalaryEnc
      ? tryDecryptNumber(safeResp.basicSalaryEnc)
      : null;
    safeResp.hra = safeResp.hraEnc ? tryDecryptNumber(safeResp.hraEnc) : null;
    safeResp.trAllowance = safeResp.trAllowanceEnc
      ? tryDecryptNumber(safeResp.trAllowanceEnc)
      : null;
    safeResp.specialAllowance = safeResp.specialAllowanceEnc
      ? tryDecryptNumber(safeResp.specialAllowanceEnc)
      : null;
    safeResp.vda = safeResp.vdaEnc ? tryDecryptNumber(safeResp.vdaEnc) : null;

    // Optionally remove enc fields from response so ciphertext is not leaked out
    delete safeResp.basicSalaryEnc;
    delete safeResp.hraEnc;
    delete safeResp.trAllowanceEnc;
    delete safeResp.specialAllowanceEnc;
    delete safeResp.vdaEnc;

    return res.status(200).json({
      success: true,
      message: "Employee updated",
      data: safeResp,
    });
  } catch (err) {
    console.error("editDepartmentEmployeeUnderCompany error:", err);

    if (err && err.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "Duplicate key error" });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while updating employee",
    });
  }
};

const deleteDepartmentEmployeeUnderCompany = async (req, res) => {
  const { companyId, deptId, employeeId } = req.params;

  // validate ids
  if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
    return res
      .status(400)
      .json({ success: false, message: "Valid companyId param required" });
  }
  if (!deptId || !mongoose.Types.ObjectId.isValid(deptId)) {
    return res
      .status(400)
      .json({ success: false, message: "Valid deptId param required" });
  }
  if (!employeeId || !mongoose.Types.ObjectId.isValid(employeeId)) {
    return res
      .status(400)
      .json({ success: false, message: "Valid employeeId param required" });
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(
      async () => {
        // ensure company exists
        const company = await AdminCompany.findById(companyId).session(session);
        if (!company) {
          throw { status: 404, message: "Company not found" };
        }

        // ensure dept exists and belongs to company
        const dept = await employeeDept.findById(deptId).session(session);
        if (!dept) {
          throw { status: 404, message: "Department not found" };
        }
        if (String(dept.company) !== String(companyId)) {
          throw {
            status: 400,
            message: "Department does not belong to the specified company",
          };
        }

        // find the employee to return useful info (and ensure belongs to company+dept)
        const employee = await Employee.findOne({
          _id: employeeId,
          company: companyId,
          department: deptId,
        })
          .session(session)
          .lean();
        if (!employee) {
          throw {
            status: 404,
            message:
              "Employee not found for the specified company & department",
          };
        }

        // delete salary records scoped to this employee (and optionally company & dept for safety)
        const salaryDeleteRes = await Salary.deleteMany({
          employee: employee._id,
          company: companyId,
          department: deptId,
        }).session(session);

        // delete the employee
        const empDeleteRes = await Employee.deleteOne({
          _id: employee._id,
          company: companyId,
          department: deptId,
        }).session(session);

        return {
          deletedEmployee: {
            _id: employee._id,
            employeeId: employee.employeeId,
            employeeName: employee.employeeName,
          },
          counts: {
            salariesDeleted: salaryDeleteRes.deletedCount ?? 0,
            employeeDeleted: empDeleteRes.deletedCount ?? 0,
          },
        };
      },
      {
        readPreference: "primary",
        readConcern: { level: "local" },
        writeConcern: { w: "majority" },
      }
    );

    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Employee and related salary records deleted successfully.",
      data: result,
    });
  } catch (err) {
    // handle thrown status objects from transaction callback
    if (err && err.status) {
      session.endSession();
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    }

    const errMsg = (err && err.message) || "";

    // fallback when transactions are not supported
    const txnNotSupported =
      /transactions are not supported|Transaction numbers|InvalidOperation: transactions are not supported/i.test(
        errMsg
      );

    if (txnNotSupported) {
      session.endSession();
      try {
        // best-effort sequential deletes
        const company = await AdminCompany.findById(companyId).lean();
        if (!company) {
          return res
            .status(404)
            .json({ success: false, message: "Company not found" });
        }

        const dept = await employeeDept.findById(deptId).lean();
        if (!dept || String(dept.company) !== String(companyId)) {
          return res.status(404).json({
            success: false,
            message: "Department not found for this company",
          });
        }

        const employee = await Employee.findOne({
          _id: employeeId,
          company: companyId,
          department: deptId,
        }).lean();
        if (!employee) {
          return res.status(404).json({
            success: false,
            message:
              "Employee not found for the specified company & department",
          });
        }

        const salaryRes = await Salary.deleteMany({
          employee: employee._id,
          company: companyId,
          department: deptId,
        });
        const empRes = await Employee.deleteOne({
          _id: employee._id,
          company: companyId,
          department: deptId,
        });

        return res.status(200).json({
          success: true,
          message:
            "Employee and related salary records deleted (no transaction available).",
          data: {
            deletedEmployee: {
              _id: employee._id,
              employeeId: employee.employeeId,
              employeeName: employee.employeeName,
            },
            counts: {
              salariesDeleted: salaryRes.deletedCount ?? 0,
              employeeDeleted: empRes.deletedCount ?? 0,
            },
          },
        });
      } catch (fallbackErr) {
        console.error("Fallback delete error:", fallbackErr);
        return res.status(500).json({
          success: false,
          message:
            "Error deleting employee and related salary records during fallback.",
          error: fallbackErr.message,
        });
      }
    }

    // other errors
    console.error("deleteDepartmentEmployeeUnderCompany error:", err);
    session.endSession();
    return res.status(500).json({
      success: false,
      message: "Server error while deleting employee",
      error: errMsg,
    });
  }
};

const createSalaryDetails = async (req, res) => {
  try {
    const { companyId, deptId, employeeId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(companyId) ||
      !mongoose.Types.ObjectId.isValid(deptId) ||
      !mongoose.Types.ObjectId.isValid(employeeId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid IDs in URL." });
    }

    const {
      payMonth,
      payYear,
      basicSalary = 0,
      hra = 0,
      trAllowance = 0,
      specialAllowance = 0,
      vda = 0,
      epf = 0,
      esic = 0,
      professionalTax = 0,
      // advance = 0, // new
      uniform_deduction = 0,
      late_login = 0,
      others = 0,
      lop = 0, // new
      totalWorkingDays = 0,
      paidDays = 0,
      leaves_taken = 0,
      lopDays = 0,
      // tax = 0,
      salarySlipNumber,
      notes,
    } = req.body;

    if (typeof payMonth === "undefined" || typeof payYear === "undefined") {
      return res.status(400).json({
        success: false,
        message: "payMonth and payYear are required.",
      });
    }

    const month = Number(payMonth);
    const year = Number(payYear);
    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(year)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payMonth or payYear." });
    }

    // verify company, dept, employee exist
    const [company, department, employee] = await Promise.all([
      AdminCompany.findById(companyId).lean(),
      employeeDept.findById(deptId).lean(),
      Employee.findById(employeeId).lean(),
    ]);
    if (!company)
      return res
        .status(404)
        .json({ success: false, message: "Company not found." });
    if (!department)
      return res
        .status(404)
        .json({ success: false, message: "Department not found." });
    if (!employee)
      return res
        .status(404)
        .json({ success: false, message: "Employee not found." });

    // ensure employee belongs to the specified company and department (optional but recommended)
    if (String(employee.company) !== String(companyId)) {
      return res.status(400).json({
        success: false,
        message: "Employee does not belong to the specified company.",
      });
    }
    if (String(employee.department) !== String(deptId)) {
      return res.status(400).json({
        success: false,
        message: "Employee does not belong to the specified department.",
      });
    }

    // --- compute totals BEFORE encryption ---
    const gross =
      Number(basicSalary || 0) +
      Number(hra || 0) +
      Number(trAllowance || 0) +
      Number(specialAllowance || 0) +
      Number(vda || 0);

    const totalEarnings = Math.round((gross + Number.EPSILON) * 100) / 100;

    // compute advance as sum of the three components (server-side)
    const uniformNum = Number(uniform_deduction || 0);
    const lateNum = Number(late_login || 0);
    const othersNum = Number(others || 0);

    const computedAdvance =
      Math.round((uniformNum + lateNum + othersNum + Number.EPSILON) * 100) /
      100;

    const deductions =
      Number(epf || 0) +
      Number(esic || 0) +
      Number(professionalTax || 0) +
      Number(computedAdvance || 0) +
      // Number(advance || 0) +
      Number(lop || 0);

    const totalDeductions =
      Math.round((deductions + Number.EPSILON) * 100) / 100;

    // const net =
    //   Number(totalEarnings || 0) -
    //   Number(totalDeductions || 0) -
    //   Number(tax || 0);
    // const netPay = Math.round((net + Number.EPSILON) * 100) / 100;

    const net = Number(totalEarnings || 0) - Number(totalDeductions || 0);
    const netPay = Math.round((net + Number.EPSILON) * 100) / 100;

    // --- Build salary object ---
    // We store clear identifiers and payPeriod so you can query and enforce uniqueness.
    // All sensitive numeric/text fields are stored encrypted in *_enc fields.
    const salaryData = {
      company: companyId,
      department: deptId,
      employee: employeeId,

      // keep payMonth/payYear unencrypted for querying and unique index
      payMonth: month,
      payYear: year,

      // Keep numeric fields empty/zero so schema (Number types) remain valid.
      // Real sensitive values are encrypted below in *_enc fields.
      basicSalary: 0,
      hra: 0,
      trAllowance: 0,
      specialAllowance: 0,
      vda: 0,

      epf: 0,
      esic: 0,
      professionalTax: 0,

      uniform_deduction: 0,
      late_login: 0,
      others: 0,
      advance: 0,

      lop: 0,

      totalWorkingDays: Number(totalWorkingDays || 0),
      paidDays: Number(paidDays || 0),
      lopDays: Number(lopDays || 0),
      leaves_taken: Number(leaves_taken || 0),

      totalEarnings: 0,
      totalDeductions: 0,
      // tax: 0,
      netPay: 0,

      salarySlipNumber: salarySlipNumber
        ? String(salarySlipNumber).trim()
        : undefined,
      notes: undefined,
    };

    // --- encrypt individual fields into *_enc properties ---
    // numeric fields turned into strings before encryption to preserve exact value
    salaryData.basicSalary_enc = encryptField(String(Number(basicSalary || 0)));
    salaryData.hra_enc = encryptField(String(Number(hra || 0)));
    salaryData.trAllowance_enc = encryptField(String(Number(trAllowance || 0)));
    salaryData.specialAllowance_enc = encryptField(
      String(Number(specialAllowance || 0))
    );
    salaryData.vda_enc = encryptField(String(Number(vda || 0)));

    salaryData.epf_enc = encryptField(String(Number(epf || 0)));
    salaryData.esic_enc = encryptField(String(Number(esic || 0)));
    salaryData.professionalTax_enc = encryptField(
      String(Number(professionalTax || 0))
    );
    // encrypt the new deduction components
    salaryData.uniform_deduction_enc = encryptField(String(uniformNum));
    salaryData.late_login_enc = encryptField(String(lateNum));
    salaryData.others_enc = encryptField(String(othersNum));
    // advance is computed on server and encrypted
    salaryData.advance_enc = encryptField(String(computedAdvance));

    // salaryData.advance_enc = encryptField(String(Number(advance || 0)));
    salaryData.lop_enc = encryptField(String(Number(lop || 0)));

    salaryData.totalEarnings_enc = encryptField(String(totalEarnings));
    salaryData.totalDeductions_enc = encryptField(String(totalDeductions));
    // salaryData.tax_enc = encryptField(String(Number(tax || 0)));
    salaryData.netPay_enc = encryptField(String(netPay));

    const snapshot = {
      employeeName: employee.employeeName || "",
      empId: employee.employeeId || "",
      designation: employee.designation || "",
      bankName: employee.bankName || "",
      bankAccountNo: employee.bankAccountNo || "",
      doj: employee.dateOfJoining || null,
    };
    salaryData.snapshot_enc = encryptField(JSON.stringify(snapshot));

    // notes
    salaryData.notes_enc = encryptField(notes ? String(notes) : "");

    // flag to indicate encrypted storage (helpful for later reads)
    salaryData.isEncrypted = true;

    // create the salary doc (original numeric fields are left as zeros)
    const createdSalary = await Salary.create(salaryData);

    // Return created doc (populated if needed) but do NOT include decrypted values here.
    // If you want the API to return decrypted values to authorized users, implement
    // a separate read endpoint that uses decryptField and checks permissions.
    return res.status(201).json({ success: true, data: createdSalary });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Salary slip for this employee for the given month/year already exists.",
        error: err.message,
      });
    }
    console.error("createSalaryDetails error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

const getIndEmployeeSalaryDetails = async (req, res) => {
  try {
    const { companyId, deptId, employeeId } = req.params;
    // required params validation
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid companyId param is required" });
    }
    if (!deptId || !mongoose.Types.ObjectId.isValid(deptId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid deptId param is required" });
    }
    if (!employeeId || !mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({
        success: false,
        message: "Valid employeeId param is required",
      });
    }

    // pagination: page from query, default 1; fixed limit 15
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const LIMIT = 15;

    // build query: require all three filters
    const query = {
      company: companyId,
      department: deptId,
      employee: employeeId,
    };

    // count total matching documents
    const total = await Salary.countDocuments(query);

    if (!total || total === 0) {
      return res.status(404).json({
        success: false,
        message: "No salary slips information has been submitted so far",
      });
    }

    const totalPages = Math.ceil(total / LIMIT);
    const skip = (pageNum - 1) * LIMIT;

    // fetch doc page sorted by most recent (year desc, month desc)
    const docs = await Salary.find(query)
      .sort({ payYear: -1, payMonth: -1, createdAt: -1 })
      .skip(skip)
      .limit(LIMIT)
      .populate({
        path: "employee",
        select: "employeeName employeeId designation email",
      })
      .populate({ path: "company", select: "companyName" })
      .populate({ path: "department", select: "department" })
      .lean();

    // decrypt/clean results
    const results = docs.map((doc) => {
      const out = { ...doc };

      if (doc.isEncrypted) {
        const toNumber = (val) => {
          try {
            if (!val && val !== 0) return 0;
            const dec = decryptField(val);
            const n = Number(dec);
            return Number.isNaN(n) ? dec : n;
          } catch (e) {
            return null;
          }
        };

        out.basicSalary = toNumber(doc.basicSalary_enc);
        out.hra = toNumber(doc.hra_enc);
        out.trAllowance = toNumber(doc.trAllowance_enc);
        out.specialAllowance = toNumber(doc.specialAllowance_enc);
        out.vda = toNumber(doc.vda_enc);

        out.epf = toNumber(doc.epf_enc);
        out.esic = toNumber(doc.esic_enc);
        out.professionalTax = toNumber(doc.professionalTax_enc);

        // NEW: decrypt the three components
        out.uniform_deduction = toNumber(doc.uniform_deduction_enc);
        out.late_login = toNumber(doc.late_login_enc);
        out.others = toNumber(doc.others_enc);

        // out.advance = toNumber(doc.advance_enc);

        try {
          const compSum =
            Number(out.uniform_deduction || 0) +
            Number(out.late_login || 0) +
            Number(out.others || 0);
          if (!Number.isNaN(compSum) && compSum !== 0) {
            out.advance = compSum;
          } else {
            out.advance = toNumber(doc.advance_enc);
          }
        } catch (e) {
          out.advance = toNumber(doc.advance_enc);
        }

        out.lop = toNumber(doc.lop_enc);
        out.totalEarnings = toNumber(doc.totalEarnings_enc);
        out.totalDeductions = toNumber(doc.totalDeductions_enc);
        // out.tax = toNumber(doc.tax_enc);
        out.netPay = toNumber(doc.netPay_enc);

        try {
          out.snapshot = doc.snapshot_enc
            ? JSON.parse(decryptField(doc.snapshot_enc))
            : null;
        } catch (e) {
          out.snapshot = null;
        }

        out.notes = doc.notes_enc ? decryptField(doc.notes_enc) : "";
        out.isEncrypted = true;
      } else {
        out.basicSalary = Number(doc.basicSalary || 0);
        out.hra = Number(doc.hra || 0);
        out.trAllowance = Number(doc.trAllowance || 0);
        out.specialAllowance = Number(doc.specialAllowance || 0);
        out.vda = Number(doc.vda || 0);

        out.epf = Number(doc.epf || 0);
        out.esic = Number(doc.esic || 0);
        out.professionalTax = Number(doc.professionalTax || 0);

        // NEW: plain components
        out.uniform_deduction = Number(doc.uniform_deduction || 0);
        out.late_login = Number(doc.late_login || 0);
        out.others = Number(doc.others || 0);

        const compSum =
          Number(out.uniform_deduction || 0) +
          Number(out.late_login || 0) +
          Number(out.others || 0);
        out.advance =
          compSum !== 0
            ? Math.round((compSum + Number.EPSILON) * 100) / 100
            : Number(doc.advance || 0);

        // out.advance = Number(doc.advance || 0);
        out.lop = Number(doc.lop || 0);

        out.totalEarnings = Number(doc.totalEarnings || 0);
        out.totalDeductions = Number(doc.totalDeductions || 0);
        // out.tax = Number(doc.tax || 0);
        out.netPay = Number(doc.netPay || 0);

        out.snapshot = doc.snapshot || null;
        out.notes = doc.notes || "";
        out.isEncrypted = false;
      }

      // remove encrypted fields before returning
      [
        "basicSalary_enc",
        "hra_enc",
        "trAllowance_enc",
        "specialAllowance_enc",
        "vda_enc",
        "epf_enc",
        "esic_enc",
        "professionalTax_enc",
        "uniform_deduction_enc",
        "late_login_enc",
        "others_enc",
        "advance_enc",
        "lop_enc",
        "totalEarnings_enc",
        "totalDeductions_enc",
        // "tax_enc",
        "netPay_enc",
        "snapshot_enc",
        "notes_enc",
      ].forEach((k) => delete out[k]);

      return out;
    });

    return res.status(200).json({
      success: true,
      data: results,
      meta: { total, page: pageNum, limit: LIMIT, totalPages },
    });
  } catch (err) {
    console.error("getIndEmployeeSalaryDetails error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

const fetchStoredEmployeeSalaryDetails = async (req, res) => {
  try {
    const { companyId, deptId, employeeId } = req.params;

    // basic validation
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid companyId required" });
    }
    if (!deptId || !mongoose.Types.ObjectId.isValid(deptId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid deptId required" });
    }
    if (!employeeId || !mongoose.Types.ObjectId.isValid(employeeId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid employeeId required" });
    }

    // confirm company & department existence & relationship
    const company = await AdminCompany.findById(companyId).lean();
    if (!company)
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });

    const dept = await employeeDept.findById(deptId).lean();
    if (!dept)
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });

    if (String(dept.company) !== String(companyId)) {
      return res.status(400).json({
        success: false,
        message: "Department does not belong to the specified company",
      });
    }

    // fetch employee (document so virtuals could work; but we decrypt explicitly)
    const employee = await Employee.findById(employeeId).lean();
    if (!employee)
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });

    if (
      String(employee.company) !== String(companyId) ||
      String(employee.department) !== String(deptId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Employee does not belong to the given company/department",
      });
    }

    // helper to safely decrypt numeric fields
    const tryDecryptNumber = (cipher) => {
      if (!cipher || typeof cipher !== "string") return null;
      if (!decryptField) return null;
      try {
        const plain = decryptField(cipher);
        if (plain === null || plain === undefined || plain === "") return null;
        const n = parseFloat(String(plain));
        return Number.isFinite(n) ? n : null;
      } catch (err) {
        console.warn("decrypt number failed:", err?.message || err);
        return null;
      }
    };

    const basicSalary =
      tryDecryptNumber(employee.basicSalaryEnc) ??
      (typeof employee.basicSalary === "number" ? employee.basicSalary : null);
    const hra =
      tryDecryptNumber(employee.hraEnc) ??
      (typeof employee.hra === "number" ? employee.hra : null);
    const trAllowance =
      tryDecryptNumber(employee.trAllowanceEnc) ??
      (typeof employee.trAllowance === "number" ? employee.trAllowance : null);
    const specialAllowance =
      tryDecryptNumber(employee.specialAllowanceEnc) ??
      (typeof employee.specialAllowance === "number"
        ? employee.specialAllowance
        : null);
    const vda =
      tryDecryptNumber(employee.vdaEnc) ??
      (typeof employee.vda === "number" ? employee.vda : null);

    return res.status(200).json({
      success: true,
      data: {
        employee: {
          _id: employee._id,
          employeeName: employee.employeeName,
          employeeId: employee.employeeId,
          email: employee.email,
          mobileNumber: employee.mobileNumber,
        },
        company: { _id: company._id, companyName: company.companyName },
        department: { _id: dept._id, department: dept.department },
        salaryDefaults: {
          basicSalary: basicSalary,
          vda: vda,
          hra: hra,
          trAllowance: trAllowance,
          specialAllowance: specialAllowance,
        },
      },
    });
  } catch (err) {
    console.error("fetchStoredEmployeeSalaryDetails error:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Server error while fetching stored salary details",
      });
  }
};

const deleteIndEmployeeSalaryDetails = async (req, res) => {
  try {
    const { companyId, deptId, employeeId, salaryId } = req.params;

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid companyId" });
    }
    if (!mongoose.Types.ObjectId.isValid(deptId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid deptId" });
    }
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid employeeId" });
    }
    if (!mongoose.Types.ObjectId.isValid(salaryId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid salaryId" });
    }

    // Check existence of company, department, and employee
    const [company, department, employee] = await Promise.all([
      AdminCompany.findById(companyId).lean(),
      employeeDept.findById(deptId).lean(),
      Employee.findById(employeeId).lean(),
    ]);

    if (!company) {
      return res
        .status(404)
        .json({ success: false, message: "company not found" });
    }

    if (!department) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }
    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    // Ensure employee belongs to correct company & department
    if (String(employee.company) !== String(companyId)) {
      return res.status(400).json({
        success: false,
        message: "Employee does not belong to the specified company",
      });
    }
    if (String(employee.department) !== String(deptId)) {
      return res.status(400).json({
        success: false,
        message: "Employee does not belong to the specified department",
      });
    }

    const salaryRecord = await Salary.findOne({
      _id: salaryId,
      employee: employeeId,
      company: companyId,
      department: deptId,
    });

    if (!salaryRecord) {
      return res.status(404).json({
        success: false,
        message: "Salary slip not found for this employee",
      });
    }

    // Delete the salary slip
    await Salary.deleteOne({ _id: salaryId });

    return res.status(200).json({
      success: true,
      message: "salary slip deleted successfully",
      deletedId: salaryId,
    });
  } catch (err) {
    console.error("deleteIndEmployeeSalaryDetails error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

const editIndEmployeeSalaryDetails = async (req, res) => {
  try {
    const { companyId, deptId, employeeId, salaryId } = req.params;

    // validate ids
    if (
      !mongoose.Types.ObjectId.isValid(companyId) ||
      !mongoose.Types.ObjectId.isValid(deptId) ||
      !mongoose.Types.ObjectId.isValid(employeeId) ||
      !mongoose.Types.ObjectId.isValid(salaryId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid IDs in URL. companyId, deptId, employeeId and salaryId are required and must be valid.",
      });
    }

    const body = req.body || {};

    // verify company, dept, employee exist
    const [company, department, employee] = await Promise.all([
      AdminCompany.findById(companyId).lean(),
      employeeDept.findById(deptId).lean(),
      Employee.findById(employeeId).lean(),
    ]);
    if (!company)
      return res
        .status(404)
        .json({ success: false, message: "Company not found." });
    if (!department)
      return res
        .status(404)
        .json({ success: false, message: "Department not found." });
    if (!employee)
      return res
        .status(404)
        .json({ success: false, message: "Employee not found." });

    // ensure employee belongs to specified company/department
    if (String(employee.company) !== String(companyId)) {
      return res.status(400).json({
        success: false,
        message: "Employee does not belong to the specified company.",
      });
    }
    if (String(employee.department) !== String(deptId)) {
      return res.status(400).json({
        success: false,
        message: "Employee does not belong to the specified department.",
      });
    }

    // Load salary by param salaryId and ensure it belongs to the same company/department/employee
    const salaryDoc = await Salary.findOne({
      _id: salaryId,
      company: companyId,
      department: deptId,
      employee: employeeId,
    });

    if (!salaryDoc) {
      return res.status(404).json({
        success: false,
        message: "Salary slip not found for the specified identifiers.",
      });
    }

    // Allowed updatable fields (incoming may contain any subset)
    const updatable = [
      "payMonth",
      "payYear",
      "basicSalary",
      "hra",
      "trAllowance",
      "specialAllowance",
      "vda",
      "epf",
      "esic",
      "professionalTax",
      // "advance",
      "lop",
      "totalWorkingDays",
      "paidDays",
      "lopDays",
      "leaves_taken",
      // New component fields

      "uniform_deduction",
      "late_login",
      "others",

      // "tax",
      "salarySlipNumber",
      "notes",
    ];

    // Build incoming object coerced to numbers where appropriate
    const incoming = {};
    const numericKeys = new Set([
      "payMonth",
      "payYear",
      "basicSalary",
      "hra",
      "trAllowance",
      "specialAllowance",
      "vda",
      "epf",
      "esic",
      "professionalTax",
      // "advance",
      "lop",
      "totalWorkingDays",
      "paidDays",
      "lopDays",
      "leaves_taken",
      "uniform_deduction",
      "late_login",
      "others",
      // "tax",
    ]);

    for (const k of updatable) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        incoming[k] = numericKeys.has(k) ? Number(body[k] ?? 0) : body[k];
      }
    }

    // Validate new payMonth/payYear if provided and check unique conflict
    if (incoming.payMonth !== undefined || incoming.payYear !== undefined) {
      const newMonth =
        incoming.payMonth !== undefined
          ? Number(incoming.payMonth)
          : salaryDoc.payMonth;
      const newYear =
        incoming.payYear !== undefined
          ? Number(incoming.payYear)
          : salaryDoc.payYear;
      if (
        !Number.isInteger(newMonth) ||
        newMonth < 1 ||
        newMonth > 12 ||
        !Number.isInteger(newYear)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid new payMonth or payYear.",
        });
      }

      const changedPeriod =
        Number(newMonth) !== Number(salaryDoc.payMonth) ||
        Number(newYear) !== Number(salaryDoc.payYear);
      if (changedPeriod) {
        const conflict = await Salary.findOne({
          company: companyId,
          department: deptId,
          employee: employeeId,
          payMonth: newMonth,
          payYear: newYear,
          _id: { $ne: salaryDoc._id },
        }).lean();
        if (conflict) {
          return res.status(409).json({
            success: false,
            message:
              "A salary slip already exists for the target payMonth/payYear for this employee.",
          });
        }
      }
    }

    // Helper to read numeric baseline value:
    // - prefer incoming value when present
    // - if encrypted doc: try to decrypt the corresponding *_enc field
    // - otherwise fallback to numeric field on doc
    const readEncryptedNum = (doc, encFieldName, plainFieldName) => {
      // incoming override
      if (incoming[plainFieldName] !== undefined)
        return Number(incoming[plainFieldName] || 0);

      // if document is encrypted and encrypted field exists, try decrypt
      if (doc.isEncrypted && doc[encFieldName]) {
        try {
          const dec = decryptField(doc[encFieldName]);
          const n = Number(dec);
          return Number.isFinite(n) ? n : 0;
        } catch (err) {
          // decryption failure -> fallback to 0
          return 0;
        }
      }

      // fallback to numeric stored value (may be 0)
      return Number(
        doc[plainFieldName] !== undefined ? doc[plainFieldName] : 0
      );
    };

    // Compute totals using incoming + decrypted existing values when necessary
    const basicSalaryVal = readEncryptedNum(
      salaryDoc,
      "basicSalary_enc",
      "basicSalary"
    );
    const hraVal = readEncryptedNum(salaryDoc, "hra_enc", "hra");
    const trAllowanceVal = readEncryptedNum(
      salaryDoc,
      "trAllowance_enc",
      "trAllowance"
    );
    const specialAllowanceVal = readEncryptedNum(
      salaryDoc,
      "specialAllowance_enc",
      "specialAllowance"
    );
    const vdaVal = readEncryptedNum(salaryDoc, "vda_enc", "vda");

    const gross =
      Number(basicSalaryVal || 0) +
      Number(hraVal || 0) +
      Number(trAllowanceVal || 0) +
      Number(specialAllowanceVal || 0) +
      Number(vdaVal || 0);
    const totalEarnings = Math.round((gross + Number.EPSILON) * 100) / 100;

    const epfVal = readEncryptedNum(salaryDoc, "epf_enc", "epf");
    const esicVal = readEncryptedNum(salaryDoc, "esic_enc", "esic");
    const professionalTaxVal = readEncryptedNum(
      salaryDoc,
      "professionalTax_enc",
      "professionalTax"
    );
    const uniformVal = readEncryptedNum(
      salaryDoc,
      "uniform_deduction_enc",
      "uniform_deduction"
    );
    const lateVal = readEncryptedNum(salaryDoc, "late_login_enc", "late_login");
    const othersVal = readEncryptedNum(salaryDoc, "others_enc", "others");

    // const advanceVal = readEncryptedNum(salaryDoc, "advance_enc", "advance");
    let computedAdvance =
      Number(uniformVal || 0) + Number(lateVal || 0) + Number(othersVal || 0);
    if (!computedAdvance) {
      // fallback to decrypt advance_enc if present
      try {
        const advFromEnc = readEncryptedNum(
          salaryDoc,
          "advance_enc",
          "advance"
        );
        computedAdvance = Number(advFromEnc || 0);
      } catch (e) {
        computedAdvance = Number(computedAdvance || 0);
      }
    }
    computedAdvance =
      Math.round((computedAdvance + Number.EPSILON) * 100) / 100;

    const lopVal = readEncryptedNum(salaryDoc, "lop_enc", "lop");

    const deductions =
      Number(epfVal || 0) +
      Number(esicVal || 0) +
      Number(professionalTaxVal || 0) +
      // Number(advanceVal || 0) +
      Number(computedAdvance || 0) +
      Number(lopVal || 0);
    const totalDeductions =
      Math.round((deductions + Number.EPSILON) * 100) / 100;

    // const taxVal = readEncryptedNum(salaryDoc, "tax_enc", "tax");
    // const net =
    //   Number(totalEarnings || 0) -
    //   Number(totalDeductions || 0) -
    //   Number(taxVal || 0);
    // const netPay = Math.round((net + Number.EPSILON) * 100) / 100;

    const net = Number(totalEarnings || 0) - Number(totalDeductions || 0);
    const netPay = Math.round((net + Number.EPSILON) * 100) / 100;

    // Build update object depending on encryption flag
    if (salaryDoc.isEncrypted) {
      const upd = {};

      // pay period
      if (incoming.payMonth !== undefined)
        upd.payMonth = Number(incoming.payMonth);
      if (incoming.payYear !== undefined)
        upd.payYear = Number(incoming.payYear);

      // attendance fields (kept numeric)
      if (incoming.totalWorkingDays !== undefined)
        upd.totalWorkingDays = Number(incoming.totalWorkingDays);
      if (incoming.paidDays !== undefined)
        upd.paidDays = Number(incoming.paidDays);
      if (incoming.lopDays !== undefined)
        upd.lopDays = Number(incoming.lopDays);
      if (incoming.leaves_taken !== undefined)
        upd.leaves_taken = Number(incoming.leaves_taken);

      // encrypt only fields that were provided incoming OR we always update totals/tax/net
      if (Object.prototype.hasOwnProperty.call(incoming, "basicSalary"))
        upd.basicSalary_enc = encryptField(
          String(Number(incoming.basicSalary || 0))
        );
      if (Object.prototype.hasOwnProperty.call(incoming, "hra"))
        upd.hra_enc = encryptField(String(Number(incoming.hra || 0)));
      if (Object.prototype.hasOwnProperty.call(incoming, "trAllowance"))
        upd.trAllowance_enc = encryptField(
          String(Number(incoming.trAllowance || 0))
        );
      if (Object.prototype.hasOwnProperty.call(incoming, "specialAllowance"))
        upd.specialAllowance_enc = encryptField(
          String(Number(incoming.specialAllowance || 0))
        );
      if (Object.prototype.hasOwnProperty.call(incoming, "vda"))
        upd.vda_enc = encryptField(String(Number(incoming.vda || 0)));

      if (Object.prototype.hasOwnProperty.call(incoming, "epf"))
        upd.epf_enc = encryptField(String(Number(incoming.epf || 0)));
      if (Object.prototype.hasOwnProperty.call(incoming, "esic"))
        upd.esic_enc = encryptField(String(Number(incoming.esic || 0)));
      if (Object.prototype.hasOwnProperty.call(incoming, "professionalTax"))
        upd.professionalTax_enc = encryptField(
          String(Number(incoming.professionalTax || 0))
        );
      if (Object.prototype.hasOwnProperty.call(incoming, "uniform_deduction"))
        upd.uniform_deduction_enc = encryptField(
          String(Number(incoming.uniform_deduction || 0))
        );
      if (Object.prototype.hasOwnProperty.call(incoming, "late_login"))
        upd.late_login_enc = encryptField(
          String(Number(incoming.late_login || 0))
        );
      if (Object.prototype.hasOwnProperty.call(incoming, "others"))
        upd.others_enc = encryptField(String(Number(incoming.others || 0)));

      // if (Object.prototype.hasOwnProperty.call(incoming, "advance"))
      //   upd.advance_enc = encryptField(String(Number(incoming.advance || 0)));
      upd.advance_enc = encryptField(String(computedAdvance));

      if (Object.prototype.hasOwnProperty.call(incoming, "lop"))
        upd.lop_enc = encryptField(String(Number(incoming.lop || 0)));

      // always update totals/tax/net_enc from computed values
      upd.totalEarnings_enc = encryptField(String(totalEarnings));
      upd.totalDeductions_enc = encryptField(String(totalDeductions));
      // upd.tax_enc = encryptField(
      //   String(Number(incoming.tax !== undefined ? incoming.tax : taxVal || 0))
      // );
      upd.netPay_enc = encryptField(String(netPay));

      if (incoming.salarySlipNumber !== undefined)
        upd.salarySlipNumber = incoming.salarySlipNumber
          ? String(incoming.salarySlipNumber).trim()
          : undefined;
      if (incoming.notes !== undefined)
        upd.notes_enc = encryptField(String(incoming.notes || ""));

      // keep visible numeric fields zeroed for compatibility
      upd.basicSalary = 0;
      upd.hra = 0;
      upd.trAllowance = 0;
      upd.specialAllowance = 0;
      upd.vda = 0;
      upd.epf = 0;
      upd.esic = 0;
      upd.professionalTax = 0;
      upd.uniform_deduction = 0;
      upd.late_login = 0;
      upd.others = 0;
      upd.advance = 0;
      upd.lop = 0;
      upd.totalEarnings = 0;
      upd.totalDeductions = 0;
      // upd.tax = 0;
      upd.netPay = 0;
      upd.isEncrypted = true;

      // remove undefined keys
      Object.keys(upd).forEach((k) => upd[k] === undefined && delete upd[k]);

      const updated = await Salary.findByIdAndUpdate(salaryDoc._id, upd, {
        new: true,
        runValidators: true,
      }).lean();

      return res.status(200).json({
        success: true,
        message: "Encrypted salary slip updated",
        data: updated,
      });
    } else {
      // plaintext numeric update path - let schema pre-validate compute totals
      const upd = {};

      if (incoming.payMonth !== undefined)
        upd.payMonth = Number(incoming.payMonth);
      if (incoming.payYear !== undefined)
        upd.payYear = Number(incoming.payYear);

      if (incoming.basicSalary !== undefined)
        upd.basicSalary = Number(incoming.basicSalary || 0);
      if (incoming.hra !== undefined) upd.hra = Number(incoming.hra || 0);
      if (incoming.trAllowance !== undefined)
        upd.trAllowance = Number(incoming.trAllowance || 0);
      if (incoming.specialAllowance !== undefined)
        upd.specialAllowance = Number(incoming.specialAllowance || 0);
      if (incoming.vda !== undefined) upd.vda = Number(incoming.vda || 0);

      if (incoming.epf !== undefined) upd.epf = Number(incoming.epf || 0);
      if (incoming.esic !== undefined) upd.esic = Number(incoming.esic || 0);
      if (incoming.professionalTax !== undefined)
        upd.professionalTax = Number(incoming.professionalTax || 0);
      if (incoming.uniform_deduction !== undefined)
        upd.uniform_deduction = Number(incoming.uniform_deduction || 0);
      if (incoming.late_login !== undefined)
        upd.late_login = Number(incoming.late_login || 0);
      if (incoming.others !== undefined)
        upd.others = Number(incoming.others || 0);

      // if (incoming.advance !== undefined)
      //   upd.advance = Number(incoming.advance || 0);
      if (incoming.lop !== undefined) upd.lop = Number(incoming.lop || 0);

      if (incoming.totalWorkingDays !== undefined)
        upd.totalWorkingDays = Number(incoming.totalWorkingDays || 0);
      if (incoming.paidDays !== undefined)
        upd.paidDays = Number(incoming.paidDays || 0);
      if (incoming.lopDays !== undefined)
        upd.lopDays = Number(incoming.lopDays || 0);
      if (incoming.leaves_taken !== undefined)
        upd.leaves_taken = Number(incoming.leaves_taken || 0);

      // if (incoming.tax !== undefined) upd.tax = Number(incoming.tax || 0);

      if (incoming.salarySlipNumber !== undefined)
        upd.salarySlipNumber = incoming.salarySlipNumber
          ? String(incoming.salarySlipNumber).trim()
          : undefined;
      if (incoming.notes !== undefined)
        upd.notes = incoming.notes ? String(incoming.notes) : undefined;

      Object.keys(upd).forEach((k) => upd[k] === undefined && delete upd[k]);

      const updated = await Salary.findByIdAndUpdate(salaryDoc._id, upd, {
        new: true,
        runValidators: true,
      }).lean();

      return res
        .status(200)
        .json({ success: true, message: "Salary slip updated", data: updated });
    }
  } catch (err) {
    console.error("editIndEmployeeSalaryDetails error:", err);
    if (err && err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Conflicting salary slip (payMonth/payYear) already exists.",
        error: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Server error while updating salary slip",
      error: err.message,
    });
  }
};

//ejs-salary-slips
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const formatINR = (n) => {
  if (n === null || n === undefined || isNaN(Number(n))) return "0.00";
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const safeNum = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const readSalarySlipTemplateById = async (req, res) => {
  try {
    const { companyId, deptId, employeeId, salaryId } = req.params;
    const isValid = (id) => mongoose.Types.ObjectId.isValid(id);
    if (![companyId, deptId, employeeId, salaryId].every(isValid)) {
      return res.status(400).send("Invalid ID(s) provided");
    }

    // Fetch records in parallel
    const [company, dept, employee, salary] = await Promise.all([
      AdminCompany.findById(companyId)
        .lean()
        .exec()
        .catch(() => null),
      employeeDept
        .findById(deptId)
        .lean()
        .exec()
        .catch(() => null),
      Employee.findById(employeeId)
        .lean()
        .exec()
        .catch(() => null),
      Salary.findById(salaryId)
        .lean()
        .exec()
        .catch(() => null),
    ]);

    if (!salary) return res.status(404).send("Salary record not found");

    const readNumericFromSalary = (plainKey, encKey) => {
      try {
        if (salary.isEncrypted && salary[encKey]) {
          const dec = decryptField(salary[encKey]);
          return safeNum(dec);
        }
        return safeNum(salary[plainKey]);
      } catch {
        return safeNum(salary[plainKey]);
      }
    };

    const readNumericFromEmployees = (plainKey, encKey) => {
      try {
        if (employee && employee[encKey]) {
          const dec = decryptField(employee[encKey]);
          return safeNum(dec);
        }
        return safeNum(employee[plainKey]);
      } catch {
        return safeNum(employee[plainKey]);
      }
    };

    // Helper: read text (notes, etc.)
    const readTextFromSalary = (plainKey, encKey) => {
      try {
        if (salary.isEncrypted && salary[encKey]) {
          return decryptField(salary[encKey]);
        }
        return salary[plainKey] ?? "";
      } catch {
        return salary[plainKey] ?? "";
      }
    };

    const readEmployeeText = (plainKey, encKey) => {
      try {
        if (employee && employee[encKey]) {
          return decryptField(employee[encKey]);
        }
        return employee[plainKey] ?? "";
      } catch {
        return employee[plainKey] ?? "";
      }
    };

    // Map fields (match names in your model / sample document)
    const mapped = {
      company: {
        name: company?.companyName || "",
        address: company?.companyAddress || "",
        logo: company?.companyLogo || null,
      },
      employee: {
        id: employee?._id || employeeId,
        empId: employee?.employeeId || "", // plain field
        name: employee?.employeeName || "",
        designation: employee?.designation || "",
        doj: employee?.dateOfJoining ? new Date(employee.dateOfJoining) : null,
        aadhar: readEmployeeText("aadhar", "aadhar"),
        UAN: readEmployeeText("UAN", "UAN"),

        // pfNo: employee?.pfNo || "",
        pfNo: readEmployeeText("pfNo", "pfNo"),
        // esiNo: employee?.esiNo || "",
        esiNo: readEmployeeText("esiNo", "esiNo"),
        bankName: readEmployeeText("bankName", "bankName"),
        bankAccountNo: readEmployeeText("bankAccountNo", "bankAccountNo"),
        email: employee?.email || "",
        mobileNumber: employee?.mobileNumber || "",
      },
      // salary numeric fields (use readNumeric to support encrypted storage)
      salary: {
        id: salary._id,
        salarySlipNumber: salary.salarySlipNumber || "",
        payMonth: salary.payMonth,
        payYear: salary.payYear,
        totalWorkingDays: salary.totalWorkingDays ?? 0,
        paidDays: salary.paidDays ?? 0,
        lopDays: salary.lopDays ?? 0,
        leaves_taken: salary.leaves_taken ?? 0,
        // earnings
        basicSalary: readNumericFromSalary("basicSalary", "basicSalary_enc"),
        hra: readNumericFromSalary("hra", "hra_enc"),
        trAllowance: readNumericFromSalary("trAllowance", "trAllowance_enc"),
        specialAllowance: readNumericFromSalary(
          "specialAllowance",
          "specialAllowance_enc"
        ),
        vda: readNumericFromSalary("vda", "vda_enc"),
        // deductions
        epf: readNumericFromSalary("epf", "epf_enc"),
        esic: readNumericFromSalary("esic", "esic_enc"),
        professionalTax: readNumericFromSalary(
          "professionalTax",
          "professionalTax_enc"
        ),
        uniform_deduction: readNumericFromSalary(
          "uniform_deduction",
          "uniform_deduction_enc"
        ),
        late_login: readNumericFromSalary("late_login", "late_login_enc"),
        others: readNumericFromSalary("others", "others_enc"),
        advance: readNumericFromSalary("advance", "advance_enc"),
        lop: readNumericFromSalary("lop", "lop_enc"),
        // tax: readNumericFromSalary("tax", "tax_enc"),
        // totals
        totalEarnings: readNumericFromSalary(
          "totalEarnings",
          "totalEarnings_enc"
        ),
        totalDeductions: readNumericFromSalary(
          "totalDeductions",
          "totalDeductions_enc"
        ),
        netPay: readNumericFromSalary("netPay", "netPay_enc"),
        notes: readTextFromSalary("notes", "notes_enc"),
        snapshot: readTextFromSalary("snapshot", "snapshot_enc"),
        createdAt: salary.createdAt,
        updatedAt: salary.updatedAt,
      },

      department: {
        name: dept?.department || dept?.name || "",
      },
    };

    // compute advance from components if components present (non-zero). Otherwise use stored advance.
    const compUniform = Number(mapped.salary.uniform_deduction || 0);
    const compLate = Number(mapped.salary.late_login || 0);
    const compOthers = Number(mapped.salary.others || 0);

    let advanceFromComponents = compUniform + compLate + compOthers;

    // if components are all zero but stored advance exists, keep stored advance
    if (advanceFromComponents === 0 && mapped.salary.advance) {
      advanceFromComponents = Number(mapped.salary.advance || 0);
    }

    //round
    advanceFromComponents =
      Math.round((advanceFromComponents + Number.EPSILON) * 100) / 100;

    mapped.salary.advance = advanceFromComponents;

    // Compute totals if not present or zero
    const computedGross =
      mapped.salary.totalEarnings ||
      mapped.salary.basicSalary +
        mapped.salary.hra +
        mapped.salary.trAllowance +
        mapped.salary.specialAllowance +
        mapped.salary.vda;

    const computedDeductions =
      mapped.salary.totalDeductions ||
      mapped.salary.epf +
        mapped.salary.esic +
        mapped.salary.professionalTax +
        mapped.salary.advance +
        mapped.salary.lop;
    // mapped.salary.tax;

    const computedNet =
      mapped.salary.netPay || computedGross - computedDeductions;

    // Prepare payload for EJS template
    const payload = {
      company: mapped.company,
      department: mapped.department,
      employee: mapped.employee,
      salary: {
        ...mapped.salary,
        payMonthName:
          typeof mapped.salary.payMonth === "number" &&
          mapped.salary.payMonth >= 1 &&
          mapped.salary.payMonth <= 12
            ? monthNames[mapped.salary.payMonth - 1]
            : "",
        gross: computedGross,
        totalDeductions: computedDeductions,
        netPay: computedNet,
      },
      fmt: {
        basicSalary: formatINR(mapped.salary.basicSalary),
        hra: formatINR(mapped.salary.hra),
        trAllowance: formatINR(mapped.salary.trAllowance),
        specialAllowance: formatINR(mapped.salary.specialAllowance),
        vda: formatINR(mapped.salary.vda),
        epf: formatINR(mapped.salary.epf),
        esic: formatINR(mapped.salary.esic),
        professionalTax: formatINR(mapped.salary.professionalTax),
        advance: formatINR(mapped.salary.advance),
        lop: formatINR(mapped.salary.lop),
        // tax: formatINR(mapped.salary.tax),
        totalEarnings: formatINR(computedGross),
        totalDeductions: formatINR(computedDeductions),
        netPay: formatINR(computedNet),
      },
    };
    console.log("payload", payload);

    return res.render("salary", payload);
  } catch (err) {
    console.error("readSalarySlipTemplateById error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while updating salary slip",
      error: err.message,
    });
  }
};

const sendSalarySlipByEmail = async (req, res) => {
  try {
    const { companyId, deptId, employeeId, salaryId } = req.params;

    const recipient = req.body?.recipient; // optional - fallback to employee.email

    // Validate IDs
    if (
      ![companyId, deptId, employeeId, salaryId].every((id) =>
        mongoose.Types.ObjectId.isValid(id)
      )
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid IDs in URL." });
    }

    // Fetch resources in parallel
    const [company, dept, employee, salary] = await Promise.all([
      AdminCompany.findById(companyId)
        .lean()
        .exec()
        .catch(() => null),
      employeeDept
        .findById(deptId)
        .lean()
        .exec()
        .catch(() => null),
      Employee.findById(employeeId)
        .lean()
        .exec()
        .catch(() => null),
      Salary.findById(salaryId)
        .lean()
        .exec()
        .catch(() => null),
    ]);

    if (!company)
      return res
        .status(404)
        .json({ success: false, message: "Company not found." });
    if (!dept)
      return res
        .status(404)
        .json({ success: false, message: "Department not found." });
    if (!employee)
      return res
        .status(404)
        .json({ success: false, message: "Employee not found." });
    if (!salary)
      return res
        .status(404)
        .json({ success: false, message: "Salary slip not found." });

    if (
      String(salary.company) !== String(companyId) ||
      String(salary.department) !== String(deptId) ||
      String(salary.employee) !== String(employeeId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Mismatched salary/employee/company/department.",
      });
    }

    const readNumericFromSalary = (plainKey, encKey) => {
      try {
        if (salary.isEncrypted && salary[encKey]) {
          const dec = decryptField(salary[encKey]);
          return safeNum(dec);
        }
        return safeNum(salary[plainKey]);
      } catch (e) {
        return safeNum(salary[plainKey]);
      }
    };

    const readTextFromSalary = (plainKey, encKey) => {
      try {
        if (salary.isEncrypted && salary[encKey]) {
          return decryptField(salary[encKey]);
        }
        return salary[plainKey] ?? "";
      } catch (e) {
        return salary[plainKey] ?? "";
      }
    };

    const readEmployeeText = (plainKey, encKey) => {
      try {
        if (employee && employee[encKey]) {
          return decryptField(employee[encKey]);
        }
        return employee[plainKey] ?? "";
      } catch {
        return employee[plainKey] ?? "";
      }
    };

    const mapped = {
      company: {
        name: company?.companyName || "",
        address: company?.companyAddress || "",
        logo: company?.companyLogo || null,
      },
      employee: {
        id: employee?._id || employeeId,
        empId: employee?.employeeId || "",
        name: employee?.employeeName || "",
        designation: employee?.designation || "",
        doj: employee?.dateOfJoining ? new Date(employee.dateOfJoining) : null,
        aadhar: readEmployeeText("aadhar", "aadhar"),
        UAN: readEmployeeText("UAN", "UAN"),

        pfNo: readEmployeeText("pfNo", "pfNo"),
        esiNo: readEmployeeText("esiNo", "esiNo"),
        bankName: readEmployeeText("bankName", "bankName"),
        bankAccountNo: readEmployeeText("bankAccountNo", "bankAccountNo"),
        email: employee?.email || "",
        mobileNumber: employee?.mobileNumber || "",
      },
      salary: {
        id: salary._id,
        salarySlipNumber: salary.salarySlipNumber || "",
        payMonth: salary.payMonth,
        payYear: salary.payYear,
        totalWorkingDays: salary.totalWorkingDays ?? 0,
        paidDays: salary.paidDays ?? 0,
        lopDays: salary.lopDays ?? 0,
        leaves_taken: salary.leaves_taken ?? 0,
        basicSalary: readNumericFromSalary("basicSalary", "basicSalary_enc"),
        hra: readNumericFromSalary("hra", "hra_enc"),
        trAllowance: readNumericFromSalary("trAllowance", "trAllowance_enc"),
        specialAllowance: readNumericFromSalary(
          "specialAllowance",
          "specialAllowance_enc"
        ),
        vda: readNumericFromSalary("vda", "vda_enc"),
        epf: readNumericFromSalary("epf", "epf_enc"),
        esic: readNumericFromSalary("esic", "esic_enc"),
        professionalTax: readNumericFromSalary(
          "professionalTax",
          "professionalTax_enc"
        ),
        uniform_deduction: readNumericFromSalary(
          "uniform_deduction",
          "uniform_deduction_enc"
        ),
        late_login: readNumericFromSalary("late_login", "late_login_enc"),
        others: readNumericFromSalary("others", "others_enc"),
        advance: readNumericFromSalary("advance", "advance_enc"),
        lop: readNumericFromSalary("lop", "lop_enc"),
        totalEarnings: readNumericFromSalary(
          "totalEarnings",
          "totalEarnings_enc"
        ),
        totalDeductions: readNumericFromSalary(
          "totalDeductions",
          "totalDeductions_enc"
        ),
        netPay: readNumericFromSalary("netPay", "netPay_enc"),
        notes: readTextFromSalary("notes", "notes_enc"),
        snapshot: readTextFromSalary("snapshot", "snapshot_enc"),
        createdAt: salary.createdAt,
        updatedAt: salary.updatedAt,
      },
      department: { name: dept?.department || dept?.name || "" },
    };

    // compute advance from components if components present
    const compUniform = Number(mapped.salary.uniform_deduction || 0);
    const compLate = Number(mapped.salary.late_login || 0);
    const compOthers = Number(mapped.salary.others || 0);
    let advanceFromComponents = compUniform + compLate + compOthers;
    if (advanceFromComponents === 0 && mapped.salary.advance) {
      advanceFromComponents = Number(mapped.salary.advance || 0);
    }
    advanceFromComponents =
      Math.round((advanceFromComponents + Number.EPSILON) * 100) / 100;
    mapped.salary.advance = advanceFromComponents;

    // computed totals if missing (same logic you use)
    const computedGross =
      mapped.salary.totalEarnings ||
      mapped.salary.basicSalary +
        mapped.salary.hra +
        mapped.salary.trAllowance +
        mapped.salary.specialAllowance +
        mapped.salary.vda;

    const computedDeductions =
      mapped.salary.totalDeductions ||
      mapped.salary.epf +
        mapped.salary.esic +
        mapped.salary.professionalTax +
        mapped.salary.advance +
        mapped.salary.lop;

    const computedNet =
      mapped.salary.netPay || computedGross - computedDeductions;

    // prepare fmt object (formatted strings)
    const fmt = {
      basicSalary: formatINR(mapped.salary.basicSalary),
      hra: formatINR(mapped.salary.hra),
      trAllowance: formatINR(mapped.salary.trAllowance),
      specialAllowance: formatINR(mapped.salary.specialAllowance),
      vda: formatINR(mapped.salary.vda),
      epf: formatINR(mapped.salary.epf),
      esic: formatINR(mapped.salary.esic),
      professionalTax: formatINR(mapped.salary.professionalTax),
      advance: formatINR(mapped.salary.advance),
      lop: formatINR(mapped.salary.lop),
      totalEarnings: formatINR(computedGross),
      totalDeductions: formatINR(computedDeductions),
      netPay: formatINR(computedNet),
    };

    const payload = {
      company: mapped.company,
      department: mapped.department,
      employee: mapped.employee,
      salary: {
        ...mapped.salary,
        payMonthName:
          typeof mapped.salary.payMonth === "number" &&
          mapped.salary.payMonth >= 1 &&
          mapped.salary.payMonth <= 12
            ? monthNames[mapped.salary.payMonth - 1]
            : "",
        gross: computedGross,
        totalDeductions: computedDeductions,
        netPay: computedNet,
      },
      fmt,
    };

    const monthDisplayName =
      (payload && payload.salary && payload.salary.payMonthName) ||
      (typeof mapped.salary.payMonth === "number" &&
      mapped.salary.payMonth >= 1 &&
      mapped.salary.payMonth <= 12
        ? monthNames[mapped.salary.payMonth - 1]
        : mapped.salary.payMonth || "");

    // render salary.ejs to HTML (assumes views/salary.ejs exists at project root)
    const ejsPath = path.join(process.cwd(), "views", "salary.ejs");
    const html = await ejs.renderFile(ejsPath, payload, { async: false });

    // convert HTML to PDF using puppeteer
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      // set content and wait for images to load (if any)
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      });

      // prepare email transporter
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = Number(process.env.SMTP_PORT || 587);
      // const smtpUser = process.env.SMTP_USER;
      const smtpUser = process.env.RAJAVRUKSHA_MAIL;
      // const smtpPass = process.env.SMTP_PASS;
      const smtpPass = process.env.RAJAVRUKSHA_SMTP_PASS;

      // const mailFrom = process.env.MAIL_FROM || smtpUser;
      const mailFrom = `HR Department <${
        process.env.RAJAVRUKSHA_MAIL || smtpUser
      }>`;

      // let smtpUser, smtpPass, mailFrom;

      // const companyEmail = company?.companyEmail?.toLowerCase() || "";
      // if (companyEmail === process.env.RAJAVRUKSHA_MAIL?.toLowerCase()) {
      //   smtpUser = process.env.RAJAVRUKSHA_MAIL;
      //   smtpPass = process.env.RAJAVRUKSHA_SMTP_PASS;
      //   mailFrom = `HR Department <${smtpUser}>`;
      // } else if (companyEmail === process.env.DHS_MAIL?.toLowerCase()) {
      //   smtpUser = process.env.DHS_MAIL;
      //   smtpPass = process.env.DHS_SMTP_PASS;
      //   mailFrom = `HR Department <${smtpUser}>`;
      // } else {
      //   smtpUser = process.env.SMTP_USER;
      //   smtpPass = process.env.SMTP_PASS;
      //   mailFrom = process.env.FROM_EMAIL || smtpUser;
      // }

      if (!smtpHost || !smtpUser || !smtpPass) {
        return res
          .status(500)
          .json({ success: false, message: "SMTP not configured on server." });
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // true for 465, false for other ports
        auth: { user: smtpUser, pass: smtpPass },
      });

      // determine recipient email
      const toEmail = recipient || (mapped.employee && mapped.employee.email);
      if (!toEmail) {
        return res.status(400).json({
          success: false,
          message: "Recipient email not provided and employee has no email.",
        });
      }

      // friendly filename
      const filename = `Payslip-${
        mapped.employee.empId || mapped.employee.name || "employee"
      }-${monthDisplayName || ""}-${mapped.salary.payYear || ""}.pdf`.replace(
        /\s+/g,
        "_"
      );

      // send the email
      const mailOptions = {
        from: mailFrom,
        to: toEmail,
        subject: `Salary Slip - ${
          monthDisplayName || mapped.salary.payMonth || ""
        } ${mapped.salary.payYear || ""}`,

        text: `Please find the attached salary slip for ${
          monthDisplayName || mapped.salary.payMonth || ""
        } ${mapped.salary.payYear || ""}.`,

        html: `<p>Please find the attached salary slip for <strong>${
          monthDisplayName || mapped.salary.payMonth || ""
        } ${mapped.salary.payYear || ""}</strong>.</p>`,
        attachments: [{ filename, content: pdfBuffer }],
      };

      const info = await transporter.sendMail(mailOptions);

      // close puppeteer
      await page.close();

      // success response
      return res.status(200).json({
        success: true,
        message: "Salary slip emailed successfully.",
        to: toEmail,
        mailInfo: { messageId: info.messageId },
      });
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (err) {
    console.error("sendSalarySlipByEmail error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while sending salary slip",
      error: err.message,
    });
  }
};

const sendAllEmployeesSalarySlips = async (req, res) => {
  try {
  } catch (err) {}
};

module.exports = {
  adminSendOTP,
  adminVerifyOTP,
  addCompany,
  getCompanyList,
  getCompanyDetails,
  updateCompanyDetails,
  deleteCompanyDetails,
  createDept,
  getDepartmentListUnderEachCompany,
  editDepartmentUnderEachCompany,
  deleteDepartmentUnderEachCompany,
  createEmployeeRecord,
  viewDepartmentEmployeesUnderCompany,
  editDepartmentEmployeeUnderCompany,
  deleteDepartmentEmployeeUnderCompany,
  createSalaryDetails,
  getIndEmployeeSalaryDetails,
  fetchStoredEmployeeSalaryDetails,
  deleteIndEmployeeSalaryDetails,
  editIndEmployeeSalaryDetails,
  readSalarySlipTemplateById,
  sendSalarySlipByEmail,
  sendAllEmployeesSalarySlips,
};
