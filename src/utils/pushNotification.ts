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
  relatedModel?: 'Course' | 'Module' | 'Lesson' | 'Assessment' | 'Certificate';
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
 * Send notification to all enrolled students in a course
 */
export const notifyCourseStudents = async (
  courseId: mongoose.Types.ObjectId,
  notification: Omit<PushNotificationInput, 'userId'>
): Promise<number> => {
  
  const enrollments = await Enrollment.find({
    courseId,
    status: 'active',
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