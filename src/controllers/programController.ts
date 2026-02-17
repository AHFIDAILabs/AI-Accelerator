import { Request, Response } from "express";
import slugify from "slugify";
import mongoose from "mongoose";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";
import { Program } from "../models/program";
import { Course } from "../models/Course";
import { UserRole } from "../models/user";

/** ------------------------------------------------------
 * CREATE PROGRAM
 * -----------------------------------------------------*/
export const createProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  if (![UserRole.ADMIN, UserRole.INSTRUCTOR].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: "Only instructors or admins can create programs" });
  }

  const {
    title,
    description,
    category,
    tags,
    objectives,
    level,
    price,
    currency,
    prerequisites,
    targetAudience,
    isSelfPaced,
    startDate,
    endDate,
    coverImage,
    bannerImage
  } = req.body;

  const slug = slugify(title, { lower: true, strict: true });
  const existing = await Program.findOne({ slug });

  if (existing) {
    return res.status(400).json({
      success: false,
      error: "A program with this title already exists"
    });
  }

  const program = await Program.create({
    title,
    slug,
    description,
    category,
    tags,
    objectives,
    level,
    price,
    currency,
    prerequisites,
    targetAudience,
    isSelfPaced,
    startDate,
    endDate,
    coverImage,
    bannerImage,
    createdBy: req.user._id,
    instructors:
      req.user.role === UserRole.INSTRUCTOR
        ? [req.user._id]
        : req.body.instructors
  });

 return res.status(201).json({ success: true, data: program });
});

/** ------------------------------------------------------
 * UPDATE PROGRAM
 * -----------------------------------------------------*/
export const updateProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const program = await Program.findById(id);
  if (!program) return res.status(404).json({ success: false, error: "Program not found" });

  if (!canEditProgram(req.user, program)) {
    return res.status(403).json({ success: false, error: "Not allowed to edit this program" });
  }

  // If title is changing, recalc slug and verify uniqueness
  if (req.body.title && req.body.title !== program.title) {
    const newSlug = slugify(req.body.title, { lower: true, strict: true });

    const slugOwner = await Program.findOne({ slug: newSlug, _id: { $ne: program._id } })
      .select("_id")
      .lean();

    if (slugOwner) {
      return res.status(400).json({
        success: false,
        error: "Another program with this title/slug already exists"
      });
    }

    program.slug = newSlug;
  }

  // Avoid wholesale Object.assign if you want to protect certain fields:
   const allowed = ['description','category','tags','objectives','level','price','currency','prerequisites','targetAudience','isSelfPaced','startDate','endDate','coverImage','bannerImage','isPublished'];
   for (const k of allowed) if (req.body[k] !== undefined) (program as any)[k] = req.body[k];

  Object.assign(program, req.body);

  await program.save();
  return res.json({ success: true, data: program });
});

/** ------------------------------------------------------
 * GET PROGRAM LIST
 * -----------------------------------------------------*/
export const getPrograms = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = "1", limit = "12", category } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, parseInt(limit as string));
  const skip = (pageNum - 1) * limitNum;

  const filter: any = {};

  // ROLE-BASED ACCESS
  if (req.user?.role === UserRole.ADMIN) {
    // no filter
  } else if (req.user?.role === UserRole.INSTRUCTOR) {
    filter.$or = [
      { isPublished: true },
      { createdBy: req.user._id },
      { instructors: req.user._id }
    ];
  } else {
    filter.isPublished = true;
  }

  if (category) filter.category = category;

  const [total, programs] = await Promise.all([
    Program.countDocuments(filter),
    Program.find(filter)
      .populate("instructors", "firstName lastName profileImage")
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

/** ------------------------------------------------------
 * GET SINGLE PROGRAM
 * -----------------------------------------------------*/
export const getProgram = asyncHandler(async (req: Request, res: Response) => {
  const program = await Program.findById(req.params.id)
    .populate("instructors", "firstName lastName profileImage")
    .populate({
      path: "courses",
      select: "title description slug level estimatedHours moduleCount lessonCount isPublished"
    });

  if (!program) {
    return res.status(404).json({ success: false, error: "Program not found" });
  }

 return res.json({ success: true, data: program });
});

/** ------------------------------------------------------
 * GET PROGRAM BY SLUG
 * -----------------------------------------------------*/
export const getProgramBySlug = asyncHandler(async (req: Request, res: Response) => {
  const program = await Program.findOne({ slug: req.params.slug })
    .populate("instructors", "firstName lastName profileImage email")
    .populate({
      path: "courses",
      select: "title slug description level estimatedHours moduleCount lessonCount isPublished"
    })
    .lean();

  if (!program) {
    return res.status(404).json({ success: false, error: "Program not found" });
  }

 return res.json({ success: true, data: program });
});

// =============================
// GET SINGLE PROGRAM WITH FULL DETAILS (USING PROGRAM.courses)
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

    const program = await Program.findById(id)
      .populate("instructors", "firstName lastName profileImage email")
      .populate({
        path: "courses",
        select: "title description slug level estimatedHours moduleCount lessonCount isPublished coverImage order"
      })
      .lean();

    if (!program) {
      return res.status(404).json({
        success: false,
        error: "Program not found"
      });
    }

    // Derived stats
    const courses = (program.courses as any[]) || [];
    const courseCount = courses.length;
    const totalEstimatedHours = courses.reduce((sum, c) => sum + (c.estimatedHours || 0), 0);

    return res.json({
      success: true,
      data: {
        ...program,
        stats: { courseCount, totalEstimatedHours }
      }
    });
  } catch (error: any) {
    console.error("Error in getProgramWithDetails:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch program details"
    });
  }
});

/** ------------------------------------------------------
 * ADD COURSE TO PROGRAM
 * -----------------------------------------------------*/

export const addCourseToProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { programId, courseId } = req.body;

  const program = await Program.findById(programId);
  const course = await Course.findById(courseId);

  if (!program || !course) {
    return res.status(404).json({ success: false, error: "Program or Course not found" });
  }

  if (!canEditProgram(req.user, program)) {
    return res.status(403).json({ success: false, error: "Not allowed" });
  }

  if (program.courses.some(id => id.toString() === course._id.toString())) {
    return res.status(400).json({ success: false, error: "Course already added to this program" });
  }

  program.courses.push(course._id);
  program.courseCount = program.courses.length;

  // Optional: keep Course.programId in sync (if you use it)
   course.programId = program._id;

  await Promise.all([program.save() , course.save()]);

  return res.json({ success: true, message: "Course added", data: program });
});

/** ------------------------------------------------------
 * REMOVE COURSE FROM PROGRAM
 * -----------------------------------------------------*/
export const removeCourseFromProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { programId, courseId } = req.body;

  const program = await Program.findById(programId);
  if (!program) {
    return res.status(404).json({ success: false, error: "Program not found" });
  }

  if (!canEditProgram(req.user, program)) {
    return res.status(403).json({ success: false, error: "Not allowed" });
  }

  const before = program.courses.length;
  program.courses = program.courses.filter(id => id.toString() !== courseId);
  program.courseCount = program.courses.length;

  if (program.courses.length === before) {
    return res.status(404).json({ success: false, error: "Course was not in this program" });
  }

  // Optional: clear Course.programId if you’re syncing both
await Promise.all([
  Course.findByIdAndUpdate(courseId, { $unset: { programId: "" } }),
  program.save(),
]);
  await program.save();

  return res.json({ success: true, message: "Course removed", data: program });
});

/** ------------------------------------------------------
 * TOGGLE PROGRAM PUBLISH
 * -----------------------------------------------------*/
export const toggleProgramPublish = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ success: false, error: "Only admin can publish programs" });
  }

  const program = await Program.findById(req.params.id);
  if (!program) {
    return res.status(404).json({ success: false, error: "Program not found" });
  }

  program.isPublished = !program.isPublished;
  await program.save();

 return res.json({ success: true, data: program });
});

/** ------------------------------------------------------
 * DELETE PROGRAM
 * -----------------------------------------------------*/
export const deleteProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ success: false, error: "Only admin can delete programs" });
  }

  const program = await Program.findById(req.params.id);
  if (!program) {
    return res.status(404).json({ success: false, error: "Program not found" });
  }

  // Abort if any enrollments exist (or change this to detach behavior)
  const enrollmentCount = await mongoose.model('Enrollment').countDocuments({ programId: program._id });
  if (enrollmentCount > 0) {
    return res.status(400).json({
      success: false,
      error: `Cannot delete program with ${enrollmentCount} enrollments`
    });
  }

  // Detach courses
  if (program.courses?.length) {
    await Course.updateMany(
      { _id: { $in: program.courses } },
      { $unset: { programId: "" } }
    );
  }

  await program.deleteOne();

  return res.json({ success: true, message: "Program deleted" });
});

/** ------------------------------------------------------
 * INTERNAL HELPER
 * -----------------------------------------------------*/
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