import prisma from './src/utils/prisma.js';

async function checkAndUpdateCLLeaves() {
  try {
    console.log('Checking CL leaves status...');
    
    // Get all students
    const students = await prisma.student.findMany({
      include: {
        leaves: {
          where: {
            leaveType: 'CL',
            status: 'APPROVED'
          }
        }
      }
    });

    for (const student of students) {
      const totalCL = 30;
      let usedCL = 0;
      
      // Calculate used CL leaves by days
      for (const leave of student.leaves) {
        const msPerDay = 1000 * 60 * 60 * 24;
        const durationDays = 1 + Math.floor((new Date(leave.endDate) - new Date(leave.startDate)) / msPerDay);
        usedCL += durationDays;
      }
      
      const remainingCL = Math.max(0, totalCL - usedCL);
      
      console.log(`Student ${student.id}: Used CL Days: ${usedCL}, Remaining CL: ${remainingCL}, Current DB value: ${student.clLeavesRemaining}`);
      
      // Update if different (though this field is now calculated dynamically)
      if (student.clLeavesRemaining !== remainingCL) {
        await prisma.student.update({
          where: { id: student.id },
          data: { clLeavesRemaining: remainingCL }
        });
        console.log(`Updated student ${student.id} CL leaves remaining to ${remainingCL}`);
      }
    }
    
    console.log('CL leaves check completed!');
    console.log('Note: CL leaves are now calculated dynamically based on approved leave days.');
  } catch (error) {
    console.error('Error checking CL leaves:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndUpdateCLLeaves();
