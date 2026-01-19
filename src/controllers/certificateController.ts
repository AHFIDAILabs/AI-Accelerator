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
import { getIo } from "../config/socket";
import { NotificationType } from "../models/Notification";
import { pushNotification } from "../utils/pushNotification";


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

  // Calculate metadata
  const modules = await Module.find({ courseId });
  const totalModules = modules.length;
  const completedProjects = 0; // Integrate with submissions
  const averageScore = finalScore || 0;
  const totalHours = course.duration.totalHours || 0;

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

  // Send notification to student
  await pushNotification({
    userId: student._id,
    type: NotificationType.CERTIFICATE_ISSUED,
    title: "Certificate Issued",
    message: `Congratulations! Your certificate for ${course.title} is ready`,
    relatedId: certificate._id,
    relatedModel: "Certificate",
  });

  // Emit real-time notification
  const io = getIo();
  io.to(student._id.toString()).emit("notification", {
    type: NotificationType.CERTIFICATE_ISSUED,
    title: "Certificate Issued",
    message: `Your certificate for ${course.title} is ready to download`,
    certificateId: certificate._id,
    courseId: course._id,
    downloadUrl: pdfUrl,
    timestamp: new Date(),
  });

  res.status(201).json({
    success: true,
    message: "Certificate issued successfully",
    data: certificate
  });
});

export const revokeCertificate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const certificate = await Certificate.findById(req.params.id)
    .populate('studentId', 'firstName lastName')
    .populate('courseId', 'title');

  if (!certificate) {
    res.status(404).json({ success: false, error: "Certificate not found" });
    return;
  }

  const oldStatus = certificate.status;
  certificate.status = CertificateStatus.REVOKED;
  await certificate.save();

  // Notify student about revocation
  if (oldStatus !== CertificateStatus.REVOKED) {
    const student = certificate.studentId as any;
    const course = certificate.courseId as any;

    await pushNotification({
      userId: student._id,
      type: NotificationType.ANNOUNCEMENT,
      title: "Certificate Revoked",
      message: `Your certificate for ${course.title} has been revoked`,
      relatedId: certificate._id,
      relatedModel: "Certificate",
    });
  }

  res.status(200).json({
    success: true,
    message: "Certificate revoked successfully",
    data: certificate
  });
});

// ============================================
// Additional helper exports
// ============================================

export const getAllCertificates = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const certificates = await Certificate.find()
    .populate("studentId", "firstName lastName email")
    .populate("courseId", "title");
  
  res.status(200).json({ success: true, count: certificates.length, data: certificates });
});

export const getStudentCertificates = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const certificates = await Certificate.find({ studentId: req.user._id })
    .populate("courseId", "title");
  
  res.status(200).json({ success: true, count: certificates.length, data: certificates });
});

export const getCertificateById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const certificate = await Certificate.findById(req.params.id)
    .populate("studentId", "firstName lastName email")
    .populate("courseId", "title");

  if (!certificate) {
    res.status(404).json({ success: false, error: "Certificate not found" });
    return;
  }

  res.status(200).json({ success: true, data: certificate });
});