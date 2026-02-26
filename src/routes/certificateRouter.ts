// src/routes/certificate.routes.ts

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
  uploadCertificateHtml,
} from "../controllers/certificateController";
import { protect } from "../middlewares/auth";
import { authorize } from "../middlewares/adminAuth";
import { UserRole } from "../models/user";

const certificateRouter = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================
certificateRouter.get("/:id/verify", verifyCertificate);

// ============================================
// ADMIN/INSTRUCTOR ROUTES  (specific paths first)
// ============================================
certificateRouter.get(
  "/",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getAllCertificates
);

certificateRouter.post(
  "/issue",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  issueCertificate
);

certificateRouter.post(
  "/upload-html",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  uploadCertificateHtml
);

certificateRouter.post(
  "/revoke/:id",
  protect,
  authorize(UserRole.ADMIN),
  revokeCertificate
);

certificateRouter.get(
  "/student/:studentId",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getCertificatesByStudent
);

certificateRouter.get(
  "/course/:courseId",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getCertificatesByCourse
);

certificateRouter.get(
  "/program/:programId",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getCertificatesByProgram
);

// ============================================
// STUDENT ROUTES
// ============================================
certificateRouter.get(
  "/me",
  protect,
  authorize(UserRole.STUDENT),
  getStudentCertificates
);

// ============================================
// WILDCARD ROUTES LAST  ← /:id must always be last
// ============================================
certificateRouter.get(
  "/:id/download",
  protect,
  downloadCertificate
);

certificateRouter.get(
  "/:id",
  protect,
  getCertificateById
);

export default certificateRouter;