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
  const { page = "1", limit = "12", isPublished, category } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(50, parseInt(limit as string)); // safety cap
  const skip = (pageNum - 1) * limitNum;

  let filter: any = {};

  // Role rules
  if (req.user?.role === UserRole.ADMIN) {
    filter = {};
  } else if (req.user?.role === UserRole.INSTRUCTOR) {
    filter.$or = [
      { isPublished: true },
      { createdBy: req.user._id },
      { instructors: req.user._id }
    ];
  } else {
    filter.isPublished = true;
  }

  // Query filters
  if (isPublished !== undefined) filter.isPublished = isPublished === "true";
  if (category) filter.category = category;

  // 🚀 Run count + data query in parallel
  const [total, programs] = await Promise.all([
    Program.countDocuments(filter),
    Program.find(filter)
      .populate({
        path: "instructors",
        select: "firstName lastName avatar",
        options: { strictPopulate: false }
      })
      .select("-__v")
      .skip(skip)
      .limit(limitNum)
      .lean()
  ]);

  res.json({
    success: true,
    data: programs,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum)
  });
});

// =============================
// GET SINGLE PROGRAM (BASIC INFO)
// =============================
export const getProgram = asyncHandler(async (req: Request, res: Response) => {
  const program = await Program.findById(req.params.id)
    .populate("instructors", "firstName lastName avatar")
    .populate({
      path: "courses",
      select: "title description slug level totalDuration"
    });

  if (!program) return res.status(404).json({ success: false, error: "Program not found" });

 return res.json({ success: true, data: program });
});


// =============================
// GET SINGLE PROGRAM WITH FULL DETAILS
// =============================
export const getProgramWithDetails = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid program ID format" 
      });
    }

    // ✅ FIXED: Only populate what exists in Course schema
    const program = await Program.findById(id)
      .populate("instructors", "firstName lastName avatar email")
      .populate({
        path: "courses",
        select: "title description slug level totalDuration thumbnail instructor isPublished"
      })
      .lean();

    if (!program) {
      return res.status(404).json({ 
        success: false, 
        error: "Program not found" 
      });
    }

    return res.json({ 
      success: true, 
      data: program 
    });

  } catch (error: any) {
    console.error('Error in getProgramWithDetails:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Failed to fetch program details" 
    });
  }
});


// =============================
// GET PROGRAM BY SLUG (FIXED)
// =============================
export const getProgramBySlug = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    console.log('📍 Fetching program by slug:', slug);

    // ✅ FIXED: Simplified population without nested modules/lessons
    const program = await Program.findOne({ slug })
      .populate('instructors', 'firstName lastName avatar email')
      .populate({
        path: 'courses',
        select: 'title description slug level totalDuration thumbnail instructor isPublished',
        // Don't populate modules - it causes the StrictPopulateError
      })
      .lean();

    if (!program) {
      console.log('❌ Program not found with slug:', slug);
      return res.status(404).json({ 
        success: false, 
        error: 'Program not found' 
      });
    }

    console.log('✅ Program found:', program.title);

    return res.json({ 
      success: true, 
      data: program 
    });

  } catch (error: any) {
    console.error('❌ Error in getProgramBySlug:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch program' 
    });
  }
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


// =============================
// HELPER FUNCTION
// =============================
const canEditProgram = (user: any, program: any) => {
  if (!user) return false;
  if (user.role === UserRole.ADMIN) return true;
  if (user.role === UserRole.INSTRUCTOR) {
    return (
      program.createdBy.toString() === user._id.toString() ||
      program.instructors.some((id: any) => id.toString() === user._id.toString())
    );
  }
  return false;
};