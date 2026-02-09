// ============================================
// src/controllers/scholarship.controller.ts
// ============================================

import { Response } from "express";
import { Scholarship, ScholarshipStatus, DiscountType } from "../models/Scholarship";
import { Program } from "../models/program";
import { User } from "../models/user";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import  EmailService  from "../utils/emailService";

// ======================================================
// CREATE SCHOLARSHIP CODE
// ======================================================
export const createScholarship = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { 
    programId, 
    studentEmail, 
    discountType, 
    discountValue, 
    expiresAt, 
    notes,
    sendEmail: shouldSendEmail 
  } = req.body;

  if (!programId || !discountType || discountValue === undefined) {
    res.status(400).json({ 
      success: false, 
      error: "programId, discountType, and discountValue are required" 
    });
    return;
  }

  // Validate program exists
  const program = await Program.findById(programId);
  if (!program) {
    res.status(404).json({ success: false, error: "Program not found" });
    return;
  }

  // Validate student email if provided
  if (studentEmail) {
    const student = await User.findOne({ email: studentEmail.toLowerCase() });
    if (!student) {
      res.status(404).json({ success: false, error: "Student with this email not found" });
      return;
    }
  }

  // Generate unique scholarship code
  const code = (Scholarship as any).generateCode('SCHOLAR');

  // Create scholarship
  const scholarship = await Scholarship.create({
    code,
    programId,
    studentEmail: studentEmail?.toLowerCase(),
    discountType,
    discountValue,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    createdBy: req.user._id,
    notes
  });

  // Send email to student if requested and email is provided
  if (shouldSendEmail && studentEmail) {
    try {
      await EmailService.sendEmail({
        to: studentEmail,
        subject: `Scholarship Awarded for ${program.title}`,
        html: `
          <h2>Congratulations! You've Been Awarded a Scholarship</h2>
          <p>You have been awarded a scholarship for <strong>${program.title}</strong>.</p>
          
          <div style="background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px;">
            <h3>Your Scholarship Code:</h3>
            <p style="font-size: 24px; font-weight: bold; color: #FF6B35; letter-spacing: 2px;">
              ${code}
            </p>
          </div>
          
          <h3>Scholarship Details:</h3>
          <ul>
            <li><strong>Discount:</strong> ${discountType === 'percentage' ? `${discountValue}%` : `$${discountValue}`}</li>
            ${expiresAt ? `<li><strong>Expires:</strong> ${new Date(expiresAt).toLocaleDateString()}</li>` : ''}
          </ul>
          
          <p><strong>How to Use:</strong></p>
          <ol>
            <li>Visit the program page</li>
            <li>Click "Enroll Now"</li>
            <li>Select "Use Scholarship Code"</li>
            <li>Enter your code: <strong>${code}</strong></li>
          </ol>
          
          ${notes ? `<p><em>Note: ${notes}</em></p>` : ''}
          
          <p>Best regards,<br/>The Team</p>
        `
      });
    } catch (emailError) {
      console.error('Failed to send scholarship email:', emailError);
      // Continue even if email fails
    }
  }

  res.status(201).json({
    success: true,
    message: "Scholarship created successfully",
    data: scholarship
  });
});

// ======================================================
// GET ALL SCHOLARSHIPS
// ======================================================
export const getAllScholarships = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, programId, page = '1', limit = '20' } = req.query;

  const filter: any = {};
  if (status) filter.status = status;
  if (programId) filter.programId = programId;

  const total = await Scholarship.countDocuments(filter);

  const scholarships = await Scholarship.find(filter)
    .populate('programId', 'title price currency')
    .populate('usedBy', 'firstName lastName email')
    .populate('createdBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string));

  res.status(200).json({
    success: true,
    count: scholarships.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: scholarships
  });
});

// ======================================================
// GET SINGLE SCHOLARSHIP
// ======================================================
export const getScholarshipById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const scholarship = await Scholarship.findById(id)
    .populate('programId', 'title price currency')
    .populate('usedBy', 'firstName lastName email')
    .populate('createdBy', 'firstName lastName');

  if (!scholarship) {
    res.status(404).json({ success: false, error: "Scholarship not found" });
    return;
  }

  res.status(200).json({ success: true, data: scholarship });
});

// ======================================================
// UPDATE SCHOLARSHIP
// ======================================================
export const updateScholarship = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, expiresAt, notes } = req.body;

  const scholarship = await Scholarship.findById(id);

  if (!scholarship) {
    res.status(404).json({ success: false, error: "Scholarship not found" });
    return;
  }

  // Don't allow updating used scholarships
  if (scholarship.status === ScholarshipStatus.USED) {
    res.status(400).json({ 
      success: false, 
      error: "Cannot modify a scholarship that has already been used" 
    });
    return;
  }

  if (status) scholarship.status = status;
  if (expiresAt !== undefined) scholarship.expiresAt = expiresAt ? new Date(expiresAt) : undefined;
  if (notes !== undefined) scholarship.notes = notes;

  await scholarship.save();

  res.status(200).json({
    success: true,
    message: "Scholarship updated successfully",
    data: scholarship
  });
});

// ======================================================
// DELETE SCHOLARSHIP
// ======================================================
export const deleteScholarship = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const scholarship = await Scholarship.findById(id);

  if (!scholarship) {
    res.status(404).json({ success: false, error: "Scholarship not found" });
    return;
  }

  // Don't allow deleting used scholarships
  if (scholarship.status === ScholarshipStatus.USED) {
    res.status(400).json({ 
      success: false, 
      error: "Cannot delete a scholarship that has been used. Consider revoking it instead." 
    });
    return;
  }

  await scholarship.deleteOne();

  res.status(200).json({
    success: true,
    message: "Scholarship deleted successfully"
  });
});

// ======================================================
// GET SCHOLARSHIP STATISTICS
// ======================================================
export const getScholarshipStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { programId } = req.query;

  const filter: any = {};
  if (programId) filter.programId = programId;

  const totalScholarships = await Scholarship.countDocuments(filter);
  const activeScholarships = await Scholarship.countDocuments({ ...filter, status: ScholarshipStatus.ACTIVE });
  const usedScholarships = await Scholarship.countDocuments({ ...filter, status: ScholarshipStatus.USED });
  const expiredScholarships = await Scholarship.countDocuments({ ...filter, status: ScholarshipStatus.EXPIRED });
  const revokedScholarships = await Scholarship.countDocuments({ ...filter, status: ScholarshipStatus.REVOKED });

  // Calculate total discount given
  const usedScholarshipsData = await Scholarship.find({ ...filter, status: ScholarshipStatus.USED })
    .populate('programId', 'price');

  let totalDiscountValue = 0;
  usedScholarshipsData.forEach(scholarship => {
    const program = scholarship.programId as any;
    if (program && program.price) {
      if (scholarship.discountType === DiscountType.PERCENTAGE) {
        totalDiscountValue += (program.price * scholarship.discountValue) / 100;
      } else {
        totalDiscountValue += Math.min(scholarship.discountValue, program.price);
      }
    }
  });

  res.status(200).json({
    success: true,
    data: {
      total: totalScholarships,
      active: activeScholarships,
      used: usedScholarships,
      expired: expiredScholarships,
      revoked: revokedScholarships,
      utilizationRate: totalScholarships > 0 
        ? Math.round((usedScholarships / totalScholarships) * 100) 
        : 0,
      totalDiscountValue: Math.round(totalDiscountValue * 100) / 100
    }
  });
});

// ======================================================
// BULK CREATE SCHOLARSHIPS
// ======================================================
export const bulkCreateScholarships = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { programId, quantity, discountType, discountValue, expiresAt, notes } = req.body;

  if (!programId || !quantity || !discountType || discountValue === undefined) {
    res.status(400).json({ 
      success: false, 
      error: "programId, quantity, discountType, and discountValue are required" 
    });
    return;
  }

  if (quantity < 1 || quantity > 100) {
    res.status(400).json({ 
      success: false, 
      error: "Quantity must be between 1 and 100" 
    });
    return;
  }

  // Validate program exists
  const program = await Program.findById(programId);
  if (!program) {
    res.status(404).json({ success: false, error: "Program not found" });
    return;
  }

  // Generate scholarships
  const scholarships = [];
  for (let i = 0; i < quantity; i++) {
    const code = (Scholarship as any).generateCode('SCHOLAR');
    scholarships.push({
      code,
      programId,
      discountType,
      discountValue,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      createdBy: req.user._id,
      notes: notes || `Bulk generated scholarship ${i + 1}/${quantity}`
    });
  }

  const createdScholarships = await Scholarship.insertMany(scholarships);

  res.status(201).json({
    success: true,
    message: `${quantity} scholarships created successfully`,
    count: createdScholarships.length,
    data: createdScholarships
  });
});