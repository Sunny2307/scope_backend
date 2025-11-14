import prisma from './src/utils/prisma.js';

async function testLeaveConsistency() {
  try {
    console.log('Testing leave calculation consistency...');
    
    // Get a sample student with leaves
    const student = await prisma.student.findFirst({
      include: {
        leaves: {
          where: {
            status: 'APPROVED'
          },
          orderBy: { applicationDate: 'desc' }
        }
      }
    });

    if (!student) {
      console.log('No students with approved leaves found.');
      return;
    }

    console.log(`Testing for student ID: ${student.id}`);
    
    // Calculate manually using the same logic as the functions
    const msPerDay = 1000 * 60 * 60 * 24;
    const durationDays = (start, end) => 1 + Math.floor((new Date(end) - new Date(start)) / msPerDay);
    
    let clUsedDays = 0;
    let dlUsed = 0;
    let lwpUsed = 0;
    
    console.log('\nApproved Leaves:');
    for (const leave of student.leaves) {
      const days = durationDays(leave.startDate, leave.endDate);
      console.log(`${leave.leaveType}: ${leave.startDate} to ${leave.endDate} = ${days} days`);
      
      if (leave.leaveType === 'CL') {
        clUsedDays += days;
      } else if (leave.leaveType === 'DL') {
        dlUsed += 1;
      } else if (leave.leaveType === 'LWP') {
        lwpUsed += 1;
      }
    }
    
    const totalCL = 30;
    const remainingCL = Math.max(0, totalCL - clUsedDays);
    
    console.log('\nManual Calculation Results:');
    console.log(`CL Used Days: ${clUsedDays}`);
    console.log(`CL Remaining: ${remainingCL}`);
    console.log(`CL Balance: ${remainingCL}/${totalCL}`);
    console.log(`DL Used: ${dlUsed}`);
    console.log(`LWP Used: ${lwpUsed}`);
    
    console.log('\nExpected API Results:');
    console.log('getLeaveSummary should return:');
    console.log(`CL: { balance: "${remainingCL}/${totalCL}" }`);
    console.log(`DL: { balance: "${dlUsed}" }`);
    console.log(`LWP: { balance: "${lwpUsed}" }`);
    
    console.log('\ngetEnjoyedLeaves should return:');
    console.log(`CL Used: ${clUsedDays}/30`);
    console.log(`DL Used: ${dlUsed}`);
    console.log(`LWP Used: ${lwpUsed}`);
    
  } catch (error) {
    console.error('Error testing leave consistency:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testLeaveConsistency();

