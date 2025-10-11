const express = require("express");
const router = express.Router();
const multer = require("multer");
const { storage } = require("../cloudConfig.js");
const upload = multer({ storage });
const usersController = require("../controller/userController");
const careerController = require("../controller/careerController");

router.post("/login", usersController.login);
router.post("/newCareer", upload.single("image"), careerController.newCareer);
router.get("/getCareers", careerController.getCareerDetails);
router.get("/getIndCareer/:id", careerController.getIndCareerDetails);
router.delete("/deleteCareer/:id",careerController.deleteCareer);
router.put("/edit-career/:id",upload.single("image"),careerController.updateCareer);
// router.get("/careerCount",careerController.careersSubmittedDataCount);
router.get("/bdeCareerDetails",careerController.getBdeData);
router.get("/bdeIntCareerDetails",careerController.getBdeIntData);
router.delete("/deleteSubmittedFormData/:id",careerController.deleteSubmittedFormData);
router.get("/careersSubmittedCount",careerController.careersSubmittedCount);
router.get("/getUserByDesignation",careerController.fetchUsersByDesignation);
// router.delete("/deleteusers",careerController.clearUsersCollection);

module.exports = router;
