// src/controllers/notificationController.ts
import {  Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { Notification } from "../models/Notification";
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

  const { page = '1', limit = '50', unreadOnly = 'false' } = req.query;

  const filter: any = { userId: req.user._id };
  if (unreadOnly === 'true') {
    filter.isRead = false;
  }

  const total = await Notification.countDocuments(filter);
  
  const notifications = await Notification.find(filter)
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
  const io = getSocketIo();
  io.to(req.user._id.toString()).emit("notification:read", {
    notificationId: notification._id,
    timestamp: new Date(),
  });

  res.status(200).json({ success: true, data: notification });
});

// ==============================
// MARK ALL NOTIFICATIONS AS READ
// ==============================
export const markAllAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const result = await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  // Emit real-time update
  const io = getSocketIo();
  io.to(req.user._id.toString()).emit("notification:all-read", {
    count: result.modifiedCount,
    timestamp: new Date(),
  });

  res.status(200).json({
    success: true,
    message: "All notifications marked as read",
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

  res.status(200).json({ success: true, message: "Notification deleted" });
});

// ==============================
// GET UNREAD COUNT
// ==============================
export const getUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const count = await Notification.countDocuments({
    userId: req.user._id,
    isRead: false,
  });

  res.status(200).json({ success: true, count });
});