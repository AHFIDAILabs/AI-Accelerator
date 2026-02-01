import 'dotenv/config'

import mongoose from "mongoose";
import { Program } from "../models/program";
import { User, UserRole } from "../models/user";


/**
 * QUICK PROGRAM SEEDER
 * This creates minimal programs without courses for quick testing
 * Run this if you just need programs to appear on the frontend
 */

const quickSeed = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/learning-platform";
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Find or create admin
    let admin = await User.findOne({ role: UserRole.ADMIN });
    if (!admin) {
      admin = await User.create({
        firstName: "Admin",
        lastName: "Seed",
        email: "admin@seed.com",
        password: "hashedpass",
        role: UserRole.ADMIN,
        isEmailVerified: true,
      });
    }

    // Clear existing
    await Program.deleteMany({});
    console.log("🗑️  Cleared existing programs");

    // Quick programs
    const programs = [
       {
        title: "AI Accelerator Program",
        slug: "ai-accelerator-program",
        description: "Master the Future of Artificial Intelligence with Our Comprehensive AI Accelerator Program.",
        category: "Artificial Intelligence",
        tags: ["Python", "ML", "AI", "Deep Learning"],
        courses: [],
        estimatedHours: 250,
        price: 299000,
        currency: "NGN",
        coverImage: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800",
        isPublished: true,
        isSelfPaced: true,
        createdBy: admin._id,
        instructors: [admin._id],
        approvalStatus: "approved" as const,
      },
      {
        title: "AI & Machine Learning Engineering",
        slug: "ai-machine-learning-engineering",
        description: "Master AI and ML from fundamentals to production deployment",
        category: "Artificial Intelligence",
        tags: ["Python", "ML", "AI", "Deep Learning"],
        courses: [],
        estimatedHours: 250,
        price: 299000,
        currency: "NGN",
        coverImage: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800",
        isPublished: true,
        isSelfPaced: true,
        createdBy: admin._id,
        instructors: [admin._id],
        approvalStatus: "approved" as const,
      },
      {
        title: "Full-Stack Web Development",
        slug: "full-stack-web-development",
        description: "Build modern web applications from frontend to backend",
        category: "Web Development",
        tags: ["JavaScript", "React", "Node.js"],
        courses: [],
        estimatedHours: 185,
        price: 249000,
        currency: "NGN",
        coverImage: "https://images.unsplash.com/photo-1627398242454-45a1465c2479?w=800",
        isPublished: true,
        isSelfPaced: true,
        createdBy: admin._id,
        instructors: [admin._id],
        approvalStatus: "approved" as const,
      },
      {
        title: "Data Science Professional",
        slug: "data-science-professional",
        description: "Transform data into insights with Python and ML",
        category: "Data Science",
        tags: ["Python", "Data Analysis", "Statistics"],
        courses: [],
        estimatedHours: 125,
        price: 199000,
        currency: "NGN",
        coverImage: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800",
        isPublished: true,
        isSelfPaced: true,
        createdBy: admin._id,
        instructors: [admin._id],
        approvalStatus: "approved" as const,
      },
      {
        title: "Mobile App Development",
        slug: "mobile-app-development",
        description: "Build cross-platform mobile apps with React Native",
        category: "Mobile Development",
        tags: ["React Native", "Mobile", "iOS", "Android"],
        courses: [],
        estimatedHours: 120,
        price: 0,
        currency: "NGN",
        coverImage: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800",
        isPublished: true,
        isSelfPaced: true,
        createdBy: admin._id,
        instructors: [admin._id],
        approvalStatus: "approved" as const,
      },
    ];

    await Program.insertMany(programs);
    console.log(`✅ Created ${programs.length} programs`);
    console.log("\n🎉 Quick seed completed!");
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

quickSeed();