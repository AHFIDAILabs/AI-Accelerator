import { Request, Response } from "express";
import mongoose from "mongoose";
import { Module, IModule } from "../models/Module";
import { Course } from "../models/Course";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { QueryHelper } from "../utils/queryHelper";
import { pushNotification, notifyCourseStudents } from "../utils/pushNotification";
import { NotificationType } from "../models/Notification";
import { getIo } from "../config/socket";
import { Enrollment } from "../models/Enrollment";

// ==============================
// CREATE MODULE
// ==============================
export const createModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    courseId,
    moduleNumber,
    title,
    description,
    weekNumber,
    learningObjectives,
    startDate,
    endDate,
    order,
  } = req.body;

  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  // Instructor can only add modules to their own courses
  if (req.user.role === "instructor" && course.createdBy.toString() !== req.user._id.toString()) {
    res.status(403).json({ success: false, error: "Cannot add module to this course" });
    return;
  }

  const module = await Module.create({
    courseId,
    moduleNumber,
    title,
    description,
    weekNumber,
    learningObjectives,
    startDate,
    endDate,
    order,
    isPublished: false,
  });

  res.status(201).json({
    success: true,
    message: "Module created successfully (pending publication)",
    data: module,
  });
});

// ==============================
// TOGGLE MODULE PUBLISH
// ==============================
export const toggleModulePublish = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findById(req.params.id).populate('courseId', 'title');
  
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const wasPublished = module.isPublished;
  module.isPublished = !module.isPublished;
  await module.save();

  // Notify enrolled students when module is published
  if (module.isPublished && !wasPublished) {
    const course = module.courseId as any;
    
    // Notify all enrolled students
    await notifyCourseStudents(course._id, {
      type: NotificationType.COURSE_UPDATE,
      title: "New Module Available",
      message: `Week ${module.weekNumber}: ${module.title} is now available in ${course.title}`,
      relatedId: module._id,
      relatedModel: "Module",
    });

    // Get IO instance for real-time notifications
    const io = getIo();
    const enrollments = await Enrollment.find({
      courseId: course._id,
      status: 'active',
    }).populate('studentId');

    for (const enrollment of enrollments) {
      if (enrollment.studentId) {
        const student = enrollment.studentId as any;
        
        io.to(student._id.toString()).emit("notification", {
          type: NotificationType.COURSE_UPDATE,
          title: "New Module Available",
          message: `Week ${module.weekNumber}: ${module.title}`,
          moduleId: module._id,
          courseId: course._id,
          weekNumber: module.weekNumber,
          timestamp: new Date(),
        });
      }
    }
  }

  res.status(200).json({
    success: true,
    message: `Module ${module.isPublished ? "published" : "unpublished"} successfully`,
    data: module,
  });
});

// ==============================
// UPDATE MODULE
// ==============================
export const updateModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findById(req.params.id).populate('courseId', 'title');
  
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // Instructor can only update modules from their own courses
  if (req.user?.role === "instructor") {
    const course = await Course.findById(module.courseId);
    if (!course) {
      res.status(404).json({ success: false, error: "Course not found" });
      return;
    }
    if (course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, error: "Cannot update this module" });
      return;
    }
    module.isPublished = false;
  }

  Object.assign(module, req.body);
  await module.save();

  // Notify students if module was published and got updated
  if (module.isPublished) {
    const course = module.courseId as any;
    
    await notifyCourseStudents(course._id, {
      type: NotificationType.COURSE_UPDATE,
      title: "Module Updated",
      message: `${module.title} has been updated`,
      relatedId: module._id,
      relatedModel: "Module",
    });
  }

  res.json({
    success: true,
    message: "Module updated successfully",
    data: module,
  });
});


export const getAllModulesAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  let query = Module.find().populate("courseId", "title");
  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;
  const modules = await query;
  res.status(200).json({ success: true, count: modules.length, data: modules });
});

export const getPublishedModules = asyncHandler(async (req: AuthRequest, res: Response) => {
  let query = Module.find({ isPublished: true }).populate("courseId", "title");
  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;
  const modules = await query;
  res.status(200).json({ success: true, count: modules.length, data: modules });
});

export const getModuleById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findById(req.params.id).populate("courseId", "title");
  if (!module || (!module.isPublished && req.user?.role !== "admin" && req.user?.role !== "instructor")) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }
  res.status(200).json({ success: true, data: module });
});

export const deleteModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findByIdAndDelete(req.params.id);
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }
  res.status(200).json({ success: true, message: "Module deleted successfully" });
});

export const reorderModules = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { orders } = req.body;
  const bulkOps = orders.map((item: any) => ({
    updateOne: { filter: { _id: item.moduleId }, update: { order: item.order } },
  }));
  await Module.bulkWrite(bulkOps);
  res.status(200).json({ success: true, message: "Modules reordered successfully" });
});