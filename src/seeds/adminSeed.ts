// ============================================
// scripts/seedUsers.ts
// ============================================
// Seeds an admin and an instructor user.
//
// WHY .create() and not .insertMany()?
// ------------------------------------
// Your User model almost certainly has a pre('save') hook that
// hashes the password with bcrypt before writing to the DB.
// .insertMany() bypasses ALL Mongoose middleware — the document
// goes straight to MongoDB with the plain-text password, so
// matchPassword() can never succeed.
//
// .create() calls .save() under the hood, which triggers the
// hook and stores a proper bcrypt hash.
// ============================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User, UserRole, UserStatus } from '../models/user';

dotenv.config();

// ============================================
// Credentials — change these to whatever you
// actually type into the login form.
// ============================================
const SEED_USERS = [
  {
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@example.com',
    password: 'Admin123!',          // ← this is what you type to log in
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  },
  {
    firstName: 'Instructor',
    lastName: 'Demo',
    email: 'instructor@example.com',
    password: 'Instructor123!',     // ← this is what you type to log in
    role: UserRole.INSTRUCTOR,
    status: UserStatus.ACTIVE,
  },
];

const seedUsers = async () => {
  try {
    console.log('🚀 Starting user seed...\n');

    const MONGO_URI = process.env.MONGODB_URI;
    if (!MONGO_URI) {
      console.error('❌ MONGODB_URI is not set in .env');
      process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    for (const seedData of SEED_USERS) {
      // Check if user already exists
      const existing = await User.findOne({ email: seedData.email });

      if (existing) {
        console.log(`⚠️  User "${seedData.email}" already exists.`);

        // Option A: skip entirely
        // console.log('   Skipping.\n');
        // continue;

        // Option B: delete and recreate so the password hash refreshes
        await User.deleteOne({ _id: existing._id });
        console.log('   Deleted old record — recreating with fresh hash.\n');
      }

      // .create() triggers the pre('save') hook → password gets hashed
      const user = await User.create({
        firstName: seedData.firstName,
        lastName: seedData.lastName,
        email: seedData.email,
        password: seedData.password,   // pre-save hook hashes this
        role: seedData.role,
        status: seedData.status,
      });

      console.log(`✅ Created: ${user.email}`);
      console.log(`   Name : ${user.firstName} ${user.lastName}`);
      console.log(`   Role : ${user.role}`);
      console.log(`   Login: email = "${seedData.email}" / password = "${seedData.password}"\n`);
    }

    // Quick sanity check: read one user back and verify the hash exists
    const check = await User.findOne({ email: SEED_USERS[0].email }).select('+password');
    if (check) {
      const looksHashed = check.password && check.password.startsWith('$2');
      console.log('🔐 Password hash check:');
      console.log(`   Hash starts with $2 (bcrypt): ${looksHashed ? '✅ YES' : '❌ NO — hook did not fire!'}`);
      if (!looksHashed) {
        console.log('   ⚠️  Your User model may be missing a pre-save hook.');
        console.log('   Add this to your schema:\n');
        console.log('     userSchema.pre("save", async function (next) {');
        console.log('       if (!this.isModified("password")) return next();');
        console.log('       this.password = await bcrypt.hash(this.password, 10);');
        console.log('       next();');
        console.log('     });\n');
      }
    }

    console.log('='.repeat(50));
    console.log('🎉 User seed complete!\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
};

seedUsers();