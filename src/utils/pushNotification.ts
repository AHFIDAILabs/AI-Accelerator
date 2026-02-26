// ============================================
// src/utils/pushNotification.ts
// ============================================

import { Notification, INotification, NotificationType } from "../models/Notification";
import mongoose from "mongoose";
import { emitToUser } from "../config/socket";
import { Enrollment } from "../models/Enrollment";
import { LiveSession } from "../models/LiveSession";
import { NotificationTemplates } from "../utils/notificationTemplates";


export interface PushNotificationInput {
  userId: mongoose.Types.ObjectId;
  programId?: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: mongoose.Types.ObjectId;
  relatedModel?: 'Course' | 'Module' | 'Lesson' | 'Assessment' | 'Certificate' | 'Program' | 'Submission' | 'Enrollment' | 'LiveSession';
}

/**
 * Create and save a notification to database
 * Also emits real-time notification via Socket.IO
 */
export const pushNotification = async (
  data: PushNotificationInput
): Promise<INotification> => {
  try {
    // Create notification in database
    const notification = await Notification.create({
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedId: data.relatedId,
      relatedModel: data.relatedModel,
      isRead: false,
    });

    // Emit real-time notification via Socket.IO
    try {
      emitToUser(data.userId.toString(), "notification", {
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedId: notification.relatedId,
        relatedModel: notification.relatedModel,
        isRead: false,
        createdAt: notification.createdAt,
      });
    } catch (socketError) {
      // Don't fail notification creation if socket emit fails
      console.error("Socket emit error:", socketError);
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

/**
 * Create and send multiple notifications
 */
export const pushBulkNotifications = async (
  notifications: PushNotificationInput[]
): Promise<INotification[]> => {
  try {
    const createdNotifications = await Notification.insertMany(
      notifications.map(notif => ({
        userId: notif.userId,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        relatedId: notif.relatedId,
        relatedModel: notif.relatedModel,
        isRead: false,
      }))
    );

    // Emit real-time notifications
    try {
      createdNotifications.forEach((notification) => {
        emitToUser(notification.userId.toString(), "notification", {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          relatedId: notification.relatedId,
          relatedModel: notification.relatedModel,
          isRead: false,
          createdAt: notification.createdAt,
        });
      });
    } catch (socketError) {
      console.error("Socket emit error for bulk notifications:", socketError);
    }

    return createdNotifications;
  } catch (error) {
    console.error("Error creating bulk notifications:", error);
    throw error;
  }
};

/**
 * Send notification to all users with specific role
 */
export const notifyUsersByRole = async (
  role: string,
  notification: Omit<PushNotificationInput, 'userId'>
): Promise<number> => {
  const { User } = await import("../models/user");
  
  const users = await User.find({ role, status: 'active' });
  
  const notifications = users.map(user => ({
    ...notification,
    userId: user._id,
  }));

  await pushBulkNotifications(notifications);
  
  return users.length;
};

/**
 * Send notification to all enrolled students in a program
 */
export const notifyProgramStudents = async (
  programId: mongoose.Types.ObjectId,
  notification: Omit<PushNotificationInput, 'userId'>
): Promise<number> => {
  
  const enrollments = await Enrollment.find({
    program: programId,
    status: { $in: ['active', 'pending'] },
  }).populate('studentId');

  const notifications = enrollments
    .filter(e => e.studentId)
    .map(enrollment => ({
      ...notification,
      userId: (enrollment.studentId as any)._id,
    }));

  await pushBulkNotifications(notifications);
  
  return notifications.length;
};

/**
 * Send notification to all enrolled students in a course
 * (Students are enrolled via programs, so we find enrollments containing this course)
 */
export const notifyCourseStudents = async (
  courseId: mongoose.Types.ObjectId,
  notification: Omit<PushNotificationInput, 'userId'>
): Promise<number> => {
  
  const enrollments = await Enrollment.find({
    'coursesProgress.course': courseId,
    status: { $in: ['active', 'pending'] },
  }).populate('studentId');

  const notifications = enrollments
    .filter(e => e.studentId)
    .map(enrollment => ({
      ...notification,
      userId: (enrollment.studentId as any)._id,
    }));

  await pushBulkNotifications(notifications);
  
  return notifications.length;
};

/**
 * Send notification to students in a specific cohort
 */
export const notifyCohortStudents = async (
  cohort: string,
  notification: Omit<PushNotificationInput, 'userId'>
): Promise<number> => {
  const { User } = await import("../models/user");
  
  const students = await User.find({ 
    role: 'student',
    status: 'active',
    'studentProfile.cohort': cohort
  });
  
  const notifications = students.map(student => ({
    ...notification,
    userId: student._id,
  }));

  await pushBulkNotifications(notifications);
  
  return students.length;
};

/**
 * Send notification to students enrolled in a specific course within a program
 * with a specific enrollment status
 */
export const notifyCourseStudentsByStatus = async (
  courseId: mongoose.Types.ObjectId,
  courseStatus: string,
  notification: Omit<PushNotificationInput, 'userId'>
): Promise<number> => {
  
  const enrollments = await Enrollment.find({
    'coursesProgress.course': courseId,
    'coursesProgress.status': courseStatus,
    status: { $in: ['active', 'pending'] },
  }).populate('studentId');

  const notifications = enrollments
    .filter(e => e.studentId)
    .map(enrollment => ({
      ...notification,
      userId: (enrollment.studentId as any)._id,
    }));

  await pushBulkNotifications(notifications);
  
  return notifications.length;
};



/**
 * Send notification to all ACTIVE students in a program about a LiveSession
 */
export const notifyLiveSessionStudents = async (
  sessionId: mongoose.Types.ObjectId
): Promise<number> => {
  // Load the session with course and program info
  const session = await LiveSession.findById(sessionId)
    .populate('courseId', 'title programId');

  if (!session) throw new Error("LiveSession not found");

  const course = session.courseId as any; // populated course
  const programId = course.programId;

  // Get active enrollments in the program
  const enrollments = await Enrollment.find({
    programId,
    status: { $in: ['active'] },
  }).populate('studentId');

  const notifications = enrollments
    .filter(e => e.studentId)
    .map(e => ({
      userId: (e.studentId as any)._id,
      type: NotificationType.COURSE_UPDATE,
      title: `Live Session: ${session.title}`,
      message: `A live session for "${course.title}" is scheduled from ${session.startTime.toLocaleString()} to ${session.endTime.toLocaleString()}.`,
      relatedId: session._id,
      relatedModel: "LiveSession" as const,
    }));

  if (!notifications.length) return 0;

const notif = NotificationTemplates.liveSessionScheduled(
  session.title,
  course.title,
  session.startTime,
  session.endTime
);

await pushBulkNotifications(notifications.map(n => ({ ...notif, ...n })));
  return notifications.length;
};


// ============================================
// src/utils/notificationTemplates.ts
// ============================================

