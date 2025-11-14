import prisma from './src/utils/prisma.js';

async function testSpecificStudent() {
  try {
    console.log('Testing specific student: 23ce122');
    
    // Find student by ugcId
    const student = await prisma.student.findFirst({
      where: {
        ugcId: '23ce122'
      },
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
      console.log('Student with ID 23ce122 not found.');
      return;
    }

    console.log(`Found student ID: ${student.id}, ugcId: ${student.ugcId}`);
    
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
        dlUsed += 1; // DL counted by applications
      } else if (leave.leaveType === 'LWP') {
        lwpUsed += days; // LWP counted by days
      }
    }
    
    const totalCL = 30;
    const remainingCL = Math.max(0, totalCL - clUsedDays);
    
    console.log('\nManual Calculation Results:');
    console.log(`CL Used Days: ${clUsedDays}`);
    console.log(`CL Remaining: ${remainingCL}`);
    console.log(`CL Balance: ${remainingCL}/${totalCL}`);
    console.log(`DL Used (applications): ${dlUsed}`);
    console.log(`LWP Used (days): ${lwpUsed}`);
    
    console.log('\nExpected Results (based on your input):');
    console.log('CL: 4 days');
    console.log('DL: 2 applications');
    console.log('LWP: 3 days');
    
    console.log('\nCurrent Calculation vs Expected:');
    console.log(`CL: ${clUsedDays} vs 4 (${clUsedDays === 4 ? '✓' : '✗'})`);
    console.log(`DL: ${dlUsed} vs 2 (${dlUsed === 2 ? '✓' : '✗'})`);
    console.log(`LWP: ${lwpUsed} vs 3 (${lwpUsed === 3 ? '✓' : '✗'})`);
    
  } catch (error) {
    console.error('Error testing specific student:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSpecificStudent();
