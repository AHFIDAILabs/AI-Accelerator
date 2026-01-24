// ============================================
// src/utils/pushNotification.ts
// ============================================

import { Notification, INotification, NotificationType } from "../models/Notification";
import mongoose from "mongoose";
import { emitToUser } from "../config/socket";
import { Enrollment } from "../models/Enrollment";

export interface PushNotificationInput {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: mongoose.Types.ObjectId;
  relatedModel?: 'Course' | 'Module' | 'Lesson' | 'Assessment' | 'Certificate' | 'Program';
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


// ============================================
// src/utils/notificationTemplates.ts
// ============================================

export const NotificationTemplates = {
  // Program notifications
  programEnrolled: (programTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "Successfully Enrolled in Program",
    message: `You have been enrolled in ${programTitle}`,
  }),

  programCompleted: (programTitle: string) => ({
    type: NotificationType.CERTIFICATE_ISSUED,
    title: "Program Completed!",
    message: `Congratulations! You have completed ${programTitle}`,
  }),

  programPublished: (programTitle: string) => ({
    type: NotificationType.ANNOUNCEMENT,
    title: "New Program Available",
    message: `${programTitle} is now available for enrollment`,
  }),

  // Course notifications
  courseEnrolled: (courseTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "Course Access Granted",
    message: `You now have access to ${courseTitle}`,
  }),

  coursePublished: (courseTitle: string, programTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "New Course Available",
    message: `${courseTitle} is now available in ${programTitle}`,
  }),

  courseCompleted: (courseTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "Course Completed",
    message: `Congratulations! You have completed ${courseTitle}`,
  }),

  // Module notifications
  modulePublished: (moduleTitle: string, courseTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "New Module Available",
    message: `New module "${moduleTitle}" is now available in ${courseTitle}`,
  }),

  // Lesson notifications
  lessonPublished: (lessonTitle: string, moduleTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "New Lesson Available",
    message: `New lesson "${lessonTitle}" is available in ${moduleTitle}`,
  }),

  // Assessment notifications
  assessmentPublished: (assessmentTitle: string, courseTitle: string) => ({
    type: NotificationType.ASSESSMENT_DUE,
    title: "New Assessment Available",
    message: `A new assessment "${assessmentTitle}" is now available in ${courseTitle}`,
  }),

  assessmentDue: (assessmentTitle: string, daysLeft: number) => ({
    type: NotificationType.ASSESSMENT_DUE,
    title: "Assessment Due Soon",
    message: `Assessment "${assessmentTitle}" is due in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
  }),

  assessmentGraded: (assessmentTitle: string, score: number) => ({
    type: NotificationType.GRADE_POSTED,
    title: "Assessment Graded",
    message: `Your assessment "${assessmentTitle}" has been graded. Score: ${score}%`,
  }),

  assessmentFailed: (assessmentTitle: string, score: number, passingScore: number) => ({
    type: NotificationType.GRADE_POSTED,
    title: "Assessment Requires Attention",
    message: `Your score of ${score}% on "${assessmentTitle}" is below the passing score of ${passingScore}%`,
  }),

  // Certificate notifications
  certificateIssued: (programName: string) => ({
    type: NotificationType.CERTIFICATE_ISSUED,
    title: "Certificate Issued",
    message: `Congratulations! Your certificate for ${programName} is ready`,
  }),

  // General notifications
  announcement: (title: string, message: string) => ({
    type: NotificationType.ANNOUNCEMENT,
    title,
    message,
  }),

  reminder: (title: string, message: string) => ({
    type: NotificationType.REMINDER,
    title,
    message,
  }),

  // Enrollment status notifications
  enrollmentActivated: (programTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "Enrollment Activated",
    message: `Your enrollment in ${programTitle} is now active`,
  }),

  enrollmentSuspended: (programTitle: string) => ({
    type: NotificationType.ANNOUNCEMENT,
    title: "Enrollment Suspended",
    message: `Your enrollment in ${programTitle} has been suspended`,
  }),

  enrollmentDropped: (programTitle: string) => ({
    type: NotificationType.ANNOUNCEMENT,
    title: "Enrollment Dropped",
    message: `Your enrollment in ${programTitle} has been dropped`,
  }),
};