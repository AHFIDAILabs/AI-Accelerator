// ============================================
// scripts/addSlugsToExistingCourses.ts
// ============================================
// Migration script to add slugs to existing courses that don't have them

import mongoose from 'mongoose';
import { Course } from '../models/Course';

/**
 * Generate a URL-friendly slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Ensure slug is unique by appending a number if necessary
 */
async function ensureUniqueSlug(baseSlug: string, courseId?: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const query: any = { slug };
    if (courseId) {
      query._id = { $ne: courseId };
    }

    const existing = await Course.findOne(query);
    
    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

/**
 * Main migration function
 */
async function addSlugsToExistingCourses() {
  try {
    console.log('🚀 Starting migration: Adding slugs to existing courses...\n');

    // Connect to MongoDB
    const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lms';
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all courses without slugs
    const coursesWithoutSlugs = await Course.find({
      $or: [
        { slug: { $exists: false } },
        { slug: null },
        { slug: '' }
      ]
    });

    console.log(`📊 Found ${coursesWithoutSlugs.length} courses without slugs\n`);

    if (coursesWithoutSlugs.length === 0) {
      console.log('✨ All courses already have slugs. Nothing to migrate.\n');
      await mongoose.connection.close();
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Process each course
    for (const course of coursesWithoutSlugs) {
      try {
        // Generate base slug from title
        const baseSlug = generateSlug(course.title);
        
        // Ensure uniqueness
        const uniqueSlug = await ensureUniqueSlug(baseSlug, course._id.toString());
        
        // Update course
        course.slug = uniqueSlug;
        await course.save();
        
        successCount++;
        console.log(`✅ [${successCount}/${coursesWithoutSlugs.length}] "${course.title}" → "${uniqueSlug}"`);
      } catch (error: any) {
        errorCount++;
        console.error(`❌ Error processing "${course.title}":`, error.message);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`📈 Migration Complete!`);
    console.log(`   ✅ Success: ${successCount} courses`);
    console.log(`   ❌ Errors: ${errorCount} courses`);
    console.log('='.repeat(50) + '\n');

    // Close connection
    await mongoose.connection.close();
    console.log('👋 Database connection closed\n');

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  addSlugsToExistingCourses()
    .then(() => {
      console.log('🎉 Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

export { addSlugsToExistingCourses, generateSlug, ensureUniqueSlug };