// ============================================
// src/controllers/submission.controller.ts
// ============================================

import { Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";
import { Submission, SubmissionStatus, IAnswer } from "../models/Submission";
import { Assessment, AssessmentType, QuestionType } from "../models/Assessment";
import { Course } from "../models/Course";
import { isProgramCompleted } from "../utils/programCompletion";
import { handleProgramCompletion } from "../utils/issueCertificate";
import { updateCourseProgress } from "../utils/updateCourse";
import { pushNotification } from "../utils/pushNotification";
import { NotificationTemplates } from "../utils/notificationTemplates";
import { NotificationType } from "../models/Notification";
import { User, UserRole } from "../models/user";

// ============================================
// CREATE SUBMISSION (Student)
// ============================================
export const createSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { assessmentId, answers, courseId, programId } = req.body;

  // ── Guard: validate ID before hitting DB ──────────────────────────────
  if (!assessmentId || !mongoose.Types.ObjectId.isValid(assessmentId)) {
    res.status(400).json({ success: false, error: "Invalid assessment ID" });
    return;
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    res.status(400).json({ success: false, error: "Answers are required" });
    return;
  }

  // ── Load assessment ───────────────────────────────────────────────────
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment || !assessment.isPublished) {
    res.status(404).json({ success: false, error: "Assessment not found or not published" });
    return;
  }

  // ── Check attempt limit (exclude drafts) ──────────────────────────────
  const previousAttempts = await Submission.countDocuments({
    assessmentId,
    studentId: req.user._id,
    status: { $ne: SubmissionStatus.DRAFT }, // ✅ don't count abandoned drafts
  });

  if (previousAttempts >= assessment.attempts) {
    res.status(400).json({
      success: false,
      error: `Maximum attempts (${assessment.attempts}) reached`,
    });
    return;
  }

  // ── Auto-grade answers ────────────────────────────────────────────────
  // Auto-gradeable types: multiple_choice, true_false
  // Manual grading required for: short_answer, essay, coding
  const AUTO_GRADE_TYPES = new Set([QuestionType.MULTIPLE_CHOICE, QuestionType.TRUE_FALSE]);

  const needsManualGrading = assessment.questions.some(
    (q) => !AUTO_GRADE_TYPES.has(q.type as QuestionType)
  );

  let score = 0;

const gradedAnswers: IAnswer[] = answers.map((ans: any, i: number) => {
  const questionIndex = typeof ans.questionIndex === "number" ? ans.questionIndex : i;
  const question = assessment.questions[questionIndex];

  if (!question) {
    return { questionIndex, answer: ans.answer ?? "", isCorrect: false, pointsEarned: 0 };
  }

  if (AUTO_GRADE_TYPES.has(question.type as QuestionType) && question.correctAnswer !== undefined) {
    const studentAnswer = String(ans.answer ?? "").trim().toLowerCase();

    // correctAnswer may be stored as an index ("0","1","2","3")
    // or as the actual option text. Resolve whichever it is.
    let correctText: string;
    const rawCorrect = question.correctAnswer;

    if (
      Array.isArray(question.options) &&
      question.options.length > 0 &&
      !isNaN(Number(rawCorrect))
    ) {
      // Stored as numeric index → look up the actual option text
      const idx = Number(rawCorrect);
      correctText = String(question.options[idx] ?? rawCorrect).trim().toLowerCase();
    } else if (Array.isArray(rawCorrect)) {
      // Stored as array of correct answers
      correctText = rawCorrect.map((a: any) => String(a).trim().toLowerCase()).join("|");
    } else {
      // Already stored as the answer text
      correctText = String(rawCorrect).trim().toLowerCase();
    }

    const isCorrect = Array.isArray(rawCorrect)
      ? (rawCorrect as any[]).map((a: any) => String(a).trim().toLowerCase()).includes(studentAnswer)
      : studentAnswer === correctText;

    const pointsEarned = isCorrect ? question.points : 0;
    score += pointsEarned;

    return { questionIndex, answer: ans.answer, isCorrect, pointsEarned };
  }

  // Manual grading types (essay, short_answer, coding)
  return { questionIndex, answer: ans.answer ?? "", isCorrect: undefined, pointsEarned: 0 };
});

  const totalPoints =
    assessment.totalPoints ||
    assessment.questions.reduce((sum, q) => sum + q.points, 0);

  const percentage =
    totalPoints > 0 && !needsManualGrading
      ? Math.round((score / totalPoints) * 100)
      : 0; // percentage set after manual grading

  const finalStatus = needsManualGrading
    ? SubmissionStatus.SUBMITTED // instructor grades manually
    : SubmissionStatus.GRADED;   // auto-graded immediately

  const isLate = !!(assessment.endDate && new Date() > assessment.endDate);

  // ── Save submission 
  const submission = await Submission.create({
    assessmentId,
    studentId: req.user._id,
    answers: gradedAnswers,
    score: needsManualGrading ? 0 : score,
    percentage,
    attemptNumber: previousAttempts + 1, // ✅ always server-side
    courseId: courseId || assessment.courseId,
    programId: programId || assessment.programId,
    status: finalStatus,
    submittedAt: new Date(),
    gradedAt: needsManualGrading ? undefined : new Date(),
    isLate,
  });

  // ── Post-submission side effects ──────────────────────────────────────
  try {
    if (!needsManualGrading && submission.courseId) {
      // Auto-graded: update progress immediately
      await updateCourseProgress(
        req.user._id.toString(),
        submission.courseId.toString()
      );

      // Check program completion
      const pid = (programId || assessment.programId)?.toString();
      if (pid) {
        const completed = await isProgramCompleted(req.user._id.toString(), pid);
        if (completed) await handleProgramCompletion(req.user._id.toString(), pid);
      }
    }

    // Notify student
    await pushNotification({
      userId: req.user._id,
      type: NotificationType.ASSESSMENT_DUE,
      title: needsManualGrading ? "Submission Received" : "Assessment Graded ✅",
      message: needsManualGrading
        ? `Your submission for "${assessment.title}" is awaiting instructor review`
        : `You scored ${percentage}% on "${assessment.title}"`,
      relatedId: submission._id,
      relatedModel: "Assessment",
    });

    // Notify instructors if manual grading needed
    if (needsManualGrading) {
      const instructors = await User.find({ role: UserRole.INSTRUCTOR }).select("_id");
      await Promise.all(
        instructors.map((inst) =>
          pushNotification({
            userId: inst._id,
            type: NotificationType.ASSESSMENT_DUE,
            title: "New Submission to Grade",
            message: `${req.user!.firstName} submitted "${assessment.title}"`,
            relatedId: submission._id,
            relatedModel: "Assessment",
          })
        )
      );
    }
  } catch (error) {
    console.error("Post-submission side effects error:", error);
    // Don't fail the request — submission was saved successfully
  }

  res.status(201).json({
    success: true,
    message: needsManualGrading
      ? "Submission received — awaiting instructor review"
      : `Auto-graded: ${percentage}% (${score}/${totalPoints} points)`,
    data: submission,
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

  if (!mongoose.Types.ObjectId.isValid(submissionId)) {
    res.status(400).json({ success: false, error: "Invalid submission ID" });
    return;
  }

  const submission = await Submission.findById(submissionId)
    .populate("assessmentId", "title passingScore totalPoints")
    .populate("studentId", "firstName lastName email _id"); // ✅ include _id explicitly

  if (!submission) {
    res.status(404).json({ success: false, error: "Submission not found" });
    return;
  }

  const assessment = submission.assessmentId as any;
  const student = submission.studentId as any; // ✅ populated User doc

  const totalPoints = assessment.totalPoints || 100;
  submission.score = score;
  submission.percentage = Math.round((score / totalPoints) * 100);
  submission.feedback = feedback;
  submission.status = SubmissionStatus.GRADED;
  submission.gradedAt = new Date();
  submission.gradedBy = req.user._id;

  await submission.save();

  // ── Update course progress ────────────────────────────────────────────
  if (submission.courseId) {
    await updateCourseProgress(
      student._id.toString(),  // ✅ was: submission.studentId.toString() → "[object Object]"
      submission.courseId.toString()
    );
  }

  // ── Check program completion ──────────────────────────────────────────
  const programId = submission.programId?.toString();
  if (programId) {
    const completed = await isProgramCompleted(student._id.toString(), programId);
    if (completed) await handleProgramCompletion(student._id.toString(), programId);
  }

  // ── Notify student ────────────────────────────────────────────────────
  try {
    const isPassing = submission.percentage >= assessment.passingScore;
    const notification = NotificationTemplates.assessmentGraded(
      assessment.title,
      submission.percentage
    );

    await pushNotification({
      userId: student._id, // ✅ was: submission.studentId (populated doc, not ObjectId)
      type: notification.type,
      title: isPassing ? "Assessment Graded — Passed! ✅" : "Assessment Graded",
      message: notification.message,
      relatedId: submission._id,
      relatedModel: "Assessment",
    });
  } catch (error) {
    console.error("Notification error:", error);
  }

  res.status(200).json({
    success: true,
    message: "Submission graded successfully",
    data: submission,
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

  // ✅ Support BOTH route param and query param so either route config works:
  // GET /submissions/my?assessmentId=xxx  (query)
  // GET /submissions/:assessmentId/my     (param)
  const assessmentId = (req.params.assessmentId || req.query.assessmentId) as string;

  if (!assessmentId || !mongoose.Types.ObjectId.isValid(assessmentId)) {
    res.status(400).json({ success: false, error: "Invalid or missing assessment ID" });
    return;
  }

  const submissions = await Submission.find({
    assessmentId,
    studentId: req.user._id,
  })
    .populate("assessmentId", "title type totalPoints passingScore attempts")
    .sort({ attemptNumber: -1 }); // ✅ latest attempt first (was createdAt)

  res.status(200).json({
    success: true,
    count: submissions.length,
    data: submissions,
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

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, error: "Invalid submission ID" });
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

  const student = submission.studentId as any;
  if (req.user.role === "student" && student._id.toString() !== req.user._id.toString()) {
    res.status(403).json({ success: false, error: "Access denied" });
    return;
  }

  res.status(200).json({ success: true, data: submission });
});

// ============================================
// GET SUBMISSIONS BY ASSESSMENT (Admin/Instructor)
// ============================================
export const getSubmissionsByAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { assessmentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(assessmentId)) {
    res.status(400).json({ success: false, error: "Invalid assessment ID" });
    return;
  }

  const { page = "1", limit = "20", status } = req.query;

  const filter: any = { assessmentId };
  if (status) filter.status = status;

  const total = await Submission.countDocuments(filter);

  const submissions = await Submission.find(filter)
    .populate("studentId", "firstName lastName email")
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
    data: submissions,
  });
});

// ============================================
// GET SUBMISSIONS BY STUDENT (Admin/Instructor)
// ============================================
export const getSubmissionsByStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { studentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    res.status(400).json({ success: false, error: "Invalid student ID" });
    return;
  }

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
    data: submissions,
  });
});