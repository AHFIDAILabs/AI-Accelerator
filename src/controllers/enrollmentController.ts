// ============================================
// src/controllers/enrollment.controller.ts
// ============================================

import { Response } from "express";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { Program } from "../models/program";
import { Course } from "../models/Course";
import { Module } from "../models/Module";
import { Lesson } from "../models/Lesson";
import { Progress } from "../models/ProgressTrack";
import { User } from "../models/user";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { pushNotification } from "../utils/pushNotification";
import { NotificationType } from "../models/Notification";
import { NotificationTemplates } from "../utils/notificationTemplates";
import { getIo } from "../config/socket";

// ======================================================
// ENROLL STUDENT IN A PROGRAM
// ======================================================
export const enrollStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { studentId, programId, cohort, notes } = req.body;

  if (!studentId || !programId) {
    res.status(400).json({ success: false, error: "studentId and programId are required" });
    return;
  }

  // Get student and program details
  const student = await User.findById(studentId);
  const program = await Program.findById(programId).populate('courses');

  if (!student) {
    res.status(404).json({ success: false, error: "Student not found" });
    return;
  }

  if (!program) {
    res.status(404).json({ success: false, error: "Program not found" });
    return;
  }

  if (!program.isPublished) {
    res.status(400).json({ success: false, error: "Program is not published" });
    return;
  }

  // Check enrollment limit
  if (program.enrollmentLimit) {
    const currentEnrollments = await Enrollment.countDocuments({ 
      program: programId, 
      status: { $in: [EnrollmentStatus.PENDING, EnrollmentStatus.ACTIVE] }
    });
    
    if (currentEnrollments >= program.enrollmentLimit) {
      res.status(400).json({ success: false, error: "Program enrollment limit reached" });
      return;
    }
  }

  // Check if enrollment already exists
  const existing = await Enrollment.findOne({ studentId, program: programId });
  if (existing) {
    res.status(400).json({ success: false, error: "Student already enrolled in this program" });
    return;
  }

  // Initialize courses progress for all courses in program
  const coursesProgress = await Promise.all(
    program.courses.map(async (courseId) => {
      const course = await Course.findById(courseId);
      if (!course) return null;

      // Count total lessons in course
      const modules = await Module.find({ course: courseId });
      const moduleIds = modules.map(m => m._id);
      const totalLessons = await Lesson.countDocuments({ module: { $in: moduleIds } });

      return {
        course: courseId,
        status: EnrollmentStatus.PENDING,
        lessonsCompleted: 0,
        totalLessons
      };
    })
  );

  const validCoursesProgress = coursesProgress.filter(cp => cp !== null);

  // Create enrollment
  const enrollment = await Enrollment.create({
    studentId,
    program: programId,
    status: EnrollmentStatus.ACTIVE,
    cohort: cohort || student.studentProfile?.cohort,
    notes,
    coursesProgress: validCoursesProgress
  });

  // Create program-level progress tracker
  await Progress.create({
    studentId,
    programId,
    modules: [],
    overallProgress: 0,
    completedLessons: 0,
    totalLessons: validCoursesProgress.reduce((sum, cp) => sum + cp.totalLessons, 0),
    completedAssessments: 0,
    totalAssessments: 0,
    averageScore: 0,
    totalTimeSpent: 0,
    completedCourses: 0,
    totalCourses: program.courses.length,
    enrolledAt: new Date()
  });

  // Send notification to student
  await pushNotification({
    userId: student._id,
    type: NotificationType.COURSE_UPDATE,
    title: "Successfully Enrolled in Program",
    message: `You have been enrolled in ${program.title}`,
    relatedId: program._id,
    relatedModel: "Course", // Using Course as closest model
  });

  // Emit real-time notification
  const io = getIo();
  io.to(student._id.toString()).emit("notification", {
    type: NotificationType.COURSE_UPDATE,
    title: "Successfully Enrolled",
    message: `Welcome to ${program.title}! You now have access to ${program.courses.length} courses.`,
    programId: program._id,
    timestamp: new Date(),
  });

  res.status(201).json({
    success: true,
    message: "Student enrolled in program successfully",
    data: enrollment
  });
});

// ======================================================
// SELF-ENROLL IN A PROGRAM (Student)
// ======================================================
export const selfEnrollInProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { programId } = req.params;

  const program = await Program.findById(programId).populate('courses');

  if (!program) {
    res.status(404).json({ success: false, error: "Program not found" });
    return;
  }

  if (!program.isPublished) {
    res.status(400).json({ success: false, error: "This program is not available for enrollment" });
    return;
  }

  // Check enrollment limit
  if (program.enrollmentLimit) {
    const currentEnrollments = await Enrollment.countDocuments({ 
      program: programId, 
      status: { $in: [EnrollmentStatus.PENDING, EnrollmentStatus.ACTIVE] }
    });
    
    if (currentEnrollments >= program.enrollmentLimit) {
      res.status(400).json({ success: false, error: "Program enrollment is full" });
      return;
    }
  }

  // Check if already enrolled
  const existing = await Enrollment.findOne({ studentId: req.user._id, program: programId });
  if (existing) {
    res.status(400).json({ success: false, error: "You are already enrolled in this program" });
    return;
  }

  // Initialize courses progress
  const coursesProgress = await Promise.all(
    program.courses.map(async (courseId) => {
      const course = await Course.findById(courseId);
      if (!course) return null;

      const modules = await Module.find({ course: courseId });
      const moduleIds = modules.map(m => m._id);
      const totalLessons = await Lesson.countDocuments({ module: { $in: moduleIds } });

      return {
        course: courseId,
        status: EnrollmentStatus.PENDING,
        lessonsCompleted: 0,
        totalLessons
      };
    })
  );

  const validCoursesProgress = coursesProgress.filter(cp => cp !== null);

  // Create enrollment
  const enrollment = await Enrollment.create({
    studentId: req.user._id,
    program: programId,
    status: EnrollmentStatus.ACTIVE,
    cohort: req.user.studentProfile?.cohort,
    coursesProgress: validCoursesProgress
  });

  // Create program-level progress
  await Progress.create({
    studentId: req.user._id,
    programId,
    modules: [],
    overallProgress: 0,
    completedLessons: 0,
    totalLessons: validCoursesProgress.reduce((sum, cp) => sum + cp.totalLessons, 0),
    completedAssessments: 0,
    totalAssessments: 0,
    averageScore: 0,
    totalTimeSpent: 0,
    completedCourses: 0,
    totalCourses: program.courses.length,
    enrolledAt: new Date()
  });

  // Send notification
  const notification = NotificationTemplates.courseEnrolled(program.title);
  await pushNotification({
    userId: req.user._id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    relatedId: program._id,
    relatedModel: "Course",
  });

  res.status(201).json({
    success: true,
    message: "Successfully enrolled in program",
    data: enrollment
  });
});

// ======================================================
// GET ALL ENROLLMENTS (ADMIN)
// ======================================================
export const getAllEnrollments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, programId, cohort, page = '1', limit = '20' } = req.query;

  const filter: any = {};
  if (status) filter.status = status;
  if (programId) filter.program = programId;
  if (cohort) filter.cohort = cohort;

  const total = await Enrollment.countDocuments(filter);

  const enrollments = await Enrollment.find(filter)
    .populate("studentId", "firstName lastName email cohort profileImage")
    .populate("program", "title slug estimatedHours")
    .sort({ enrollmentDate: -1 })
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string));

  res.status(200).json({ 
    success: true, 
    count: enrollments.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: enrollments 
  });
});

// ======================================================
// GET ENROLLMENTS FOR A STUDENT
// ======================================================
export const getStudentEnrollments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const enrollments = await Enrollment.find({ studentId: req.user._id })
    .populate({
      path: "program",
      select: "title description slug estimatedHours coverImage courses",
      populate: {
        path: "courses",
        select: "title description order estimatedHours"
      }
    })
    .sort({ enrollmentDate: -1 });

  // Enhance with progress data
  const enrollmentsWithProgress = await Promise.all(
    enrollments.map(async (enrollment) => {
      const progress = await Progress.findOne({
        studentId: req.user!._id,
        programId: enrollment.program._id
      });

      return {
        ...enrollment.toObject(),
        progress
      };
    })
  );

  res.status(200).json({ 
    success: true, 
    count: enrollmentsWithProgress.length, 
    data: enrollmentsWithProgress 
  });
});

// ======================================================
// GET SINGLE ENROLLMENT DETAILS
// ======================================================
export const getEnrollmentById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId } = req.params;

  const enrollment = await Enrollment.findById(enrollmentId)
    .populate("studentId", "firstName lastName email cohort profileImage")
    .populate({
      path: "program",
      populate: {
        path: "courses",
        select: "title description order estimatedHours"
      }
    });

  if (!enrollment) {
    res.status(404).json({ success: false, error: "Enrollment not found" });
    return;
  }

  // Get progress data
  const progress = await Progress.findOne({
    studentId: enrollment.studentId._id,
    programId: enrollment.program._id
  });

  res.status(200).json({ 
    success: true, 
    data: {
      enrollment,
      progress
    }
  });
});

// ======================================================
// UPDATE ENROLLMENT STATUS
// ======================================================
export const updateEnrollmentStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId } = req.params;
  const { status, completionDate, dropDate, notes } = req.body;

  const enrollment = await Enrollment.findById(enrollmentId)
    .populate('studentId', 'firstName lastName')
    .populate('program', 'title');

  if (!enrollment) {
    res.status(404).json({ success: false, error: "Enrollment not found" });
    return;
  }

  const oldStatus = enrollment.status;
  
  if (status) enrollment.status = status;
  if (completionDate) enrollment.completionDate = completionDate;
  if (dropDate) enrollment.dropDate = dropDate;
  if (notes !== undefined) enrollment.notes = notes;

  await enrollment.save();

  // Notify student if status changed
  if (status && status !== oldStatus) {
    const student = enrollment.studentId as any;
    const program = enrollment.program as any;
    
    let notificationMessage = '';
    let notificationType = NotificationType.COURSE_UPDATE;

    switch (status) {
      case EnrollmentStatus.COMPLETED:
        notificationMessage = `Congratulations! You have completed the ${program.title} program`;
        notificationType = NotificationType.CERTIFICATE_ISSUED;
        break;
      case EnrollmentStatus.SUSPENDED:
        notificationMessage = `Your enrollment in ${program.title} has been suspended`;
        break;
      case EnrollmentStatus.DROPPED:
        notificationMessage = `Your enrollment in ${program.title} has been dropped`;
        break;
      case EnrollmentStatus.ACTIVE:
        notificationMessage = `Your enrollment in ${program.title} is now active`;
        break;
      default:
        notificationMessage = `Your enrollment status in ${program.title} has been updated to ${status}`;
    }

    await pushNotification({
      userId: student._id,
      type: notificationType,
      title: "Enrollment Status Updated",
      message: notificationMessage,
      relatedId: program._id,
      relatedModel: "Course",
    });

    // Emit real-time notification
    const io = getIo();
    io.to(student._id.toString()).emit("notification", {
      type: notificationType,
      title: "Enrollment Status Updated",
      message: notificationMessage,
      programId: program._id,
      timestamp: new Date(),
    });
  }

  res.status(200).json({ success: true, message: "Enrollment updated", data: enrollment });
});

// ======================================================
// UPDATE COURSE PROGRESS WITHIN ENROLLMENT
// ======================================================
export const updateCourseProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId, courseId } = req.params;
  const { status, lessonsCompleted, completionDate } = req.body;

  const enrollment = await Enrollment.findById(enrollmentId)
    .populate('program', 'title');

  if (!enrollment) {
    res.status(404).json({ success: false, error: "Enrollment not found" });
    return;
  }

  // Find the course progress entry
  const courseProgressIndex = enrollment.coursesProgress.findIndex(
    cp => cp.course.toString() === courseId
  );

  if (courseProgressIndex === -1) {
    res.status(404).json({ success: false, error: "Course not found in enrollment" });
    return;
  }

  // Update course progress
  if (status) enrollment.coursesProgress[courseProgressIndex].status = status;
  if (lessonsCompleted !== undefined) {
    enrollment.coursesProgress[courseProgressIndex].lessonsCompleted = lessonsCompleted;
  }
  if (completionDate) {
    enrollment.coursesProgress[courseProgressIndex].completionDate = completionDate;
  }

  await enrollment.save();

  // Check if all courses are completed
  const allCoursesCompleted = enrollment.coursesProgress.every(
    cp => cp.status === EnrollmentStatus.COMPLETED
  );

  if (allCoursesCompleted && enrollment.status !== EnrollmentStatus.COMPLETED) {
    enrollment.status = EnrollmentStatus.COMPLETED;
    enrollment.completionDate = new Date();
    await enrollment.save();

    // Notify student of program completion
    const student = enrollment.studentId as any;
    const program = enrollment.program as any;

    await pushNotification({
      userId: student._id,
      type: NotificationType.CERTIFICATE_ISSUED,
      title: "Program Completed!",
      message: `Congratulations! You have completed all courses in ${program.title}`,
      relatedId: enrollment.program._id,
      relatedModel: "Course",
    });
  }

  res.status(200).json({ 
    success: true, 
    message: "Course progress updated", 
    data: enrollment 
  });
});

// ======================================================
// DELETE ENROLLMENT
// ======================================================
export const deleteEnrollment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId } = req.params;

  const enrollment = await Enrollment.findById(enrollmentId)
    .populate('studentId', 'firstName lastName')
    .populate('program', 'title');

  if (!enrollment) {
    res.status(404).json({ success: false, error: "Enrollment not found" });
    return;
  }

  const student = enrollment.studentId as any;
  const program = enrollment.program as any;

  // Delete associated progress records
  await Progress.deleteMany({
    studentId: student._id,
    programId: program._id
  });

  await enrollment.deleteOne();

  // Notify student about enrollment removal
  await pushNotification({
    userId: student._id,
    type: NotificationType.COURSE_UPDATE,
    title: "Enrollment Removed",
    message: `Your enrollment in ${program.title} has been removed`,
    relatedId: program._id,
    relatedModel: "Course",
  });

  res.status(200).json({ success: true, message: "Enrollment deleted successfully" });
});

// ======================================================
// GET ENROLLMENT STATISTICS
// ======================================================
export const getEnrollmentStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { programId } = req.query;

  const filter: any = {};
  if (programId) filter.program = programId;

  const totalEnrollments = await Enrollment.countDocuments(filter);
  const activeEnrollments = await Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.ACTIVE });
  const completedEnrollments = await Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.COMPLETED });
  const pendingEnrollments = await Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.PENDING });
  const droppedEnrollments = await Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.DROPPED });
  const suspendedEnrollments = await Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.SUSPENDED });

  const completionRate = totalEnrollments > 0 
    ? (completedEnrollments / totalEnrollments) * 100 
    : 0;

  res.status(200).json({
    success: true,
    data: {
      total: totalEnrollments,
      active: activeEnrollments,
      completed: completedEnrollments,
      pending: pendingEnrollments,
      dropped: droppedEnrollments,
      suspended: suspendedEnrollments,
      completionRate: Math.round(completionRate * 100) / 100
    }
  });
});