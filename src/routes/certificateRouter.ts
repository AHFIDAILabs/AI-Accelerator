// ============================================
// src/routes/certificateRouter.ts
// ============================================

import express from "express";
import {
  issueCertificate,
  getAllCertificates,
  getCertificateById,
  revokeCertificate,
  getStudentCertificates
} from "../controllers/certificateController";
import { protect } from "../middlewares/auth";

const certificateRouter = express.Router();

// All routes are protected
certificateRouter.use(protect);

// Admin/Instructor routes
certificateRouter.post("/issue", issueCertificate); // Issue new certificate
certificateRouter.get("/", getAllCertificates); // Get all certificates
certificateRouter.get("/:id", getCertificateById); // Get certificate by ID
certificateRouter.post("/revoke/:id", revokeCertificate); // Revoke a certificate

// Student routes
certificateRouter.get("/me", getStudentCertificates); // Get logged-in student's certificates

export default certificateRouter;
