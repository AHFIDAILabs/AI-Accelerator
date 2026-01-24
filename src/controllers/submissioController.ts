import { Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";
import { Submission, SubmissionStatus } from "../models/Submission";
import { Course } from "../models/Course";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { isProgramCompleted } from "../utils/programCompletion";
import { handleProgramCompletion } from "../utils/issueCertificate";
import { updateCourseProgress } from "../utils/updateCourse";


// ============================================
// GRADE SUBMISSION (Instructor/Admin)
// ============================================
export const gradeSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { submissionId } = req.params;
  const { score, feedback } = req.body;

  const submission = await Submission.findById(submissionId);
  if (!submission) return res.status(404).json({ success: false, error: "Submission not found" });

  submission.score = score;
  submission.percentage = score;
  submission.feedback = feedback;
  submission.status = SubmissionStatus.GRADED;
  submission.gradedAt = new Date();
  submission.gradedBy = req.user?._id;

  await submission.save();

  // 🔹 STEP 1 — Update course progress
  updateCourseProgress(submission.studentId.toString(), submission.courseId?.toString());

  // 🔹 STEP 2 — Check program completion
  const programId = submission.programId?.toString();
  if (programId) {
    const completed = await isProgramCompleted(submission.studentId.toString(), programId);
    if (completed) {
      await handleProgramCompletion(submission.studentId.toString(), programId);
    }
  }

  return res.status(200).json({ success: true, message: "Submission graded", data: submission });
});


export const createSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { assessmentId, answers, attemptNumber, courseId, programId } = req.body;

  const submission = await Submission.create({
    assessmentId,
    studentId: req.user!._id,
    answers,
    attemptNumber,
    courseId,
    programId,
    status: SubmissionStatus.SUBMITTED,
    submittedAt: new Date()
  });

  res.status(201).json({ success: true, data: submission });
});


export const getSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const submission = await Submission.findById(req.params.id);
  if (!submission) return res.status(404).json({ success: false, error: "Submission not found" });
   return res.status(200).json({ success: true, data: submission });
});

export const getSubmissionsByAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const submissions = await Submission.find({ assessmentId: req.params.assessmentId });
  res.status(200).json({ success: true, data: submissions });
});