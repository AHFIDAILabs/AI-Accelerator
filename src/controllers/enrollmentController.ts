import { Request, Response } from "express";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

// ======================================================
// ENROLL STUDENT IN A COURSE
// ======================================================
export const enrollStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { studentId, courseId, cohort, notes } = req.body;

  if (!studentId || !courseId) {
    return res.status(400).json({ success: false, error: "studentId and courseId are required" });
  }

  // Check if enrollment already exists
  const existing = await Enrollment.findOne({ studentId, courseId });
  if (existing) {
    return res.status(400).json({ success: false, error: "Student already enrolled in this course" });
  }

  const enrollment = await Enrollment.create({
    studentId,
    courseId,
    status: EnrollmentStatus.ACTIVE,
    cohort,
    notes
  });

  return res.status(201).json({
    success: true,
    message: "Student enrolled successfully",
    data: enrollment
  });
});

// ======================================================
// GET ALL ENROLLMENTS (ADMIN)
// ======================================================
export const getAllEnrollments = asyncHandler(async (_req: Request, res: Response) => {
  const enrollments = await Enrollment.find()
    .populate("studentId", "firstName lastName email")
    .populate("courseId", "title description");

  res.status(200).json({ success: true, count: enrollments.length, data: enrollments });
});

// ======================================================
// GET ENROLLMENTS FOR A STUDENT
// ======================================================
export const getStudentEnrollments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const enrollments = await Enrollment.find({ studentId: req.user._id })
    .populate("courseId", "title description");

   return res.status(200).json({ success: true, count: enrollments.length, data: enrollments });
});

// ======================================================
// UPDATE ENROLLMENT STATUS
// ======================================================
export const updateEnrollmentStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId } = req.params;
  const { status, completionDate, dropDate } = req.body;

  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) return res.status(404).json({ success: false, error: "Enrollment not found" });

  if (status) enrollment.status = status;
  if (completionDate) enrollment.completionDate = completionDate;
  if (dropDate) enrollment.dropDate = dropDate;

  await enrollment.save();

  return res.status(200).json({ success: true, message: "Enrollment updated", data: enrollment });
});

// ======================================================
// DELETE ENROLLMENT
// ======================================================
export const deleteEnrollment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId } = req.params;

  const enrollment = await Enrollment.findByIdAndDelete(enrollmentId);
  if (!enrollment) return res.status(404).json({ success: false, error: "Enrollment not found" });

  return res.status(200).json({ success: true, message: "Enrollment deleted successfully" });
});
