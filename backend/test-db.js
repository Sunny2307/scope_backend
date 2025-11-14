import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function testDatabaseConnection() {
  try {
    console.log('Testing database connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    await prisma.$connect();
    console.log('✅ Successfully connected to the database');
    
    // Test a simple query
    const userCount = await prisma.user.count();
    console.log(`✅ Database is working. User count: ${userCount}`);
    
    await prisma.$disconnect();
    console.log('✅ Disconnected from database');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Please check your DATABASE_URL in the .env file');
    console.error('Make sure the database server is running and accessible');
  }
}

testDatabaseConnection(); 