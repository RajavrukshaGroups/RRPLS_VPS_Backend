require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");
const ejs = require("ejs");
const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");

const AdminCompany = require("../models/adminCompany");
const employeeDept = require("../models/employeeDept");
const Employee = require("../models/employeeDetails");
const Salary = require("../models/employeeSalary");

const { dcryptField, decryptField } = require("../utils/encryption");

// safe numeric parse
const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// INR formatter
const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

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

const sendAllEmployeesSalarySlipsToAccountsTeam = async (req, res) => {
  try {
    const { companyId, deptId } = req.params;
    console.log("company id", companyId);
    console.log("dept id", deptId);

    const payMonthRaw = req.body?.payMonth ?? req.query?.payMonth;
    const payYearRaw = req.body?.payYear ?? req.query?.payYear;

    if (
      !mongoose.Types.ObjectId.isValid(companyId) ||
      !mongoose.Types.ObjectId.isValid(deptId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid companyId or deptId." });
    }

    // require payMonth & payYear (as requested)
    if (!payMonthRaw || !payYearRaw) {
      return res.status(400).json({
        success: false,
        message:
          "Required parameters payMonth and payYear missing. Send payMonth (1-12) and payYear (e.g. 2025).",
      });
    }

    const payMonth = Number(payMonthRaw);
    const payYear = Number(payYearRaw);
    if (
      !Number.isInteger(payMonth) ||
      payMonth < 1 ||
      payMonth > 12 ||
      !Number.isInteger(payYear)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payMonth/payYear values." });
    }

    // load company and department
    const [company, dept] = await Promise.all([
      AdminCompany.findById(companyId)
        .lean()
        .exec()
        .catch(() => null),
      employeeDept
        .findById(deptId)
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

    // fetch salaries for given month/year
    const salaries = await Salary.find({
      company: companyId,
      department: deptId,
      payMonth,
      payYear,
    })
      .lean()
      .exec();

    if (!Array.isArray(salaries) || salaries.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No salary slips found for ${
          monthNames[payMonth - 1]
        } ${payYear}.`,
      });
    }

    // batch fetch employees referenced in salaries
    const employeeIds = Array.from(
      new Set(salaries.map((s) => String(s.employee)).filter(Boolean))
    );
    const employees = await Employee.find({ _id: { $in: employeeIds } })
      .lean()
      .exec();
    const employeesById = employees.reduce((acc, e) => {
      acc[String(e._id)] = e;
      return acc;
    }, {});

    // helper to read numeric/decrypted fields from a salary doc
    const readNumericFromSalary = (salaryDoc, plainKey, encKey) => {
      try {
        if (salaryDoc.isEncrypted && salaryDoc[encKey]) {
          const dec = decryptField(salaryDoc[encKey]);
          return safeNum(dec);
        }
        return safeNum(salaryDoc[plainKey]);
      } catch (e) {
        return safeNum(salaryDoc[plainKey]);
      }
    };

    // Build rows for accounts.ejs
    const rows = salaries.map((s) => {
      const emp = employeesById[String(s.employee)] || null;
      const totalWorkingDays = safeNum(s.totalWorkingDays);
      const paidDays = safeNum(s.paidDays);
      const lopDays = safeNum(s.lopDays);

      const basicSalary = readNumericFromSalary(
        s,
        "basicSalary",
        "basicSalary_enc"
      );
      const hra = readNumericFromSalary(s, "hra", "hra_enc");
      const trAllowance = readNumericFromSalary(
        s,
        "trAllowance",
        "trAllowance_enc"
      );
      const specialAllowance = readNumericFromSalary(
        s,
        "specialAllowance",
        "specialAllowance_enc"
      );
      const vda = readNumericFromSalary(s, "vda", "vda_enc");
      const foodAllowance = readNumericFromSalary(
        s,
        "foodAllowance",
        "foodAllowance_enc"
      );
      const uniformRefund = readNumericFromSalary(
        s,
        "uniformRefund",
        "uniformRefund_enc"
      );
      const epf = readNumericFromSalary(s, "epf", "epf_enc");
      const esic = readNumericFromSalary(s, "esic", "esic_enc");
      const professionalTax = readNumericFromSalary(
        s,
        "professionalTax",
        "professionalTax_enc"
      );
      const advance = readNumericFromSalary(s, "advance", "advance_enc");
      const lop = readNumericFromSalary(s, "lop", "lop_enc");

      const computedGross =
        safeNum(s.totalEarnings) ||
        basicSalary +
          hra +
          trAllowance +
          specialAllowance +
          foodAllowance +
          uniformRefund +
          vda;

      const computedDeductions =
        safeNum(s.totalDeductions) ||
        epf + esic + professionalTax + advance + lop;

      const computedNet =
        safeNum(s.netPay) || computedGross - computedDeductions;

      return {
        employeeName: emp?.employeeName || "",
        employeeId: emp?.employeeId || "",
        totalWorkingDays,
        paidDays,
        lopDays,
        gross: computedGross,
        totalDeductions: computedDeductions,
        netPay: computedNet,
        formattedNet: formatINR(computedNet),
      };
    });

    console.log("rows", rows);

    //totals
    const totals = rows.reduce(
      (acc, r) => {
        acc.totalWorkingDays += Number(r.totalWorkingDays || 0);
        acc.paidDays += Number(r.paidDays || 0);
        acc.lopDays += Number(r.lopDays || 0);
        acc.netPay += Number(r.netPay || 0);
        return acc;
      },
      { totalWorkingDays: 0, paidDays: 0, lopDays: 0, netPay: 0 }
    );
    totals.formattedNetPay = formatINR(totals.netPay);

    // payload for EJS
    const payload = {
      company: {
        name: company.companyName || company.name || "",
        address: company.companyAddress || company.address || "",
        logo: company.companyLogo || null,
      },
      department: {
        name: dept.department || dept.name || "",
      },
      monthName: monthNames[payMonth - 1],
      year: payYear,
      rows,
      totals,
      generatedAt: new Date(),
      fmt: { formatINR },
    };
    console.log("payload123", payload);

    // render accounts.ejs
    const ejsPath = path.join(process.cwd(), "views", "account.ejs");
    const html = await ejs.renderFile(ejsPath, payload, { async: false });

    // convert to PDF with puppeteer
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      });

      // choose SMTP credentials for Rajavruksha
      const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
      const smtpPort = Number(process.env.SMTP_PORT || 587);
      const smtpUser = process.env.RAJAVRUKSHA_MAIL;
      const smtpPass = process.env.RAJAVRUKSHA_SMTP_PASS;
      const mailFrom = `Accounts <${smtpUser}>`;

      if (!smtpHost || !smtpUser || !smtpPass) {
        return res.status(500).json({
          success: false,
          message:
            "SMTP not configured for Rajavruksha mailing. Set RAJAVRUKSHA_MAIL and RAJAVRUKSHA_SMTP_PASS or SMTP_USER/SMTP_PASS.",
        });
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const filename = `Accounts_${(payload.department.name || "dept").replace(
        /\s+/g,
        "_"
      )}_${payload.monthName}_${payload.year}.pdf`;

      const mailOptions = {
        from: mailFrom,
        to: process.env.RAJAVRUKSHA_MAIL,
        subject: `Accounts Summary — ${payload.department.name}(${payload.company.name}) — ${payload.monthName} ${payload.year}`,
        text: `Please find attached the accounts summary for ${payload.monthName} ${payload.year} for department ${payload.department.name}.`,
        html: `<p>Please find attached the accounts summary for <strong>${payload.monthName} ${payload.year}</strong> for department <strong>${payload.department.name}</strong> at <strong>${payload.company.name}</strong>.</p>`,
        attachments: [{ filename, content: pdfBuffer }],
      };

      const info = await transporter.sendMail(mailOptions);
      await page.close();

      return res.status(200).json({
        success: true,
        message: "Accounts summary PDF generated and emailed successfully.",
        to: process.env.RAJAVRUKSHA_MAIL,
        mailInfo: { messageId: info.messageId },
        rowsCount: rows.length,
      });
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (err) {
    console.error("sendAllEmployeesSalarySlips error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while generating accounts summary",
      error: err.message,
    });
  }
};

module.exports = {
  sendAllEmployeesSalarySlipsToAccountsTeam,
};
