import { Request, Response } from "express";
import mongoose from "mongoose";
import fs from "fs/promises";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";
import { Assessment, IAssessment } from "../models/Assessment";
import { Module } from "../models/Module";
import { Lesson } from "../models/Lesson";
import { Course } from "../models/Course";
import { UserRole } from "../models/user";
import { QueryHelper } from "../utils/queryHelper";
import { getIo } from "../config/socket";
import { pushNotification } from "../utils/pushNotification";
import { User } from "../models/user";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { NotificationType } from "../models/Notification";
import { chunkArray } from "../utils/chunkArray";
import { Submission, SubmissionStatus } from "../models/Submission";


// ==============================
// CREATE ASSESSMENT
// ==============================
export const createAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const {
    courseId, moduleId, lessonId,
    title, description, type, questions,
    passingScore, duration, order
  } = req.body;

  const course = await Course.findById(courseId);
  if (!course) return res.status(404).json({ success: false, error: "Course not found" });

  if (req.user.role === UserRole.INSTRUCTOR && course.createdBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, error: "Cannot add assessment to this course" });
  }

  // Validate module belongs to course
  if (moduleId) {
    const moduleDoc = await Module.findById(moduleId);
    if (!moduleDoc || moduleDoc.courseId.toString() !== courseId) {
      return res.status(400).json({ success: false, error: "Invalid module" });
    }
  }

  // Validate lesson belongs to module (if provided)
  if (lessonId) {
    const lessonDoc = await Lesson.findById(lessonId);
    if (!lessonDoc || (moduleId && lessonDoc.moduleId.toString() !== moduleId)) {
      return res.status(400).json({ success: false, error: "Invalid lesson" });
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const assessment = await Assessment.create([{
      courseId, moduleId, lessonId,
      title, description, type, questions,
      passingScore, duration, attempts: 2, order,
      isPublished: false
    }], { session });

    // Notify admins
    const admins = await User.find({ role: UserRole.ADMIN });
    const io = getIo();

    const notifications = admins.map(admin => ({
      userId: admin._id,
      type: NotificationType.COURSE_UPDATE,
      title: "New Assessment Created",
      message: `${req.user?.firstName} ${req.user?.lastName} created "${title}" for course "${course.title}"`,
      relatedId: assessment[0]._id,
      relatedModel: "Assessment" as const
    }));

    for (const batch of chunkArray(notifications, 100)) {
      await Promise.all(batch.map(n => pushNotification(n)));
      batch.forEach(n => io.to(n.userId.toString()).emit("notification", n));
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Assessment created successfully (pending publication)",
      data: assessment[0]
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});


// ==============================
// GET ALL ASSESSMENTS (ADMIN)
// ==============================
export const getAllAssessmentsAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  let query = Assessment.find().populate("courseId moduleId lessonId", "title");
  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;
  const assessments = await query;
  res.status(200).json({ success: true, count: assessments.length, data: assessments });
});

// ==============================
// GET PUBLISHED ASSESSMENTS (STUDENT)
// ==============================
export const getPublishedAssessments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: any = { isPublished: true };

  if (req.user?.role === UserRole.STUDENT) {
    const enrollments = await Enrollment.find({ studentId: req.user._id }).select("coursesProgress");
    const courseIds = enrollments.flatMap(e => e.coursesProgress.map(p => p.courseId));
    filter.courseId = { $in: courseIds };
  }

  let query = Assessment.find(filter).populate("courseId moduleId lessonId", "title");
  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;
  const assessments = await query;

  // ✅ Attach latestSubmission for each assessment (students only)
  if (req.user?.role === UserRole.STUDENT) {
    const assessmentIds = assessments.map(a => a._id);

    const submissions = await Submission.find({
      assessmentId: { $in: assessmentIds },
      studentId: req.user._id,
      status: { $ne: SubmissionStatus.DRAFT },
    })
      .sort({ attemptNumber: -1 })
      .select("assessmentId status score percentage attemptNumber submittedAt gradedAt feedback");

    // Build map: assessmentId → latest submission (already sorted desc, first wins)
    const submissionMap = new Map<string, any>();
    for (const sub of submissions) {
      const key = sub.assessmentId.toString();
      if (!submissionMap.has(key)) submissionMap.set(key, sub);
    }

    const data = assessments.map(a => ({
      ...a.toObject(),
      latestSubmission: submissionMap.get(a._id.toString()) ?? null,
    }));

    return res.status(200).json({ success: true, count: data.length, data });
  }

  return res.status(200).json({ success: true, count: assessments.length, data: assessments });
});

// ==============================
// GET SINGLE ASSESSMENT
// ==============================
export const getAssessmentById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await Assessment.findById(req.params.id)
    .populate("courseId moduleId lessonId", "title");
  if (!assessment) {
    return res.status(404).json({ success: false, error: "Assessment not found" });
  }

  // If not published, only admin/instructor can view
  if (!assessment.isPublished && ![UserRole.ADMIN, UserRole.INSTRUCTOR].includes(req.user?.role as UserRole)) {
    return res.status(404).json({ success: false, error: "Assessment not found" });
  }

  // Students must be enrolled in the course's program and course
  if (req.user?.role === UserRole.STUDENT) {
    const course = await Course.findById(assessment.courseId).select("programId");
    if (!course) return res.status(404).json({ success: false, error: "Course not found" });

    const enrollment = await Enrollment.findOne({
      studentId: req.user._id,
      programId: course.programId,
      "coursesProgress.courseId": assessment.courseId
    });

    if (!enrollment) return res.status(403).json({ success: false, error: "Access denied" });
  }

  return res.status(200).json({ success: true, data: assessment });
});

// ==============================
// UPDATE ASSESSMENT
// ==============================
export const updateAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) return res.status(404).json({ success: false, error: "Assessment not found" });

  const course = await Course.findById(assessment.courseId);
  if (!course) return res.status(404).json({ success: false, error: "Course not found" });

  if (req.user.role === UserRole.INSTRUCTOR && course.createdBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, error: "Cannot update this assessment" });
  }

  // Whitelist updates
  const allowedUpdates: Partial<IAssessment> = {
    title: req.body.title,
    description: req.body.description,
    questions: req.body.questions,
    passingScore: req.body.passingScore,
    duration: req.body.duration,
    order: req.body.order,
    endDate: req.body.endDate
  };
  Object.entries(allowedUpdates).forEach(([key, value]) => { if (value !== undefined) (assessment as any)[key] = value; });

  // Instructors: revert to unpublished on update
  if (req.user.role === UserRole.INSTRUCTOR) assessment.isPublished = false;

  await assessment.save();
  return res.json({ success: true, message: "Assessment updated successfully", data: assessment });
});


// ==============================
// DELETE ASSESSMENT
// ==============================
export const deleteAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) return res.status(404).json({ success: false, error: "Assessment not found" });

  const course = await Course.findById(assessment.courseId);
  if (req.user?.role === UserRole.INSTRUCTOR && course?.createdBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, error: "Access denied" });
  }

  await assessment.deleteOne();
  return res.status(200).json({ success: true, message: "Assessment deleted successfully" });
});


// ==============================
// PUBLISH / UNPUBLISH ASSESSMENT
// ==============================
export const toggleAssessmentPublish = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log('=== TOGGLE PUBLISH DEBUG ===');
  console.log('Assessment ID:', req.params.id);
  console.log('User:', req.user);

  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) {
    return res.status(404).json({ success: false, error: "Assessment not found" });
  }

  console.log('Assessment found:', {
    _id: assessment._id,
    title: assessment.title,
    courseId: assessment.courseId,
    courseIdType: typeof assessment.courseId
  });

  // Extract course ID (ObjectId or populated)
  const courseId = typeof assessment.courseId === 'object'
    ? (assessment.courseId as any)._id
    : assessment.courseId;

  console.log('Extracted courseId:', courseId);

  const course = await Course.findById(courseId);
  if (!course) {
    console.log('Course not found with ID:', courseId);
    return res.status(404).json({ success: false, error: "Course not found" });
  }

  console.log('Course found:', {
    _id: course._id,
    title: course.title,
    createdBy: course.createdBy,
    createdByType: typeof course.createdBy
  });

  // Permission check - only for instructors
  if (req.user?.role === UserRole.INSTRUCTOR) {
    const userIdStr = req.user._id.toString();
    const creatorIdStr = course.createdBy.toString();

    console.log('PERMISSION CHECK:', {
      userRole: req.user.role,
      userId: userIdStr,
      courseCreator: creatorIdStr,
      match: creatorIdStr === userIdStr,
      comparison: `"${userIdStr}" === "${creatorIdStr}"`
    });

    if (creatorIdStr !== userIdStr) {
      console.log('❌ PERMISSION DENIED');
      return res.status(403).json({
        success: false,
        error: "You can only publish/unpublish assessments for courses you created"
      });
    }

    console.log('✅ PERMISSION GRANTED');
  }

  // Toggle publish status
  assessment.isPublished = !assessment.isPublished;
  await assessment.save();

  // Populate for response
  await assessment.populate('courseId moduleId lessonId', 'title');

  console.log('=== PUBLISH SUCCESSFUL ===');
  return res.status(200).json({
    success: true,
    message: `Assessment ${assessment.isPublished ? "published" : "unpublished"} successfully`,
    data: assessment
  });
});

// ==============================
// REORDER ASSESSMENTS
// ==============================
export const reorderAssessments = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { orders } = req.body; // [{ assessmentId, order }]

    if (!orders || !Array.isArray(orders)) {
      res.status(400).json({
        success: false,
        error: "Please provide valid orders array",
      });
      return;
    }

    const bulkOps = orders.map((item: any) => ({
      updateOne: {
        filter: { _id: item.assessmentId },
        update: { order: item.order },
      },
    }));

    await Assessment.bulkWrite(bulkOps);

    res.status(200).json({
      success: true,
      message: "Assessments reordered successfully",
    });
  }
);

// ==============================
// GET ASSESSMENTS BY COURSE
// ==============================
export const getAssessmentsByCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { courseId } = req.params;
  const course = await Course.findById(courseId).select("programId");
  if (!course) return res.status(404).json({ success: false, error: "Course not found" });

  const filter: any = { courseId };

  if (req.user?.role === UserRole.STUDENT) {
    const enrollment = await Enrollment.findOne({
      studentId: req.user._id,
      programId: course.programId,
      "coursesProgress.courseId": courseId
    });

    if (!enrollment) return res.status(403).json({ success: false, error: "Access denied" });
    filter.isPublished = true;
  }

  const assessments = await Assessment.find(filter)
    .populate("moduleId lessonId", "title")
    .sort({ order: 1 });

  return res.status(200).json({ success: true, count: assessments.length, data: assessments });
});


// ==============================
// GET ASSESSMENTS BY MODULE
// ==============================
export const getAssessmentsByModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { moduleId } = req.params;
  const moduleDoc = await Module.findById(moduleId);
  if (!moduleDoc) return res.status(404).json({ success: false, error: "Module not found" });

  const filter: any = { moduleId };

  if (req.user?.role === UserRole.STUDENT) {
    // Need the course & program to verify enrollment
    const course = await Course.findById(moduleDoc.courseId).select("programId");
    if (!course) return res.status(404).json({ success: false, error: "Course not found" });

    const enrollment = await Enrollment.findOne({
      studentId: req.user._id,
      programId: course.programId,
      "coursesProgress.courseId": moduleDoc.courseId
    });

    if (!enrollment) return res.status(403).json({ success: false, error: "Access denied" });
    filter.isPublished = true;
  }

  const assessments = await Assessment.find(filter)
    .populate("lessonId", "title")
    .sort({ order: 1 });

  return res.status(200).json({ success: true, count: assessments.length, data: assessments });
});

// ==============================
// SEND ASSESSMENT DUE REMINDER
// ==============================
export const sendAssessmentReminder = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { assessmentId } = req.params;

    const assessment = await Assessment.findById(assessmentId).populate('courseId', 'title programId');
    if (!assessment) {
      res.status(404).json({ success: false, error: "Assessment not found" });
      return;
    }

    if (!assessment.isPublished) {
      res.status(400).json({
        success: false,
        error: "Cannot send reminder for unpublished assessment",
      });
      return;
    }

    // Get all enrolled students in the course (active)
    const enrollments = await Enrollment.find({
      programId: (assessment.courseId as any).programId ?? undefined,
      'coursesProgress.courseId': assessment.courseId,
      status: EnrollmentStatus.ACTIVE
    }).populate("studentId");

    const io = getIo();
    const course = assessment.courseId as any;
    let remindersSent = 0;

    for (const enrollment of enrollments) {
      const student = (enrollment as any).studentId;
      if (!student?._id) continue;

      await pushNotification({
        userId: student._id,
        type: NotificationType.REMINDER,
        title: "Assessment Reminder",
        message: `Don't forget to complete "${assessment.title}" in ${course.title}`,
        relatedId: assessment._id,
        relatedModel: "Assessment",
      });

      io.to(student._id.toString()).emit("notification", {
        type: NotificationType.REMINDER,
        title: "Assessment Reminder",
        message: `Complete "${assessment.title}" soon`,
        assessmentId: assessment._id,
        courseId: assessment.courseId,
        dueDate: assessment.endDate,
        timestamp: new Date(),
      });

      remindersSent++;
    }

    res.status(200).json({
      success: true,
      message: `Reminder sent to ${remindersSent} students`,
      count: remindersSent,
    });
  }
);