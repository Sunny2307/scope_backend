import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function connectToDatabase() {
  try {
    await prisma.$connect();
    console.log('Successfully connected to the database');
  } catch (error) {
    console.error('Failed to connect to the database:', error.message);
    console.error('Please check your DATABASE_URL in the .env file');
    console.error('Make sure the database server is running and accessible');
    process.exit(1); // Exit with error code
  }
}

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

connectToDatabase();

export default prisma;