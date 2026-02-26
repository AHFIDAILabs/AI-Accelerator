import { Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";
import { Course, ICourse } from "../models/Course";
import { Module, IModule } from "../models/Module";
import { LiveSession, ILiveSession } from "../models/LiveSession";
import { emitToUser } from "../config/socket";
import { Notification, NotificationType } from "../models/Notification";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { NotificationTemplates } from "../utils/notificationTemplates";
import { pushNotification } from "../utils/pushNotification";


// ==============================
// CREATE LIVE SESSION
// ==============================
export const createLiveSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { courseId, moduleId, title, description, platform, meetingUrl, startTime, endTime, resources } = req.body;

  const course: ICourse | null = await Course.findById(courseId);
  if (!course) return res.status(404).json({ success: false, error: "Course not found" });

  if (!course.instructorId.equals(req.user._id)) {
    return res.status(403).json({ success: false, error: "Only course instructor can create sessions" });
  }

  if (moduleId) {
    const module: IModule | null = await Module.findById(moduleId);
    if (!module || !module.courseId.equals(courseId)) {
      return res.status(400).json({ success: false, error: "Invalid module for this course" });
    }
  }

  const session: ILiveSession = await LiveSession.create({
    courseId,
    moduleId,
    instructorId: req.user._id,
    title,
    description,
    platform,
    meetingUrl,
    startTime,
    endTime,
    resources,
    createdBy: req.user._id
  });

  // Notify ACTIVE students in the program
  const enrollments = await Enrollment.find({ programId: course.programId, status: EnrollmentStatus.ACTIVE }).select("studentId");
  const studentIds = enrollments.map(e => e.studentId.toString());

  if (studentIds.length > 0) {
    const notifications = studentIds.map(studentId => pushNotification({
      userId: studentId as any,
      ...NotificationTemplates.liveSessionScheduled(title, course.title, new Date(startTime), new Date(endTime)),
      relatedId: session._id,
      relatedModel: 'LiveSession',
      programId: course.programId
    }));

    await Promise.all(notifications);

    // Emit real-time event to students
    studentIds.forEach(studentId => {
      emitToUser(studentId, "liveSession:new", {
        sessionId: session._id,
        title,
        meetingUrl,
        startTime,
        endTime
      });
    });
  }

  // Optionally notify instructor
  emitToUser(course.instructorId.toString(), "liveSession:new", {
    sessionId: session._id,
    title,
    startTime,
    endTime
  });

  return res.status(201).json({ success: true, data: session });
});
// ==============================
// UPDATE LIVE SESSION
// ==============================
export const updateLiveSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  const session = await LiveSession.findById(id);
  if (!session) return res.status(404).json({ success: false, error: "Live session not found" });

  if (!session.instructorId.equals(req.user?._id)) {
    return res.status(403).json({ success: false, error: "Not authorized to update this session" });
  }

  Object.assign(session, updates);
  await session.save();

  emitToUser(session.instructorId.toString(), "liveSession:updated", { sessionId: session._id, updates });

  const course = await Course.findById(session.courseId);
  if (course) {
    const enrollments = await Enrollment.find({ programId: course.programId, status: EnrollmentStatus.ACTIVE }).select("studentId");
    const studentIds = enrollments.map(e => e.studentId.toString());

    if (studentIds.length > 0) {
      const notifications = studentIds.map(studentId => pushNotification({
        userId: studentId as any,
        ...NotificationTemplates.liveSessionScheduled(session.title, course.title, session.startTime, session.endTime),
        relatedId: session._id,
        relatedModel: 'LiveSession',
        programId: course.programId
      }));

      await Promise.all(notifications);

      studentIds.forEach(studentId => {
        emitToUser(studentId, "liveSession:updated", {
          sessionId: session._id,
          title: session.title,
          meetingUrl: session.meetingUrl,
          startTime: session.startTime,
          endTime: session.endTime
        });
      });
    }
  }

  return res.status(200).json({ success: true, data: session });
});

// ==============================
// DELETE LIVE SESSION
// ==============================
export const deleteLiveSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const session = await LiveSession.findById(id);
  if (!session) return res.status(404).json({ success: false, error: "Live session not found" });

  if (!session.instructorId.equals(req.user?._id)) {
    return res.status(403).json({ success: false, error: "Not authorized to delete this session" });
  }

  const course = await Course.findById(session.courseId);
  await session.deleteOne();

  emitToUser(session.instructorId.toString(), "liveSession:deleted", { sessionId: session._id });

  if (course) {
    const enrollments = await Enrollment.find({ programId: course.programId, status: EnrollmentStatus.ACTIVE }).select("studentId");
    const studentIds = enrollments.map(e => e.studentId.toString());

    if (studentIds.length > 0) {
      const notifications = studentIds.map(studentId => pushNotification({
        userId: studentId as any,
        type: NotificationType.COURSE_UPDATE,
        title: `Live Session Cancelled: ${session.title}`,
        message: `A live session in "${course.title}" has been cancelled by the instructor.`,
        relatedId: session._id,
        relatedModel: 'LiveSession',
        programId: course.programId
      }));

      await Promise.all(notifications);

      studentIds.forEach(studentId => {
        emitToUser(studentId, "liveSession:deleted", {
          sessionId: session._id,
          title: session.title
        });
      });
    }
  }

  return res.status(200).json({ success: true, message: "Live session deleted" });
});

// ==============================
// GET LIVE SESSIONS FOR COURSE
// ==============================
export const getLiveSessionsForCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { courseId } = req.params;  
  const { page = 1, limit = 20 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ success: false, error: "Invalid courseId" });
  }

  const filter = { courseId };
  const total = await LiveSession.countDocuments(filter);
  const sessions = await LiveSession.find(filter)
    .sort({ startTime: 1 })
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string));

  return res.status(200).json({
    success: true,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    count: sessions.length,
    data: sessions,
  });
});

// ==============================
// GET SINGLE LIVE SESSION
// ==============================
export const getLiveSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, error: "Invalid session ID" });

  const session = await LiveSession.findById(id);
  if (!session) return res.status(404).json({ success: false, error: "Live session not found" });

 return res.status(200).json({ success: true, data: session });
});


export const getStudentUpcomingSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' })

  const enrollments = await Enrollment.find({
    studentId: req.user._id,
    status: { $in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
  }).select('programId')

  console.log('🔍 Student ID:', req.user._id)
  console.log('🔍 Enrollments found:', enrollments.length, enrollments.map(e => e.programId))

  const programIds = enrollments.map(e => e.programId)
  const courses = await Course.find({ programId: { $in: programIds } }).select('_id')

  console.log('🔍 Courses found:', courses.length, courses.map(c => c._id))

  const courseIds = courses.map(c => c._id)

  const sessions = await LiveSession.find({
    courseId: { $in: courseIds },
    status: { $in: ['scheduled', 'live'] },
    endTime: { $gte: new Date() },
  }).populate('courseId', 'title').populate('instructorId', 'firstName lastName')

  console.log('🔍 Sessions found:', sessions.length)

  return res.status(200).json({ success: true, data: sessions, total: sessions.length })
})


export const getStudentPastSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' })

  const enrollments = await Enrollment.find({
    studentId: req.user._id,
     status: { $in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
  }).select('programId')

  const programIds = enrollments.map(e => e.programId)
  const courses = await Course.find({ programId: { $in: programIds } }).select('_id')
  const courseIds = courses.map(c => c._id)

  const sessions = await LiveSession.find({
    courseId: { $in: courseIds },
    status: 'completed',
  })
    .sort({ startTime: -1 })
    .populate('courseId', 'title')
    .populate('instructorId', 'firstName lastName')

  return res.status(200).json({ success: true, data: sessions, total: sessions.length })
})