// src/controllers/notificationController.ts
import {  Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { Notification } from "../models/Notification";
import { AuthRequest } from "../middlewares/auth";

// ==============================
// GET USER NOTIFICATIONS
// ==============================
export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const notifications = await Notification.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50); // latest 50 notifications

 return res.status(200).json({ success: true, data: notifications });
});

// ==============================
// MARK NOTIFICATION AS READ
// ==============================
export const markAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) return res.status(404).json({ success: false, error: "Notification not found" });

 return res.status(200).json({ success: true, data: notification });
});

// ==============================
// MARK ALL NOTIFICATIONS AS READ
// ==============================
export const markAllAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  return res.status(200).json({ success: true, message: "All notifications marked as read" });
});
