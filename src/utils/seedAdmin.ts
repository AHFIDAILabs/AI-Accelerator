import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User, UserRole, UserStatus } from '../models/user';

dotenv.config();

const seedAdmin = async (): Promise<void> => {
  try {
    // Connect to database
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-accelerator';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@aiaccelerator.com';
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log('ℹ️  Admin user already exists');
      console.log(`📧 Email: ${existingAdmin.email}`);
      process.exit(0);
    }

    // Create admin user
    const adminData = {
      firstName: process.env.ADMIN_FIRST_NAME || 'Super',
      lastName: process.env.ADMIN_LAST_NAME || 'Admin',
      email: adminEmail,
      password: process.env.ADMIN_PASSWORD || 'Admin@12345',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    };

    const admin = await User.create(adminData);

    console.log('✅ Admin user created successfully!');
    console.log('\n📋 Admin Credentials:');
    console.log(`📧 Email: ${admin.email}`);
    console.log(`🔑 Password: ${adminData.password}`);
    console.log(`👤 Name: ${admin.firstName} ${admin.lastName}`);
    console.log('\n⚠️  Please change the password after first login!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();