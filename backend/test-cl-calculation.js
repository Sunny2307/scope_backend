import prisma from './src/utils/prisma.js';

async function testCLCalculation() {
  try {
    console.log('Testing CL leave calculation...');
    
    // Get a sample student with leaves
    const student = await prisma.student.findFirst({
      include: {
        leaves: {
          where: {
            leaveType: 'CL',
            status: 'APPROVED'
          }
        }
      }
    });

    if (!student) {
      console.log('No students with approved CL leaves found.');
      return;
    }

    console.log(`Testing for student ID: ${student.id}`);
    
    // Calculate CL leaves by days
    const totalCL = 30;
    let usedCLDays = 0;
    
    for (const leave of student.leaves) {
      const msPerDay = 1000 * 60 * 60 * 24;
      const durationDays = 1 + Math.floor((new Date(leave.endDate) - new Date(leave.startDate)) / msPerDay);
      usedCLDays += durationDays;
      
      console.log(`Leave ${leave.id}: ${leave.startDate} to ${leave.endDate} = ${durationDays} days`);
    }
    
    const remainingCL = Math.max(0, totalCL - usedCLDays);
    
    console.log('\nResults:');
    console.log(`Total CL leaves: ${totalCL}`);
    console.log(`Used CL days: ${usedCLDays}`);
    console.log(`Remaining CL: ${remainingCL}`);
    console.log(`Balance display: ${remainingCL}/${totalCL}`);
    
  } catch (error) {
    console.error('Error testing CL calculation:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCLCalculation();

