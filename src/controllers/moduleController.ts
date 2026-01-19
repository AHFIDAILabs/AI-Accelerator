import { Request, Response } from "express";
import mongoose from "mongoose";
import { Module, IModule } from "../models/Module";
import { Course } from "../models/Course";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { QueryHelper } from "../utils/queryHelper";

// ==============================
// CREATE MODULE
// ==============================
export const createModule = asyncHandler(
  async (req: AuthRequest, res: Response) => {
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

    if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ success: false, error: "Course not found" });

    // Instructor can only add modules to their own courses
    if (req.user.role === "instructor" && course.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: "Cannot add module to this course" });
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
      isPublished: false, // Requires admin approval
    });

   return res.status(201).json({
      success: true,
      message: "Module created successfully (pending publication)",
      data: module,
    });
  }
);

// ==============================
// GET ALL MODULES (ADMIN)
// ==============================
export const getAllModulesAdmin = asyncHandler(async (req: Request, res: Response) => {
  let query = Module.find().populate("courseId", "title");

  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;

  const modules = await query;

  res.status(200).json({
    success: true,
    count: modules.length,
    data: modules,
  });
});

// ==============================
// GET PUBLISHED MODULES (STUDENT)
// ==============================
export const getPublishedModules = asyncHandler(async (req: Request, res: Response) => {
  let query = Module.find({ isPublished: true }).populate("courseId", "title");

  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;

  const modules = await query;

  res.status(200).json({
    success: true,
    count: modules.length,
    data: modules,
  });
});

// ==============================
// GET SINGLE MODULE
// ==============================
export const getModuleById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findById(req.params.id).populate("courseId", "title");

  if (!module || (!module.isPublished && req.user?.role !== "admin" && req.user?.role !== "instructor")) {
    return res.status(404).json({ success: false, error: "Module not found" });
  }

 return res.status(200).json({ success: true, data: module });
});

// ==============================
// UPDATE MODULE
// ==============================
export const updateModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findById(req.params.id);
  if (!module) return res.status(404).json({ success: false, error: "Module not found" });

  // Instructor can only update modules from their own courses
  if (req.user?.role === "instructor") {
    const course = await Course.findById(module.courseId);
    if (!course) return res.status(404).json({ success: false, error: "Course not found" });
    if (course.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: "Cannot update this module" });
    }
    // Editing reverts module to unpublished
    module.isPublished = false;
  }

  Object.assign(module, req.body);
  await module.save();

  return res.json({
    success: true,
    message: "Module updated successfully",
    data: module,
  });
});

// ==============================
// DELETE MODULE
// ==============================
export const deleteModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findByIdAndDelete(req.params.id);
  if (!module) return res.status(404).json({ success: false, error: "Module not found" });

  return res.status(200).json({ success: true, message: "Module deleted successfully" });
});

// ==============================
// PUBLISH / UNPUBLISH MODULE
// ==============================
export const toggleModulePublish = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findById(req.params.id);
  if (!module) return res.status(404).json({ success: false, error: "Module not found" });

  module.isPublished = !module.isPublished;
  await module.save();

 return res.status(200).json({
    success: true,
    message: `Module ${module.isPublished ? "published" : "unpublished"} successfully`,
    data: module,
  });
});

// ==============================
// BULK REORDER MODULES
// ==============================
export const reorderModules = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { orders } = req.body; // orders = [{ moduleId, order }]

  const bulkOps = orders.map((item: any) => ({
    updateOne: {
      filter: { _id: item.moduleId },
      update: { order: item.order },
    },
  }));

  await Module.bulkWrite(bulkOps);

  res.status(200).json({ success: true, message: "Modules reordered successfully" });
});
