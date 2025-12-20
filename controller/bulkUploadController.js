const sheets = require("../utils/googleSheet");
const AdminCompany = require("../models/adminCompany");
const EmpDept = require("../models/employeeDept");
const Employee = require("../models/employeeDetails");

const SHEET_ID = process.env.GS_SHEET_ID;
const SHEET_NAME = process.env.GS_SHEET_NAME;

// Header starts at row 5 in sheet (0-based index = 4)
const HEADER_ROW_INDEX = 4;

// const parseDate = (value) => {
//   if (!value || value === "-") return null;
//   const d = new Date(value);
//   return isNaN(d.getTime()) ? null : d;
// };

const parseDate = (value) => {
  if (!value || value === "-") return null;

  const cleaned = value.trim().replace(/\//g, "-");
  let day, month, year;

  if (isNaN(cleaned.split("-")[1])) {
    const parts = cleaned.split("-");
    if (parts.length !== 3) return null;

    day = parseInt(parts[0], 10);
    year = parseInt(parts[2], 10);

    const monthMap = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };

    month = monthMap[parts[1].toLowerCase().slice(0, 3)];
  } else {
    const parts = cleaned.split("-");
    day = +parts[0];
    month = +parts[1] - 1;
    year = +parts[2];
  }

  if (year < 100) year += year >= 50 ? 1900 : 2000;

  // ⭐ KEY LINE (NOON UTC – NEVER SHIFTS DATE)
  return new Date(Date.UTC(year, month, day, 12, 0, 0));
};

const bulkUploadEmployeeData = async (req, res) => {
  try {
    // 1️⃣ Read Google Sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: SHEET_NAME,
    });

    const rows = response.data.values;

    if (!rows || rows.length <= HEADER_ROW_INDEX) {
      return res.status(400).json({
        message: "Sheet does not contain enough rows",
      });
    }

    // 2️⃣ Extract headers & records correctly
    const headers = rows[HEADER_ROW_INDEX];
    const records = rows.slice(HEADER_ROW_INDEX + 1);

    let inserted = 0;
    let skipped = 0;
    const errors = [];

    // 3️⃣ Process each row
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const data = {};

      headers.forEach((header, idx) => {
        if (header) {
          data[header.trim()] = row[idx]?.trim();
        }
      });

      const actualRowNumber = HEADER_ROW_INDEX + i + 2;

      // 🔎 Match Company via Short Code
      const companyCode = data["Company"]?.trim();

      if (!companyCode) {
        skipped++;
        errors.push(`Row ${actualRowNumber}: Company is empty`);
        continue;
      }

      const company = await AdminCompany.findOne({
        companyShortCode: {
          $regex: `^${companyCode}$`,
          $options: "i",
        },
      });

      if (!company) {
        skipped++;
        errors.push(`Row ${actualRowNumber}: Company not found`);
        continue;
      }

      // 🔎 Match Department under Company
      const deptName = data["Department"]?.trim();

      if (!deptName) {
        skipped++;
        errors.push(`Row ${actualRowNumber}: Department is empty`);
        continue;
      }

      const department = await EmpDept.findOne({
        company: company._id,
        department: {
          $regex: `^${deptName}$`,
          $options: "i",
        },
      });

      if (!department) {
        skipped++;
        errors.push(`Row ${actualRowNumber}: Department not found`);
        continue;
      }

      // 🔎 Prevent duplicate employee ID
      const employeeId = data["Emp ID"]?.trim();

      if (!employeeId) {
        skipped++;
        errors.push(`Row ${actualRowNumber}: Emp ID is empty`);
        continue;
      }

      const alreadyExists = await Employee.findOne({ employeeId });

      if (alreadyExists) {
        skipped++;
        errors.push(`Row ${actualRowNumber}: Employee ID already exists`);
        continue;
      }

      // 4️⃣ Create Employee
      await Employee.create({
        employeeId,
        employeeName: data["Emp Name"],
        nameAsPerAadhar: data["Name as per Adhar"],
        designation: data["Designation"],
        company: company._id,
        department: department._id,
        status: data["Status"],
        dateOfJoining: parseDate(data["DOJ"]),
        dateOfExit: parseDate(data["DOE"]),
        dateOfBirth: parseDate(data["DOB"]),
        aadhar: data["Adhar Number"],
        PAN: data["Pan Number"],
        esiNo: data["ESI No"],
        bankName: data["Bank"],
        bankAccountNo: data["Acc No"],
        bankIFSCNo: data["IFSC Code"],
        bankBranchName: data["Branch"],
        email: data["Email id"],
        mobileNumber: data["Mobile Number"],
        altmobileNumber: data["ALT No"],
        currentAddress: data["Current Address"],
        permanentAddress: data["Permanent Address"],
        bloodGroup: data["Blood Group"],
        maritalStatus: data["Marital Status"],
        fatherName: data["Father Name"],
        fatherDOB: parseDate(data["F - DOB"]),
        fatherAadhar: data["F - Aadhaar No"],
        motherName: data["Mother Name"],
        motherDOB: parseDate(data["M - DOB"]),
        motherAadhar: data["M - Aadhaar No"],
        spouseName: data["Spouse Name"],
        spouseDOB: parseDate(data["Spouse - DOB"]),
        spouseAadhar: data["Spouse - Aadhaar No"],
        childrenName: data["Son/Daughter Name"],
        childrenAadharNumber: data["C - Aadhaar No"],
        emergencyContactNumber: data["Emergency No"],
        emergencyContactName: data["Emergency Contact Name"],
        emergencyContactRelation: data["Emergency Contact Relationship"],
        nomineeName: data["Nominee"],
        nomineeRelationship: data["Nominee Relationship"],
        pendingDocuments: data["Pending"],
        source: "google_sheet",
      });

      inserted++;
    }

    // 5️⃣ Final Response
    return res.status(200).json({
      message: "Employee bulk upload completed",
      summary: {
        totalRows: records.length,
        inserted,
        skipped,
        errors,
      },
    });
  } catch (err) {
    console.error("Bulk upload error:", err);
    return res.status(500).json({
      message: "Bulk upload failed",
      error: err.message,
    });
  }
};

const deleteUploadedEmployeeData = async (req, res) => {
  try {
    const result = await Employee.deleteMany({ source: "google_sheet" });
    return res.status(200).json({
      success: true,
      message: "Google Sheet uploaded employee data deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("delete employee data error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete Google Sheet employee records",
      error: err.message,
    });
  }
};

module.exports = { bulkUploadEmployeeData, deleteUploadedEmployeeData };
