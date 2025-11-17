const express = require("express");
const router = express.Router();
const multer = require("multer");
const { storage } = require("../cloudConfig.js");
const upload = multer({ storage });
const usersController = require("../controller/userController");
const careerController = require("../controller/careerController");
const adminController = require("../controller/adminController");
const accountController = require("../controller/accountsController");

router.post("/login", usersController.login);
router.post("/admin/verify-otp", usersController.adminVerifyOTP);
router.post("/newCareer", upload.single("image"), careerController.newCareer);
router.get("/getCareers", careerController.getCareerDetails);
router.get("/getIndCareer/:id", careerController.getIndCareerDetails);
router.delete("/deleteCareer/:id", careerController.deleteCareer);
router.put(
  "/edit-career/:id",
  upload.single("image"),
  careerController.updateCareer
);
// router.get("/careerCount",careerController.careersSubmittedDataCount);
router.get("/bdeCareerDetails", careerController.getBdeData);
router.get("/bdeIntCareerDetails", careerController.getBdeIntData);
router.delete(
  "/deleteSubmittedFormData/:id",
  careerController.deleteSubmittedFormData
);
router.get("/careersSubmittedCount", careerController.careersSubmittedCount);
router.get("/getUserByDesignation", careerController.fetchUsersByDesignation);
// router.delete("/deleteusers",careerController.clearUsersCollection);

//admin-access --> to create companies
router.post("/admin/send-otp", adminController.adminSendOTP);
router.post(
  "/admin/add-company",
  upload.single("image"),
  adminController.addCompany
);
router.get("/admin/get-companies", adminController.getCompanyList);
router.get("/admin/comp-details/:id", adminController.getCompanyDetails);
router.put(
  "/admin/update-company/:id",
  upload.single("image"),
  adminController.updateCompanyDetails
);
router.delete(
  "/admin/delete-company/:id",
  adminController.deleteCompanyDetails
);

//admin-access -->department
router.post("/admin/create-dept", adminController.createDept);
router.get(
  "/admin/companies/:companyId/departments",
  adminController.getDepartmentListUnderEachCompany
);
router.put(
  "/admin/companies/:companyId/departments/:deptId",
  adminController.editDepartmentUnderEachCompany
);
router.delete(
  "/admin/companies/:companyId/departments/:deptId",
  adminController.deleteDepartmentUnderEachCompany
);

//admin-access -->employees
router.post(
  "/admin/companies/:companyId/departments/:deptId/employees",
  adminController.createEmployeeRecord
);
router.get(
  "/admin/companies/:companyId/departments/:deptId/employees",
  adminController.viewDepartmentEmployeesUnderCompany
);
router.put(
  "/admin/companies/:companyId/departments/:deptId/employees/:employeeId",
  adminController.editDepartmentEmployeeUnderCompany
);
router.delete(
  "/admin/companies/:companyId/departments/:deptId/employees/:employeeId",
  adminController.deleteDepartmentEmployeeUnderCompany
);

//admin-employees-->salary
router.post(
  "/admin/companies/:companyId/departments/:deptId/employees/:employeeId",
  adminController.createSalaryDetails
);
router.get(
  "/admin/companies/:companyId/departments/:deptId/employees/:employeeId",
  adminController.getIndEmployeeSalaryDetails
);

router.get(
  "/admin/companies/:companyId/departments/:deptId/fetchStoredEmpSalary/:employeeId",
  adminController.fetchStoredEmployeeSalaryDetails
);
router.delete(
  "/admin/companies/:companyId/departments/:deptId/employees/:employeeId/salaries/:salaryId",
  adminController.deleteIndEmployeeSalaryDetails
);
router.put(
  "/admin/companies/:companyId/departments/:deptId/employees/:employeeId/salaries/:salaryId",
  adminController.editIndEmployeeSalaryDetails
);
router.get(
  "/slip/admin/companies/:companyId/departments/:deptId/employees/:employeeId/salary/:salaryId",
  adminController.readSalarySlipTemplateById
);

//send mail
router.post(
  "/slip/admin/companies/:companyId/departments/:deptId/employees/:employeeId/salary/:salaryId",
  adminController.sendSalarySlipByEmail
);

//send mail-->accounts team
router.post(
  "/sendall/admin/companies/:companyId/departments/:deptId/employees",
  accountController.sendAllEmployeesSalarySlipsToAccountsTeam
);

module.exports = router;
