// ============================================
// src/utils/notificationTemplates.ts
// Helper templates for common notifications
// ============================================

import { NotificationType } from "../models/Notification";

export const NotificationTemplates = {
  // ==============================
  // Program notifications
  // ==============================
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

  // ==============================
  // Course notifications
  // ==============================
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

  // ==============================
  // Module notifications
  // ==============================
  modulePublished: (moduleTitle: string, courseTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "New Module Available",
    message: `New module "${moduleTitle}" is now available in ${courseTitle}`,
  }),

  // ==============================
  // Lesson notifications
  // ==============================
  lessonPublished: (lessonTitle: string, moduleTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "New Lesson Available",
    message: `New lesson "${lessonTitle}" is available in ${moduleTitle}`,
  }),

  // ==============================
  // Assessment notifications
  // ==============================
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

  // ==============================
  // Certificate notifications
  // ==============================
  certificateIssued: (programName: string) => ({
    type: NotificationType.CERTIFICATE_ISSUED,
    title: "Certificate Issued",
    message: `Congratulations! Your certificate for ${programName} is ready`,
  }),

  // ==============================
  // LiveSession notifications
  // ==============================
  liveSessionScheduled: (sessionTitle: string, courseTitle: string, startTime: Date, endTime: Date) => ({
    type: NotificationType.COURSE_UPDATE,
    title: `Live Session Scheduled: ${sessionTitle}`,
    message: `A live session for "${courseTitle}" has been scheduled from ${startTime.toLocaleString()} to ${endTime.toLocaleString()}.`,
  }),

  // ==============================
  // Enrollment status notifications
  // ==============================
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

  // ==============================
  // General notifications
  // ==============================
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

  communityReply: (postTitle: string, replierName: string) => ({
  type: NotificationType.OTHER,
  title: "New reply on your post",
  message: `${replierName} replied to "${postTitle}"`,
}),

communityAccepted: (postTitle: string) => ({
  type: NotificationType.OTHER,
  title: "Your reply was accepted!",
  message: `Your answer in "${postTitle}" was marked as the accepted answer.`,
}),

};