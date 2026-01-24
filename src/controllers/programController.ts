import { Request, Response } from "express";
import slugify from "slugify";
import mongoose from "mongoose";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";
import { Program } from "../models/program";
import { Course } from "../models/Course";
import { UserRole } from "../models/user";


// =============================
// CREATE PROGRAM
// =============================
export const createProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  if (![UserRole.ADMIN, UserRole.INSTRUCTOR].includes(req.user.role))
    return res.status(403).json({ success: false, error: "Only instructors or admins can create programs" });

  const {
    title,
    description,
    category,
    tags,
    instructors,
    price,
    currency,
    prerequisites,
    targetAudience,
   
  } = req.body;

  const slug = slugify(title, { lower: true, strict: true });

  const existing = await Program.findOne({ slug });
  if (existing) return res.status(400).json({ success: false, error: "Program with similar title exists" });

  const program = await Program.create({
    title,
    slug,
    description,
    category,
    tags,
    price,
    currency,
    prerequisites,
    targetAudience,
    createdBy: req.user._id,
    instructors: req.user.role === UserRole.INSTRUCTOR ? [req.user._id] : req.body.instructors
  });

 return res.status(201).json({ success: true, data: program });
});


// =============================
// UPDATE PROGRAM
// =============================
export const updateProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const program = await Program.findById(id);
  if (!program) return res.status(404).json({ success: false, error: "Program not found" });

   if (!canEditProgram(req.user, program))
    return res.status(403).json({ success: false, error: "Not allowed to edit this program" });

  Object.assign(program, req.body);

  if (req.body.title) {
    program.slug = slugify(req.body.title, { lower: true, strict: true });
  }

  await program.save();
 return res.json({ success: true, data: program });
});


// =============================
// GET ALL PROGRAMS (Filters)
// =============================
export const getPrograms = asyncHandler(async (req: AuthRequest, res: Response) => {
  let filter: any = { isPublished: true };

  // Admin sees all
  if (req.user?.role === UserRole.ADMIN) filter = {};

  // Instructor sees theirs
  if (req.user?.role === UserRole.INSTRUCTOR) {
    filter = {
      $or: [
        { isPublished: true },
        { createdBy: req.user._id },
        { instructors: req.user._id }
      ]
    };
  }

  const programs = await Program.find(filter).populate("instructors", "firstName lastName");
  res.json({ success: true, data: programs });
});


// =============================
// GET SINGLE PROGRAM (FULL)
// =============================
export const getProgram = asyncHandler(async (req: Request, res: Response) => {
  const program = await Program.findById(req.params.id)
    .populate("instructors", "firstName lastName avatar")
    .populate({
      path: "courses",
      populate: {
        path: "modules",
        populate: { path: "lessons" }
      }
    });

  if (!program) return res.status(404).json({ success: false, error: "Program not found" });

 return res.json({ success: true, data: program });
});


// =============================
// ADD COURSE TO PROGRAM
// =============================
export const addCourseToProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { programId, courseId } = req.body;

  const program = await Program.findById(programId);
  const course = await Course.findById(courseId);

  if (!program || !course) return res.status(404).json({ success: false, error: "Program or Course not found" });

   if (!canEditProgram(req.user, program))
    return res.status(403).json({ success: false, error: "Not allowed" });

  if (program.courses.includes(course._id))
    return res.status(400).json({ success: false, error: "Course already in program" });

  program.courses.push(course._id);
  await program.save();

 return res.json({ success: true, message: "Course added", data: program });
});


// =============================
// REMOVE COURSE FROM PROGRAM
// =============================
export const removeCourseFromProgram = asyncHandler(async (req: AuthRequest, res: Response) => {

    
  const { programId, courseId } = req.body;

  const program = await Program.findById(programId);
  if (!program) return res.status(404).json({ success: false, error: "Program not found" });

  program.courses = program.courses.filter(id => id.toString() !== courseId);
  await program.save();

  return res.json({ success: true, message: "Course removed", data: program });
});


// =============================
// PUBLISH / UNPUBLISH PROGRAM
// =============================
export const toggleProgramPublish = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== UserRole.ADMIN)
    return res.status(403).json({ success: false, error: "Only admin can publish programs" });

  const program = await Program.findById(req.params.id);
  if (!program) return res.status(404).json({ success: false, error: "Program not found" });

  program.isPublished = !program.isPublished;
  await program.save();

 return res.json({ success: true, data: program });
});



// =============================
// DELETE PROGRAM
// =============================
export const deleteProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== UserRole.ADMIN)
    return res.status(403).json({ success: false, error: "Only admin can delete programs" });

  const program = await Program.findById(req.params.id);
  if (!program) return res.status(404).json({ success: false, error: "Program not found" });

  await program.deleteOne();
 return res.json({ success: true, message: "Program deleted" });
});


const canEditProgram = (user: any, program: any) => {
  if (user.role === UserRole.ADMIN) return true;
  if (user.role === UserRole.INSTRUCTOR) {
    return (
      program.createdBy.toString() === user._id.toString() ||
      program.instructors.some((id: any) => id.toString() === user._id.toString())
    );
  }
  return false;
};
