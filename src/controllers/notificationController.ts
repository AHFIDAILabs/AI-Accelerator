// ============================================
// src/controllers/notification.controller.ts
// ============================================

import { Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { Notification, NotificationType } from "../models/Notification";
import { AuthRequest } from "../middlewares/auth";
import { getIo as getSocketIo } from "../config/socket";

// ==============================
// GET USER NOTIFICATIONS
// ==============================
export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { 
    page = '1', 
    limit = '50', 
    unreadOnly = 'false',
    type,
    programId 
  } = req.query;

  const filter: any = { userId: req.user._id };
  
  if (unreadOnly === 'true') {
    filter.isRead = false;
  }
  
  if (type) {
    filter.type = type;
  }
  
  if (programId) {
    filter.programId = programId;
  }

  const total = await Notification.countDocuments(filter);
  
  const notifications = await Notification.find(filter)
    .populate('programId', 'title slug')
    .populate('relatedId')
    .sort({ createdAt: -1 })
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string));

  const unreadCount = await Notification.countDocuments({
    userId: req.user._id,
    isRead: false,
  });

  res.status(200).json({
    success: true,
    count: notifications.length,
    total,
    unreadCount,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: notifications,
  });
});

// ==============================
// GET NOTIFICATIONS BY TYPE
// ==============================
export const getNotificationsByType = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { type } = req.params;
  const { page = '1', limit = '20' } = req.query;

  if (!Object.values(NotificationType).includes(type as NotificationType)) {
    res.status(400).json({ success: false, error: "Invalid notification type" });
    return;
  }

  const filter = { 
    userId: req.user._id,
    type: type as NotificationType
  };

  const total = await Notification.countDocuments(filter);

  const notifications = await Notification.find(filter)
    .populate('programId', 'title slug')
    .sort({ createdAt: -1 })
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string));

  res.status(200).json({
    success: true,
    count: notifications.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: notifications,
  });
});

// ==============================
// MARK NOTIFICATION AS READ
// ==============================
export const markAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    res.status(404).json({ success: false, error: "Notification not found" });
    return;
  }

  // Emit real-time update
  try {
    const io = getSocketIo();
    io.to(req.user._id.toString()).emit("notification:read", {
      notificationId: notification._id,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error emitting notification read event:', error);
  }

  res.status(200).json({ success: true, data: notification });
});

// ==============================
// MARK MULTIPLE NOTIFICATIONS AS READ
// ==============================
export const markMultipleAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { notificationIds } = req.body;

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    res.status(400).json({ success: false, error: "Invalid notification IDs array" });
    return;
  }

  const result = await Notification.updateMany(
    { 
      _id: { $in: notificationIds },
      userId: req.user._id,
      isRead: false 
    },
    { isRead: true, readAt: new Date() }
  );

  // Emit real-time update
  try {
    const io = getSocketIo();
    io.to(req.user._id.toString()).emit("notification:multiple-read", {
      notificationIds,
      count: result.modifiedCount,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error emitting multiple read event:', error);
  }

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} notifications marked as read`,
    count: result.modifiedCount,
  });
});

// ==============================
// MARK ALL NOTIFICATIONS AS READ
// ==============================
export const markAllAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { type, programId } = req.body;

  const filter: any = { 
    userId: req.user._id, 
    isRead: false 
  };

  if (type) filter.type = type;
  if (programId) filter.programId = programId;

  const result = await Notification.updateMany(
    filter,
    { isRead: true, readAt: new Date() }
  );

  // Emit real-time update
  try {
    const io = getSocketIo();
    io.to(req.user._id.toString()).emit("notification:all-read", {
      count: result.modifiedCount,
      type: type || 'all',
      programId,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error emitting all-read event:', error);
  }

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} notifications marked as read`,
    count: result.modifiedCount,
  });
});

// ==============================
// DELETE NOTIFICATION
// ==============================
export const deleteNotification = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!notification) {
    res.status(404).json({ success: false, error: "Notification not found" });
    return;
  }

  // Emit real-time update
  try {
    const io = getSocketIo();
    io.to(req.user._id.toString()).emit("notification:deleted", {
      notificationId: notification._id,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error emitting deletion event:', error);
  }

  res.status(200).json({ success: true, message: "Notification deleted" });
});

// ==============================
// DELETE MULTIPLE NOTIFICATIONS
// ==============================
export const deleteMultipleNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { notificationIds } = req.body;

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    res.status(400).json({ success: false, error: "Invalid notification IDs array" });
    return;
  }

  const result = await Notification.deleteMany({
    _id: { $in: notificationIds },
    userId: req.user._id,
  });

  // Emit real-time update
  try {
    const io = getSocketIo();
    io.to(req.user._id.toString()).emit("notification:multiple-deleted", {
      notificationIds,
      count: result.deletedCount,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error emitting multiple deletion event:', error);
  }

  res.status(200).json({ 
    success: true, 
    message: `${result.deletedCount} notifications deleted`,
    count: result.deletedCount
  });
});

// ==============================
// DELETE ALL READ NOTIFICATIONS
// ==============================
export const deleteAllRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const result = await Notification.deleteMany({
    userId: req.user._id,
    isRead: true,
  });

  // Emit real-time update
  try {
    const io = getSocketIo();
    io.to(req.user._id.toString()).emit("notification:all-read-deleted", {
      count: result.deletedCount,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error emitting deletion event:', error);
  }

  res.status(200).json({ 
    success: true, 
    message: `${result.deletedCount} read notifications deleted`,
    count: result.deletedCount
  });
});

// ==============================
// GET UNREAD COUNT
// ==============================
export const getUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { programId } = req.query;

  const filter: any = {
    userId: req.user._id,
    isRead: false,
  };

  if (programId) {
    filter.programId = programId;
  }

  const count = await Notification.countDocuments(filter);

  res.status(200).json({ success: true, count });
});

// ==============================
// GET UNREAD COUNT BY TYPE
// ==============================
export const getUnreadCountByType = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const counts = await Notification.aggregate([
    {
      $match: {
        userId: req.user._id,
        isRead: false,
      }
    },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 }
      }
    }
  ]);

  const countsByType = counts.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {} as Record<string, number>);

  const totalUnread = counts.reduce((sum, item) => sum + item.count, 0);

  res.status(200).json({ 
    success: true, 
    totalUnread,
    countsByType 
  });
});

// ==============================
// GET NOTIFICATION PREFERENCES (Future feature)
// ==============================
export const getNotificationPreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // This would fetch from a NotificationPreferences model
  // For now, return default preferences
  const defaultPreferences = {
    email: {
      programUpdates: true,
      courseUpdates: true,
      assessmentDue: true,
      gradePosted: true,
      certificateIssued: true,
      announcements: true,
      reminders: true,
    },
    push: {
      programUpdates: true,
      courseUpdates: true,
      assessmentDue: true,
      gradePosted: true,
      certificateIssued: true,
      announcements: true,
      reminders: false,
    }
  };

  res.status(200).json({ 
    success: true, 
    data: defaultPreferences 
  });
});