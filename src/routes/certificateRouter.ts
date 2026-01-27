// ============================================
// src/routes/certificate.routes.ts
// ============================================

import express from "express";
import {
  issueCertificate,
  getAllCertificates,
  getCertificateById,
  revokeCertificate,
  getStudentCertificates,
  getCertificatesByStudent,
  getCertificatesByCourse,
  getCertificatesByProgram,
  downloadCertificate,
  verifyCertificate,
} from "../controllers/certificateController";
import { protect } from "../middlewares/auth";
import { authorize } from "../middlewares/adminAuth";
import { UserRole } from "../models/user";

const certificateRouter = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================

// Verify certificate (anyone can verify)
certificateRouter.get("/verify/:id", verifyCertificate);

// ============================================
// STUDENT ROUTES
// ============================================

// Get my certificates
certificateRouter.get(
  "/me",
  protect,
  authorize(UserRole.STUDENT),
  getStudentCertificates
);

// Download my certificate
certificateRouter.get(
  "/:id/download",
  protect,
  downloadCertificate
);

// Get single certificate
certificateRouter.get(
  "/:id",
  protect,
  getCertificateById
);

// ============================================
// ADMIN/INSTRUCTOR ROUTES
// ============================================

// Get all certificates
certificateRouter.get(
  "/",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getAllCertificates
);

// Issue certificate
certificateRouter.post(
  "/issue",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  issueCertificate
);

// Revoke certificate
certificateRouter.post(
  "/revoke/:id",
  protect,
  authorize(UserRole.ADMIN),
  revokeCertificate
);

// Get certificates by student
certificateRouter.get(
  "/student/:studentId",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getCertificatesByStudent
);

// Get certificates by course
certificateRouter.get(
  "/course/:courseId",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getCertificatesByCourse
);

// Get certificates by program
certificateRouter.get(
  "/program/:programId",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getCertificatesByProgram
);

export default certificateRouter;