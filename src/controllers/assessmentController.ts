import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";
import { Assessment, IAssessment, IQuestion } from "../models/Assessment";
import { Module } from "../models/Module";
import { Lesson } from "../models/Lesson";
import { Course } from "../models/Course";
import { UserRole } from "../models/user";
import { QueryHelper } from "../utils/queryHelper";
import { getIo } from "../config/socket";
import { pushNotification} from "../utils/pushNotification";
import { User } from "../models/user";
import { Enrollment } from "../models/Enrollment";
import { NotificationType } from "../models/Notification";


// ==============================
// CREATE ASSESSMENT
// ==============================
export const createAssessment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      courseId,
      moduleId,
      lessonId,
      title,
      description,
      type,
      questions,
      passingScore,
      duration,
      order,
    } = req.body;

    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    // Validate course
    const course = await Course.findById(courseId);
    if (!course) {
      res.status(404).json({ success: false, error: "Course not found" });
      return;
    }

    // Instructor can only add to their course
    if (
      req.user.role === UserRole.INSTRUCTOR &&
      course.createdBy.toString() !== req.user._id.toString()
    ) {
      res.status(403).json({
        success: false,
        error: "Cannot add assessment to this course",
      });
      return;
    }

    // Validate module belongs to course
    if (moduleId) {
      const module = await Module.findById(moduleId);
      if (!module || module.course._id.toString() !== courseId) {
        res.status(400).json({ success: false, error: "Invalid module" });
        return;
      }
    }

    // Validate lesson belongs to module
    if (lessonId) {
      const lesson = await Lesson.findById(lessonId);
      if (!lesson || (moduleId && lesson.module._id.toString() !== moduleId)) {
        res.status(400).json({ success: false, error: "Invalid lesson" });
        return;
      }
    }

    const assessment = await Assessment.create({
      courseId,
      moduleId,
      lessonId,
      title,
      description,
      type,
      questions,
      passingScore,
      duration,
      attempts: 2,
      order,
      isPublished: false,
    });

    // Notify admin about new assessment (for approval)
    const admins = await User.find({ role: UserRole.ADMIN });
    const io = getIo();

    for (const admin of admins) {
      // Create notification
      await pushNotification({
        userId: admin._id,
        type: NotificationType.COURSE_UPDATE,
        title: "New Assessment Created",
        message: `${req.user.firstName} ${req.user.lastName} created a new assessment: "${title}" for course "${course.title}"`,
        relatedId: assessment._id,
        relatedModel: "Assessment",
      });

      // Emit real-time notification
      io.to(admin._id.toString()).emit("notification", {
        type: NotificationType.COURSE_UPDATE,
        title: "New Assessment Created",
        message: `New assessment "${title}" requires review`,
        assessmentId: assessment._id,
        courseId: course._id,
        timestamp: new Date(),
      });
    }

    res.status(201).json({
      success: true,
      message: "Assessment created successfully (pending publication)",
      data: assessment,
    });
  }
);

// ==============================
// GET ALL ASSESSMENTS (ADMIN)
// ==============================
export const getAllAssessmentsAdmin = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    let query = Assessment.find().populate(
      "courseId moduleId lessonId",
      "title"
    );

    const queryHelper = new QueryHelper(query, req.query);
    query = queryHelper
      .filter()
      .search(["title", "description"])
      .sort()
      .paginate().query;

    const assessments = await query;

    res.status(200).json({
      success: true,
      count: assessments.length,
      data: assessments,
    });
  }
);

// ==============================
// GET PUBLISHED ASSESSMENTS (STUDENT)
// ==============================
export const getPublishedAssessments = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    let query = Assessment.find({ isPublished: true }).populate(
      "courseId moduleId lessonId",
      "title"
    );

    const queryHelper = new QueryHelper(query, req.query);
    query = queryHelper
      .filter()
      .search(["title", "description"])
      .sort()
      .paginate().query;

    const assessments = await query;

    res.status(200).json({
      success: true,
      count: assessments.length,
      data: assessments,
    });
  }
);

// ==============================
// GET SINGLE ASSESSMENT
// ==============================
export const getAssessmentById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const assessment = await Assessment.findById(req.params.id).populate(
      "courseId moduleId lessonId",
      "title"
    );

    if (
      !assessment ||
      (!assessment.isPublished &&
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.INSTRUCTOR)
    ) {
      res.status(404).json({ success: false, error: "Assessment not found" });
      return;
    }

    res.status(200).json({ success: true, data: assessment });
  }
);

// ==============================
// UPDATE ASSESSMENT
// ==============================
export const updateAssessment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const assessment = await Assessment.findById(req.params.id);
    if (!assessment) {
      res.status(404).json({ success: false, error: "Assessment not found" });
      return;
    }

    const course = await Course.findById(assessment.courseId);
    if (!course) {
      res.status(404).json({ success: false, error: "Course not found" });
      return;
    }

    // Instructors can only update their own course assessments
    if (req.user.role === UserRole.INSTRUCTOR) {
      if (course.createdBy.toString() !== req.user._id.toString()) {
        res.status(403).json({
          success: false,
          error: "Cannot update this assessment",
        });
        return;
      }
      // Updating reverts assessment to unpublished
      assessment.isPublished = false;
    }

    // Update assessment
    Object.assign(assessment, req.body);
    await assessment.save();

    // Notify enrolled students if assessment was published
    if (assessment.isPublished) {
      const enrollments = await Enrollment.find({
        courseId: assessment.courseId,
        status: "active",
      }).populate("studentId");

      const io = getIo();

      for (const enrollment of enrollments) {
        if (enrollment.studentId) {
          const student = enrollment.studentId as any;

          // Create notification
          await pushNotification({
            userId: student._id,
            type: NotificationType.COURSE_UPDATE,
            title: "Assessment Updated",
            message: `The assessment "${assessment.title}" has been updated`,
            relatedId: assessment._id,
            relatedModel: "Assessment",
          });

          // Emit real-time notification
          io.to(student._id.toString()).emit("notification", {
            type: NotificationType.COURSE_UPDATE,
            title: "Assessment Updated",
            message: `"${assessment.title}" has been updated`,
            assessmentId: assessment._id,
            courseId: course._id,
            timestamp: new Date(),
          });
        }
      }
    }

    res.json({
      success: true,
      message: "Assessment updated successfully",
      data: assessment,
    });
  }
);

// ==============================
// DELETE ASSESSMENT
// ==============================
export const deleteAssessment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const assessment = await Assessment.findById(req.params.id);
    
    if (!assessment) {
      res.status(404).json({ success: false, error: "Assessment not found" });
      return;
    }

    // Notify enrolled students if assessment was published
    if (assessment.isPublished) {
      const enrollments = await Enrollment.find({
        courseId: assessment.courseId,
        status: "active",
      }).populate("studentId");

      const io = getIo();

      for (const enrollment of enrollments) {
        if (enrollment.studentId) {
          const student = enrollment.studentId as any;

          // Create notification
          await pushNotification({
            userId: student._id,
            type: NotificationType.COURSE_UPDATE,
            title: "Assessment Removed",
            message: `The assessment "${assessment.title}" has been removed from the course`,
            relatedId: assessment.courseId,
            relatedModel: "Course",
          });

          // Emit real-time notification
          io.to(student._id.toString()).emit("notification", {
            type: NotificationType.COURSE_UPDATE,
            title: "Assessment Removed",
            message: `"${assessment.title}" has been removed`,
            courseId: assessment.courseId,
            timestamp: new Date(),
          });
        }
      }
    }

    await assessment.deleteOne();

    res.status(200).json({
      success: true,
      message: "Assessment deleted successfully",
    });
  }
);

// ==============================
// PUBLISH / UNPUBLISH ASSESSMENT
// ==============================
export const toggleAssessmentPublish = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const assessment = await Assessment.findById(req.params.id).populate('courseId', 'title');
    
    if (!assessment) {
      res.status(404).json({ success: false, error: "Assessment not found" });
      return;
    }

    const wasPublished = assessment.isPublished;
    assessment.isPublished = !assessment.isPublished;
    await assessment.save();

    // Notify enrolled students when assessment is published
    if (assessment.isPublished && !wasPublished) {
      const enrollments = await Enrollment.find({
        courseId: assessment.courseId,
        status: "active",
      }).populate("studentId");

      const io = getIo();
      const course = assessment.courseId as any;

      for (const enrollment of enrollments) {
        if (enrollment.studentId) {
          const student = enrollment.studentId as any;

          // Create notification
          await pushNotification({
            userId: student._id,
            type: NotificationType.ASSESSMENT_DUE,
            title: "New Assessment Available",
            message: `A new assessment "${assessment.title}" is now available in ${course.title}`,
            relatedId: assessment._id,
            relatedModel: "Assessment",
          });

          // Emit real-time notification
          io.to(student._id.toString()).emit("notification", {
            type: NotificationType.ASSESSMENT_DUE,
            title: "New Assessment Available",
            message: `"${assessment.title}" is now available`,
            assessmentId: assessment._id,
            courseId: assessment.courseId,
            dueDate: assessment.endDate,
            timestamp: new Date(),
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Assessment ${assessment.isPublished ? "published" : "unpublished"} successfully`,
      data: assessment,
    });
  }
);

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
export const getAssessmentsByCourse = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { courseId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) {
      res.status(404).json({ success: false, error: "Course not found" });
      return;
    }

    // Students only see published assessments
    const filter: any = { courseId };
    if (req.user?.role === UserRole.STUDENT) {
      filter.isPublished = true;
    }

    const assessments = await Assessment.find(filter)
      .populate("moduleId lessonId", "title")
      .sort({ order: 1 });

    res.status(200).json({
      success: true,
      count: assessments.length,
      data: assessments,
    });
  }
);

// ==============================
// GET ASSESSMENTS BY MODULE
// ==============================
export const getAssessmentsByModule = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { moduleId } = req.params;

    const module = await Module.findById(moduleId);
    if (!module) {
      res.status(404).json({ success: false, error: "Module not found" });
      return;
    }

    // Students only see published assessments
    const filter: any = { moduleId };
    if (req.user?.role === UserRole.STUDENT) {
      filter.isPublished = true;
    }

    const assessments = await Assessment.find(filter)
      .populate("lessonId", "title")
      .sort({ order: 1 });

    res.status(200).json({
      success: true,
      count: assessments.length,
      data: assessments,
    });
  }
);

// ==============================
// SEND ASSESSMENT DUE REMINDER
// ==============================
export const sendAssessmentReminder = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { assessmentId } = req.params;

    const assessment = await Assessment.findById(assessmentId).populate('courseId', 'title');
    
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

    // Get all enrolled students who haven't submitted
    const enrollments = await Enrollment.find({
      courseId: assessment.courseId,
      status: "active",
    }).populate("studentId");

    const io = getIo();
    const course = assessment.courseId as any;
    let remindersSent = 0;

    for (const enrollment of enrollments) {
      if (enrollment.studentId) {
        const student = enrollment.studentId as any;

        // Create notification
        await pushNotification({
          userId: student._id,
          type: NotificationType.REMINDER,
          title: "Assessment Reminder",
          message: `Don't forget to complete "${assessment.title}" in ${course.title}`,
          relatedId: assessment._id,
          relatedModel: "Assessment",
        });

        // Emit real-time notification
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
    }

    res.status(200).json({
      success: true,
      message: `Reminder sent to ${remindersSent} students`,
      count: remindersSent,
    });
  }
);