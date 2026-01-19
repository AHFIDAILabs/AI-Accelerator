// ============================================
// src/controllers/certificateController.ts
// ============================================

import { Request, Response } from "express";
import { Certificate, CertificateStatus } from "../models/Certificate";
import { User } from "../models/user";
import { Course } from "../models/Course";
import { Module } from "../models/Module";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";

// ======================================================
// ISSUE CERTIFICATE (Admin / Instructor)
// ======================================================
export const issueCertificate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { studentId, courseId, grade, finalScore, achievements, pdfUrl } = req.body;

  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // Validate student and course
  const student = await User.findById(studentId);
  if (!student || student.role !== "student") {
    res.status(404).json({ success: false, error: "Student not found" });
    return;
  }

  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  // Prevent duplicate certificates
  const existing = await Certificate.findOne({ studentId, courseId });
  if (existing) {
    res.status(400).json({ success: false, error: "Certificate already exists" });
    return;
  }

  // Calculate metadata (example)
  const modules = await Module.find({ courseId });
  const totalModules = modules.length;
  const completedProjects = 0; // could integrate with submissions
  const averageScore = finalScore || 0;
  const totalHours = modules.reduce((sum: number, m: any) => sum + (m.duration || 0), 0);
  const certificate = await Certificate.create({
    studentId,
    courseId,
    status: CertificateStatus.ISSUED,
    studentName: `${student.firstName} ${student.lastName}`,
    courseName: course.title,
    completionDate: new Date(),
    grade,
    finalScore,
    achievements,
    issuedBy: req.user._id,
    metadata: { totalModules, completedProjects, averageScore, totalHours },
    pdfUrl
  });

  res.status(201).json({ success: true, message: "Certificate issued successfully", data: certificate });
});

// ======================================================
// GET ALL CERTIFICATES (Admin)
// ======================================================
export const getAllCertificates = asyncHandler(async (_req: Request, res: Response) => {
  const certificates = await Certificate.find().populate("studentId", "firstName lastName email").populate("courseId", "title");
  res.status(200).json({ success: true, count: certificates.length, data: certificates });
});

// ======================================================
// GET CERTIFICATES FOR STUDENT
// ======================================================
export const getStudentCertificates = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const certificates = await Certificate.find({ studentId: req.user._id }).populate("courseId", "title");
  return res.status(200).json({ success: true, count: certificates.length, data: certificates });
});

// ======================================================
// GET CERTIFICATE BY ID
// ======================================================
export const getCertificateById = asyncHandler(async (req: Request, res: Response) => {
  const certificate = await Certificate.findById(req.params.id)
    .populate("studentId", "firstName lastName email")
    .populate("courseId", "title");

  if (!certificate) {
    res.status(404).json({ success: false, error: "Certificate not found" });
    return;
  }

  res.status(200).json({ success: true, data: certificate });
});

// ======================================================
// REVOKE CERTIFICATE (Admin / Instructor)
// ======================================================
export const revokeCertificate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const certificate = await Certificate.findById(req.params.id);
  if (!certificate) return res.status(404).json({ success: false, error: "Certificate not found" });

  certificate.status = CertificateStatus.REVOKED;
  await certificate.save();

  return res.status(200).json({ success: true, message: "Certificate revoked successfully", data: certificate });
});
