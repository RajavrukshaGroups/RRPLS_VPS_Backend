const express = require("express");
const router = express.Router();
const bulkUploadController = require("../controller/bulkUploadController");

router.post(
  "/admin/upload-employeeRecords",
  bulkUploadController.bulkUploadEmployeeData
);
router.delete(
  "/admin/delete-uploaded-employeedata",
  bulkUploadController.deleteUploadedEmployeeData
);

module.exports = router;
