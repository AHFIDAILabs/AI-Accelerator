// src/routes/notificationRouter.ts
import express from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteAllRead,
  deleteMultipleNotifications,
  deleteNotification,
  getNotificationPreferences,
  getUnreadCount,
  getUnreadCountByType,
  markMultipleAsRead
} from "../controllers/notificationController";
import { protect } from "../middlewares/auth";

const notificationRouter = express.Router();

// All routes here require authentication
notificationRouter.use(protect);

// Get latest notifications for the logged-in user
notificationRouter.get("/", getNotifications);

// Mark a single notification as read
notificationRouter.put("/read/:id", markAsRead);

// Mark all notifications as read
notificationRouter.put("/read-all", markAllAsRead);

// Read operations
notificationRouter.put("/read-multiple", markMultipleAsRead);

// Delete operations
notificationRouter.delete("/:id", deleteNotification);
notificationRouter.delete("/multiple", deleteMultipleNotifications);
notificationRouter.delete("/all-read", deleteAllRead);

// Unread counts
notificationRouter.get("/unread-count", getUnreadCount);
notificationRouter.get("/unread-count/type", getUnreadCountByType);

// Preferences
notificationRouter.get("/preferences", getNotificationPreferences);

export default notificationRouter;
