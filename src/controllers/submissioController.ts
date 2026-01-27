// ============================================
// src/controllers/submission.controller.ts
// ============================================

import { Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";
import { Submission, SubmissionStatus } from "../models/Submission";
import { Assessment } from "../models/Assessment";
import { Course } from "../models/Course";
import { isProgramCompleted } from "../utils/programCompletion";
import { handleProgramCompletion } from "../utils/issueCertificate";
import { updateCourseProgress } from "../utils/updateCourse";
import { pushNotification } from "../utils/pushNotification";
import { NotificationTemplates } from "../utils/notificationTemplates";
import { NotificationType } from "../models/Notification";

// ============================================
// CREATE SUBMISSION (Student)
// ============================================
export const createSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { assessmentId, answers, courseId, programId } = req.body;

  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // Validate assessment exists
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment || !assessment.isPublished) {
    res.status(404).json({ success: false, error: "Assessment not found or not published" });
    return;
  }

  // Check attempt limit
  const previousAttempts = await Submission.countDocuments({
    assessmentId,
    studentId: req.user._id
  });

  if (previousAttempts >= assessment.attempts) {
    res.status(400).json({ 
      success: false, 
      error: `Maximum attempts (${assessment.attempts}) reached` 
    });
    return;
  }

  const submission = await Submission.create({
    assessmentId,
    studentId: req.user._id,
    answers,
    attemptNumber: previousAttempts + 1,
    courseId: courseId || assessment.courseId,
    programId,
    status: SubmissionStatus.SUBMITTED,
    submittedAt: new Date()
  });

  // Notify instructor/admin about new submission
  try {
    await pushNotification({
      userId: req.user._id,
      type: NotificationType.ASSESSMENT_DUE,
      title: "Submission Received",
      message: `Your submission for "${assessment.title}" has been received and is awaiting grading`,
      relatedId: submission._id,
      relatedModel: "Assessment"
    });
  } catch (error) {
    console.error("Notification error:", error);
  }

  res.status(201).json({ 
    success: true, 
    message: "Submission created successfully",
    data: submission 
  });
});

// ============================================
// GRADE SUBMISSION (Instructor/Admin)
// ============================================
export const gradeSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { submissionId } = req.params;
  const { score, feedback } = req.body;

  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const submission = await Submission.findById(submissionId)
    .populate("assessmentId", "title passingScore totalPoints")
    .populate("studentId", "firstName lastName");

  if (!submission) {
    res.status(404).json({ success: false, error: "Submission not found" });
    return;
  }

  const assessment = submission.assessmentId as any;

  // Update submission
  submission.score = score;
  submission.percentage = Math.round((score / assessment.totalPoints) * 100);
  submission.feedback = feedback;
  submission.status = SubmissionStatus.GRADED;
  submission.gradedAt = new Date();
  submission.gradedBy = req.user._id;

  await submission.save();

  // 🔹 STEP 1 — Update course progress
  if (submission.courseId) {
    await updateCourseProgress(
      submission.studentId.toString(), 
      submission.courseId.toString()
    );
  }

  // 🔹 STEP 2 — Check program completion
  const programId = submission.programId?.toString();
  if (programId) {
    const completed = await isProgramCompleted(
      submission.studentId.toString(), 
      programId
    );
    
    if (completed) {
      await handleProgramCompletion(
        submission.studentId.toString(), 
        programId
      );
    }
  }

  // 🔹 STEP 3 — Notify student
  try {
    const student = submission.studentId as any;
    const isPassing = submission.percentage >= assessment.passingScore;

    const notification = NotificationTemplates.assessmentGraded(
      assessment.title,
      submission.percentage
    );

    await pushNotification({
      userId: student._id,
      type: notification.type,
      title: isPassing ? "Assessment Graded - Passed! ✅" : "Assessment Graded",
      message: notification.message,
      relatedId: submission._id,
      relatedModel: "Assessment"
    });
  } catch (error) {
    console.error("Notification error:", error);
  }

  res.status(200).json({ 
    success: true, 
    message: "Submission graded successfully", 
    data: submission 
  });
});

// ============================================
// GET SUBMISSION BY ID
// ============================================
export const getSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const submission = await Submission.findById(req.params.id)
    .populate("assessmentId", "title type questions totalPoints passingScore")
    .populate("studentId", "firstName lastName email")
    .populate("gradedBy", "firstName lastName");

  if (!submission) {
    res.status(404).json({ success: false, error: "Submission not found" });
    return;
  }

  // Students can only view their own submissions
  if (req.user.role === "student" && 
      submission.studentId._id.toString() !== req.user._id.toString()) {
    res.status(403).json({ success: false, error: "Access denied" });
    return;
  }

  res.status(200).json({ success: true, data: submission });
});

// ============================================
// GET SUBMISSIONS BY ASSESSMENT
// ============================================
export const getSubmissionsByAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { assessmentId } = req.params;
  const { page = "1", limit = "20", status } = req.query;

  const filter: any = { assessmentId };
  if (status) filter.status = status;

  const total = await Submission.countDocuments(filter);

  const submissions = await Submission.find(filter)
    .populate("studentId", "firstName lastName email cohort")
    .populate("gradedBy", "firstName lastName")
    .sort({ submittedAt: -1 })
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string));

  res.status(200).json({ 
    success: true, 
    count: submissions.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: submissions 
  });
});

// ============================================
// GET MY SUBMISSIONS (Student)
// ============================================
export const getMySubmissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { assessmentId } = req.params;

  const submissions = await Submission.find({
    assessmentId,
    studentId: req.user._id
  })
  .populate("assessmentId", "title type totalPoints passingScore")
  .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: submissions.length,
    data: submissions
  });
});

// ============================================
// GET SUBMISSIONS BY STUDENT (Admin/Instructor)
// ============================================
export const getSubmissionsByStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { studentId } = req.params;
  const { page = "1", limit = "20", courseId } = req.query;

  const filter: any = { studentId };
  if (courseId) filter.courseId = courseId;

  const total = await Submission.countDocuments(filter);

  const submissions = await Submission.find(filter)
    .populate("assessmentId", "title type totalPoints passingScore")
    .populate("courseId", "title")
    .sort({ submittedAt: -1 })
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string));

  res.status(200).json({
    success: true,
    count: submissions.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: submissions
  });
});
