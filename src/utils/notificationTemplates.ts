// ============================================
// src/utils/notificationTemplates.ts
// Helper templates for common notifications
// ============================================

import { NotificationType } from "../models/Notification";

export const NotificationTemplates = {
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

  courseEnrolled: (courseTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "Successfully Enrolled",
    message: `You have been enrolled in ${courseTitle}`,
  }),

  certificateIssued: (courseName: string) => ({
    type: NotificationType.CERTIFICATE_ISSUED,
    title: "Certificate Issued",
    message: `Congratulations! Your certificate for ${courseName} is ready`,
  }),

  modulePublished: (moduleTitle: string, courseTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "New Module Available",
    message: `New module "${moduleTitle}" is now available in ${courseTitle}`,
  }),

  lessonPublished: (lessonTitle: string, moduleTitle: string) => ({
    type: NotificationType.COURSE_UPDATE,
    title: "New Lesson Available",
    message: `New lesson "${lessonTitle}" is available in ${moduleTitle}`,
  }),

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
};