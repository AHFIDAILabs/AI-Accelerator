import { Response } from "express";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { Course } from "../models/Course";
import { User } from "../models/user";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { pushNotification, notifyCourseStudents } from "../utils/pushNotification";
import { NotificationType } from "../models/Notification";
import { getIo } from "../config/socket";

// ======================================================
// ENROLL STUDENT IN A COURSE
// ======================================================
export const enrollStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { studentId, courseId, cohort, notes } = req.body;

  if (!studentId || !courseId) {
    res.status(400).json({ success: false, error: "studentId and courseId are required" });
    return;
  }

  // Get student and course details
  const student = await User.findById(studentId);
  const course = await Course.findById(courseId);

  if (!student) {
    res.status(404).json({ success: false, error: "Student not found" });
    return;
  }

  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  // Check if enrollment already exists
  const existing = await Enrollment.findOne({ studentId, courseId });
  if (existing) {
    res.status(400).json({ success: false, error: "Student already enrolled in this course" });
    return;
  }

  const enrollment = await Enrollment.create({
    studentId,
    courseId,
    status: EnrollmentStatus.ACTIVE,
    cohort,
    notes
  });

  // Send notification to student
  await pushNotification({
    userId: student._id,
    type: NotificationType.COURSE_UPDATE,
    title: "Successfully Enrolled",
    message: `You have been enrolled in ${course.title}`,
    relatedId: course._id,
    relatedModel: "Course",
  });

  // Emit real-time notification
  const io = getIo();
  io.to(student._id.toString()).emit("notification", {
    type: NotificationType.COURSE_UPDATE,
    title: "Successfully Enrolled",
    message: `Welcome to ${course.title}!`,
    courseId: course._id,
    timestamp: new Date(),
  });

  res.status(201).json({
    success: true,
    message: "Student enrolled successfully",
    data: enrollment
  });
});

// ======================================================
// GET ALL ENROLLMENTS (ADMIN)
// ======================================================
export const getAllEnrollments = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const enrollments = await Enrollment.find()
    .populate("studentId", "firstName lastName email")
    .populate("courseId", "title description");

  res.status(200).json({ success: true, count: enrollments.length, data: enrollments });
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
    .populate("courseId", "title description");

  res.status(200).json({ success: true, count: enrollments.length, data: enrollments });
});

// ======================================================
// UPDATE ENROLLMENT STATUS
// ======================================================
export const updateEnrollmentStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId } = req.params;
  const { status, completionDate, dropDate } = req.body;

  const enrollment = await Enrollment.findById(enrollmentId)
    .populate('studentId', 'firstName lastName')
    .populate('courseId', 'title');

  if (!enrollment) {
    res.status(404).json({ success: false, error: "Enrollment not found" });
    return;
  }

  const oldStatus = enrollment.status;
  
  if (status) enrollment.status = status;
  if (completionDate) enrollment.completionDate = completionDate;
  if (dropDate) enrollment.dropDate = dropDate;

  await enrollment.save();

  // Notify student if status changed
  if (status && status !== oldStatus) {
    const student = enrollment.studentId as any;
    const course = enrollment.courseId as any;
    
    let notificationMessage = '';
    let notificationType = NotificationType.COURSE_UPDATE;

    switch (status) {
      case EnrollmentStatus.COMPLETED:
        notificationMessage = `Congratulations! You have completed ${course.title}`;
        break;
      case EnrollmentStatus.SUSPENDED:
        notificationMessage = `Your enrollment in ${course.title} has been suspended`;
        break;
      case EnrollmentStatus.DROPPED:
        notificationMessage = `Your enrollment in ${course.title} has been dropped`;
        break;
      default:
        notificationMessage = `Your enrollment status in ${course.title} has been updated to ${status}`;
    }

    await pushNotification({
      userId: student._id,
      type: notificationType,
      title: "Enrollment Status Updated",
      message: notificationMessage,
      relatedId: course._id,
      relatedModel: "Course",
    });
  }

  res.status(200).json({ success: true, message: "Enrollment updated", data: enrollment });
});

// ======================================================
// DELETE ENROLLMENT
// ======================================================
export const deleteEnrollment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId } = req.params;

  const enrollment = await Enrollment.findById(enrollmentId)
    .populate('studentId', 'firstName lastName')
    .populate('courseId', 'title');

  if (!enrollment) {
    res.status(404).json({ success: false, error: "Enrollment not found" });
    return;
  }

  const student = enrollment.studentId as any;
  const course = enrollment.courseId as any;

  await enrollment.deleteOne();

  // Notify student about enrollment removal
  await pushNotification({
    userId: student._id,
    type: NotificationType.COURSE_UPDATE,
    title: "Enrollment Removed",
    message: `Your enrollment in ${course.title} has been removed`,
    relatedId: course._id,
    relatedModel: "Course",
  });

  res.status(200).json({ success: true, message: "Enrollment deleted successfully" });
});