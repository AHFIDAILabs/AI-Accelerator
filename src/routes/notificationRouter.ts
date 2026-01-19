// src/routes/notificationRouter.ts
import express from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead
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

export default notificationRouter;
