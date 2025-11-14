import prisma from '../utils/prisma.js';

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const toDateStart = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const differenceInDaysInclusive = (start, end) => {
  const startDate = toDateStart(start);
  const endDate = toDateStart(end);
  if (endDate < startDate) return 0;
  return Math.floor((endDate - startDate) / DAY_IN_MS) + 1;
};

const computeCLOverflowSegments = (clLeaves, allowance = 30) => {
  let remainingAllowance = allowance;
  const overflowSegments = [];
  const sortedLeaves = [...clLeaves].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  for (const leave of sortedLeaves) {
    const start = toDateStart(leave.startDate);
    const end = toDateStart(leave.endDate);
    const duration = differenceInDaysInclusive(start, end);

    const allocatable = Math.min(duration, Math.max(remainingAllowance, 0));
    remainingAllowance -= allocatable;

    const overflowDays = duration - allocatable;
    if (overflowDays > 0) {
      const overflowStart = addDays(start, allocatable);
      overflowSegments.push({
        startDate: overflowStart,
        endDate: end,
        days: overflowDays,
      });
    }
  }

  return overflowSegments;
};

// Get all students with their leave data for dean dashboard
export const getAllStudentsWithLeaves = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        guide: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        profile: {
          select: {
            nameOfGuide: true
          }
        },
        leaves: {
          select: {
            id: true,
            leaveType: true,
            startDate: true,
            endDate: true,
            status: true,
            applicationDate: true
          }
        }
      }
    });

    // Process the data to calculate leave statistics using EXACT same logic as report generation
    const processedStudents = await Promise.all(
      students.map(async (student) => {
        // Get ALL leaves for this student (like report generation does)
        const allLeaves = await prisma.leave.findMany({
          where: { studentId: student.id },
          select: {
            leaveType: true,
            startDate: true,
            endDate: true,
            status: true,
          },
          orderBy: [{ startDate: 'asc' }],
        });

        // Calculate CL, DL, LWP using EXACT same logic as report generation
        let approvedDLCount = 0;
        let approvedLwpDays = 0;
        const approvedCLLeaves = [];

        for (const leave of allLeaves) {
          const safeType = String(leave.leaveType || '').toUpperCase().trim();
          const type = ['CL', 'DL', 'LWP'].includes(safeType) ? safeType : null;
          if (!type) continue;

          const duration = differenceInDaysInclusive(leave.startDate, leave.endDate);

          if (leave.status === 'APPROVED') {
            if (type === 'CL') {
              approvedCLLeaves.push({
                startDate: leave.startDate,
                endDate: leave.endDate,
              });
            } else if (type === 'LWP') {
              approvedLwpDays += duration;
            } else if (type === 'DL') {
              approvedDLCount += 1;
            }
          }
        }

        // Calculate CL overflow (EXACT same as report generation)
        const clOverflowSegments = computeCLOverflowSegments(approvedCLLeaves, 30);
        const totalOverflowDays = clOverflowSegments.reduce((sum, segment) => sum + segment.days, 0);
        const totalApprovedCLDays = approvedCLLeaves.reduce(
          (sum, leave) => sum + differenceInDaysInclusive(leave.startDate, leave.endDate),
          0
        );
        const clAllocatedDays = Math.min(30, Math.max(0, totalApprovedCLDays - totalOverflowDays));
        const totalLwpDays = approvedLwpDays + totalOverflowDays;

        // CL taken is the allocated days (up to 30, overflow goes to LWP)
        // This is the CL that counts towards the 30-day limit
        const clTaken = clAllocatedDays;
        // DL is counted as number of leaves, not days
        const dlTaken = approvedDLCount;
        // LWP includes both direct LWP and CL overflow
        const lwpTaken = totalLwpDays;

        // Format previous leaves for frontend (only approved leaves)
        const previousLeaves = allLeaves
          .filter(leave => leave.status === 'APPROVED')
          .map(leave => {
            const days = differenceInDaysInclusive(leave.startDate, leave.endDate);
            return {
              type: leave.leaveType,
              days: days,
              date: leave.startDate.toISOString().split('T')[0],
              status: leave.status,
              reason: 'N/A' // Reason is in remarks, not in leave table
            };
          });

        // Get student profile for scholarship calculation
        const studentWithProfile = await prisma.student.findUnique({
          where: { id: student.id },
          include: {
            profile: {
              select: {
                scholarshipAmount: true,
                contingencyAmount: true,
              },
            },
          },
        });

        // Calculate scholarship using same logic as student dashboard
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentMonthIndex = currentMonth - 1;
        const startOfMonth = new Date(currentYear, currentMonthIndex, 1, 0, 0, 0, 0);
        const endOfMonth = new Date(currentYear, currentMonthIndex + 1, 0, 23, 59, 59, 999);
        const daysInMonth = endOfMonth.getDate();
        const msPerDay = 1000 * 60 * 60 * 24;

        const overlappingDays = (startDate, endDate) => {
          const start = new Date(startDate);
          const end = new Date(endDate);
          const overlapStart = start > startOfMonth ? start : startOfMonth;
          const overlapEnd = end < endOfMonth ? end : endOfMonth;
          if (overlapEnd < overlapStart) return 0;
          const diff = Math.floor((overlapEnd - overlapStart) / msPerDay) + 1;
          return diff > 0 ? diff : 0;
        };

        // Calculate LWP days in current month (including CL overflow)
        const lwpLeavesInMonth = allLeaves.filter(leave => {
          const safeType = String(leave.leaveType || '').toUpperCase().trim();
          return safeType === 'LWP' && leave.status === 'APPROVED' &&
            leave.startDate <= endOfMonth && leave.endDate >= startOfMonth;
        });

        const lwpDaysFromRecords = lwpLeavesInMonth.reduce((total, leave) => {
          return total + overlappingDays(leave.startDate, leave.endDate);
        }, 0);

        const lwpDaysFromOverflow = clOverflowSegments.reduce((total, segment) => {
          return total + overlappingDays(segment.startDate, segment.endDate);
        }, 0);

        const lwpDaysInMonth = lwpDaysFromRecords + lwpDaysFromOverflow;

        // Get current month scholarship record
        const currentMonthScholarship = await prisma.scholarship.findFirst({
          where: {
            studentId: student.id,
            year: currentYear,
            month: currentMonth,
          },
          select: {
            baseAmount: true,
            lwpDeduction: true,
            finalAmount: true,
            contingencyAmount: true,
          },
          orderBy: { id: 'desc' },
        });

        // Determine base amount - same logic as getStudentScholarships
        const tryParse = (value) => {
          if (value === null || value === undefined) return null;
          const parsed = Number(value);
          return Number.isNaN(parsed) ? null : parsed;
        };

        const fromScholarship = tryParse(currentMonthScholarship?.baseAmount);
        const fromProfile = tryParse(studentWithProfile?.profile?.scholarshipAmount);
        const fromStudent = tryParse(student.scholarshipAmount);
        const baseAmount =
          fromScholarship && fromScholarship > 0
            ? fromScholarship
            : fromProfile && fromProfile > 0
            ? fromProfile
            : fromStudent && fromStudent > 0
            ? fromStudent
            : 30000;

        // Calculate LWP deduction - same logic as getStudentScholarships
        const perDayRate = daysInMonth > 0 ? baseAmount / daysInMonth : 0;
        const computedLwpDeduction = Number((perDayRate * lwpDaysInMonth).toFixed(2));
        const recordedLwpDeduction = Number(currentMonthScholarship?.lwpDeduction || 0);
        const lwpDeduction = computedLwpDeduction || recordedLwpDeduction || 0;

        // Calculate final amount - same logic as getStudentScholarships
        const finalAmountRecorded = Number(currentMonthScholarship?.finalAmount || 0);
        const finalAmountComputed = Math.max(0, Number((baseAmount - lwpDeduction).toFixed(2)));
        const finalAmount = finalAmountRecorded > 0 ? finalAmountRecorded : finalAmountComputed;

        return {
          id: student.id,
          name: student.user.name || 'Unknown',
          email: student.user.email,
          guideName: student.guide?.name || student.profile?.nameOfGuide || 'No Guide Assigned',
          department: student.department || 'Unknown',
          clTaken,
          clTotal: 30, // CL total is always 30
          dlTaken,
          dlTotal: 10, // Default DL total
          lwpTaken,
          lwpTotal: 0, // LWP has no limit
          totalLeaves: clTaken + dlTaken + lwpTaken,
          previousLeaves: previousLeaves,
          enrollmentYear: student.enrollmentYear,
          scholarshipType: student.scholarshipType,
          scholarshipAmount: student.scholarshipAmount,
          scholarshipCut: lwpDeduction, // Use calculated LWP deduction from current month
          finalAmount: finalAmount, // Final scholarship amount for current month
          baseAmount: baseAmount, // Base scholarship amount
          remainingCL: Math.max(0, 30 - clAllocatedDays), // Remaining CL based on allocated days
          remainingDL: 10 - dlTaken
        };
      })
    );

    res.status(200).json(processedStudents);
  } catch (error) {
    console.error('Error fetching students with leaves:', error);
    res.status(500).json({ error: 'Failed to fetch students data' });
  }
};

// Get monthly leave calendar aggregation for dean view
export const getMonthlyLeaveCalendar = async (req, res) => {
  try {
    const { year, month } = req.query;

    const numericYear = parseInt(year, 10);
    const numericMonth = parseInt(month, 10); // 1-12 expected

    if (
      Number.isNaN(numericYear) ||
      Number.isNaN(numericMonth) ||
      numericMonth < 1 ||
      numericMonth > 12
    ) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const monthStart = new Date(Date.UTC(numericYear, numericMonth - 1, 1, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(numericYear, numericMonth, 0, 23, 59, 59, 999)); // last day of month

    // Pre-fetch total students for donut denominator
    const totalStudents = await prisma.student.count();

    // Fetch approved leaves that overlap with the month range
    const leaves = await prisma.leave.findMany({
      where: {
        status: 'APPROVED',
        OR: [
          { AND: [{ startDate: { lte: monthEnd } }, { endDate: { gte: monthStart } }] },
        ],
      },
      select: {
        id: true,
        studentId: true,
        leaveType: true,
        startDate: true,
        endDate: true,
      },
    });

    // Build a map for each day in the month
    const daysInMonth = new Date(numericYear, numericMonth, 0).getDate();
    const dayStats = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      CL: 0,
      DL: 0,
      LWP: 0,
      total: 0,
      uniqueStudentIds: new Set(),
    }));

    const monthUniqueStudentIds = new Set();

    leaves.forEach((leave) => {
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);

      // Clamp to month range
      const rangeStart = leaveStart < monthStart ? monthStart : leaveStart;
      const rangeEnd = leaveEnd > monthEnd ? monthEnd : leaveEnd;

      // Iterate days overlapped within the month
      let cursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), rangeStart.getUTCDate()));
      const endUTC = new Date(Date.UTC(rangeEnd.getUTCFullYear(), rangeEnd.getUTCMonth(), rangeEnd.getUTCDate()));

      while (cursor <= endUTC) {
        const dayIndex = cursor.getUTCDate() - 1;
        const stat = dayStats[dayIndex];
        if (stat) {
          stat[leave.leaveType] = (stat[leave.leaveType] || 0) + 1;
          stat.total += 1;
          stat.uniqueStudentIds.add(leave.studentId);
          monthUniqueStudentIds.add(leave.studentId);
        }
        // advance by 1 day
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    });

    // Serialize sets
    const days = dayStats.map((s) => ({
      day: s.day,
      CL: s.CL,
      DL: s.DL,
      LWP: s.LWP,
      total: s.total,
      uniqueStudents: s.uniqueStudentIds.size,
    }));

    res.status(200).json({
      year: numericYear,
      month: numericMonth,
      days,
      monthUniqueAbsentStudents: monthUniqueStudentIds.size,
      totalStudents,
    });
  } catch (error) {
    console.error('Error fetching monthly leave calendar:', error);
    res.status(500).json({ error: 'Failed to fetch monthly leave calendar' });
  }
};

// Get students filtered by guide
export const getStudentsByGuide = async (req, res) => {
  const { guideId } = req.params;
  
  try {
    const students = await prisma.student.findMany({
      where: {
        guideId: guideId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        guide: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        profile: {
          select: {
            nameOfGuide: true
          }
        },
        leaves: {
          select: {
            id: true,
            leaveType: true,
            startDate: true,
            endDate: true,
            status: true
          }
        }
      }
    });

    // Process the data similar to getAllStudentsWithLeaves
    const processedStudents = students.map(student => {
      const clLeaves = student.leaves.filter(leave => leave.leaveType === 'CL');
      const dlLeaves = student.leaves.filter(leave => leave.leaveType === 'DL');
      const lwpLeaves = student.leaves.filter(leave => leave.leaveType === 'LWP');

      const clTaken = clLeaves.reduce((total, leave) => {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        return total + days;
      }, 0);

      const dlTaken = dlLeaves.reduce((total, leave) => {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        return total + days;
      }, 0);

      const lwpTaken = lwpLeaves.reduce((total, leave) => {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        return total + days;
      }, 0);

      return {
        id: student.id,
        name: student.user.name || 'Unknown',
        email: student.user.email,
        guideName: student.guide?.name || student.profile?.nameOfGuide || 'No Guide Assigned',
        department: student.department || 'Unknown',
        clTaken,
        clTotal: student.clLeavesRemaining + clTaken,
        dlTaken,
        dlTotal: 10,
        lwpTaken,
        lwpTotal: 0,
        totalLeaves: clTaken + dlTaken + lwpTaken
      };
    });

    res.status(200).json(processedStudents);
  } catch (error) {
    console.error('Error fetching students by guide:', error);
    res.status(500).json({ error: 'Failed to fetch students by guide' });
  }
};

// Get all guides for filter dropdown
export const getAllGuides = async (req, res) => {
  try {
    const guides = await prisma.user.findMany({
      where: {
        role: 'GUIDE'
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    res.status(200).json(guides);
  } catch (error) {
    console.error('Error fetching guides:', error);
    res.status(500).json({ error: 'Failed to fetch guides' });
  }
};

// Get leave statistics for dean dashboard
export const getLeaveStatistics = async (req, res) => {
  try {
    const totalStudents = await prisma.student.count();
    
    const studentsWithLeaves = await prisma.student.findMany({
      include: {
        leaves: {
          select: {
            leaveType: true,
            startDate: true,
            endDate: true,
            status: true
          }
        }
      }
    });

    // Calculate statistics
    let highClUsage = 0;
    let activeLwp = 0;
    let totalLeavesUsed = 0;

    studentsWithLeaves.forEach(student => {
      const clLeaves = student.leaves.filter(leave => leave.leaveType === 'CL');
      const lwpLeaves = student.leaves.filter(leave => leave.leaveType === 'LWP');
      
      const clTaken = clLeaves.reduce((total, leave) => {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        return total + days;
      }, 0);

      const lwpTaken = lwpLeaves.reduce((total, leave) => {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        return total + days;
      }, 0);

      const clTotal = student.clLeavesRemaining + clTaken;
      const clPercentage = clTotal > 0 ? (clTaken / clTotal) * 100 : 0;

      if (clPercentage >= 80) {
        highClUsage++;
      }

      if (lwpTaken > 0) {
        activeLwp++;
      }

      totalLeavesUsed += clTaken + lwpTaken;
    });

    const avgLeaveUsage = totalStudents > 0 ? Math.round(totalLeavesUsed / totalStudents) : 0;

    res.status(200).json({
      totalStudents,
      highClUsage,
      activeLwp,
      avgLeaveUsage,
      totalLeavesUsed
    });
  } catch (error) {
    console.error('Error fetching leave statistics:', error);
    res.status(500).json({ error: 'Failed to fetch leave statistics' });
  }
};

// Get monthly report for all students (for dean) - same as operator
export const getDeanMonthlyReport = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const verificationToken = await prisma.verification_Token.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!verificationToken || !verificationToken.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = verificationToken.user;
    if (user.role !== 'DEAN') {
      return res.status(403).json({ error: 'Access denied. Only deans can view monthly reports.' });
    }

    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    const numericYear = parseInt(year, 10);
    const numericMonth = parseInt(month, 10);
    if (isNaN(numericYear) || isNaN(numericMonth) || numericMonth < 1 || numericMonth > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const monthIndex = numericMonth - 1;
    const startOfMonth = new Date(numericYear, monthIndex, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(numericYear, monthIndex + 1, 0, 23, 59, 59, 999);
    const daysInMonth = new Date(numericYear, monthIndex + 1, 0).getDate();
    const msPerDay = 1000 * 60 * 60 * 24;

    // Helper: calculate overlapping days within the selected month
    const overlappingDays = (startDate, endDate) => {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const overlapStart = start > startOfMonth ? start : startOfMonth;
      const overlapEnd = end < endOfMonth ? end : endOfMonth;

      if (overlapEnd < overlapStart) return 0;
      const diff = Math.floor((overlapEnd - overlapStart) / msPerDay) + 1;
      return diff > 0 ? diff : 0;
    };

    // Get all approved students
    const students = await prisma.student.findMany({
      where: {
        user: {
          role: 'STUDENT',
          isApproved: true,
          isActive: true,
        },
      },
      select: {
        id: true,
        userId: true,
        department: true,
        scholarshipAmount: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        profile: {
          select: {
            scholarshipAmount: true,
            contingencyAmount: true,
            ugcId: true,
          },
        },
        leaves: {
          where: {
            status: 'APPROVED',
            OR: [
              {
                AND: [
                  { startDate: { lte: endOfMonth } },
                  { endDate: { gte: startOfMonth } },
                ],
              },
            ],
          },
          select: {
            leaveType: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
      },
      orderBy: {
        user: {
          name: 'asc',
        },
      },
    });

    // Process each student - use EXACT same calculation as operator report
    const reportData = await Promise.all(
      students.map(async (student) => {
        // Get ALL leaves for this student (like getLeaveSummary does)
        const allLeaves = await prisma.leave.findMany({
          where: { studentId: student.id },
          select: {
            leaveType: true,
            startDate: true,
            endDate: true,
            status: true,
          },
          orderBy: [{ startDate: 'asc' }],
        });

        // Calculate CL, DL, LWP using EXACT same logic as getLeaveSummary
        let approvedDLCount = 0;
        let approvedLwpDays = 0;
        const approvedCLLeaves = [];

        for (const leave of allLeaves) {
          const safeType = String(leave.leaveType || '').toUpperCase().trim();
          const type = ['CL', 'DL', 'LWP'].includes(safeType) ? safeType : null;
          if (!type) continue;

          const duration = differenceInDaysInclusive(leave.startDate, leave.endDate);

          if (leave.status === 'APPROVED') {
            if (type === 'CL') {
              approvedCLLeaves.push({
                startDate: leave.startDate,
                endDate: leave.endDate,
              });
            } else if (type === 'LWP') {
              approvedLwpDays += duration;
            } else if (type === 'DL') {
              approvedDLCount += 1;
            }
          }
        }

        // Calculate CL overflow (EXACT same as getLeaveSummary)
        const clOverflowSegments = computeCLOverflowSegments(approvedCLLeaves, 30);
        const totalOverflowDays = clOverflowSegments.reduce((sum, segment) => sum + segment.days, 0);
        const totalApprovedCLDays = approvedCLLeaves.reduce(
          (sum, leave) => sum + differenceInDaysInclusive(leave.startDate, leave.endDate),
          0
        );
        const clAllocatedDays = Math.min(30, Math.max(0, totalApprovedCLDays - totalOverflowDays));
        const totalLwpDays = approvedLwpDays + totalOverflowDays;

        // Calculate CL days in the selected month (for monthly report)
        const clDaysInMonth = approvedCLLeaves.reduce((total, leave) => {
          return total + overlappingDays(leave.startDate, leave.endDate);
        }, 0);

        // Calculate DL leaves in the selected month
        const dlLeavesInMonth = allLeaves.filter(leave => {
          const safeType = String(leave.leaveType || '').toUpperCase().trim();
          return safeType === 'DL' && leave.status === 'APPROVED' &&
            leave.startDate <= endOfMonth && leave.endDate >= startOfMonth;
        });
        const dlDays = dlLeavesInMonth.length;

        // Calculate LWP days in the selected month (EXACT same as getStudentScholarships)
        const lwpLeavesInMonth = allLeaves.filter(leave => {
          const safeType = String(leave.leaveType || '').toUpperCase().trim();
          return safeType === 'LWP' && leave.status === 'APPROVED' &&
            leave.startDate <= endOfMonth && leave.endDate >= startOfMonth;
        });

        const lwpDaysFromRecords = lwpLeavesInMonth.reduce((total, leave) => {
          return total + overlappingDays(leave.startDate, leave.endDate);
        }, 0);

        const lwpDaysFromOverflow = clOverflowSegments.reduce((total, segment) => {
          return total + overlappingDays(segment.startDate, segment.endDate);
        }, 0);

        const lwpDaysInMonth = lwpDaysFromRecords + lwpDaysFromOverflow;

        // Get student with profile for scholarship calculation (EXACT same as getStudentScholarships)
        const studentWithProfile = await prisma.student.findUnique({
          where: { id: student.id },
          include: {
            profile: {
              select: {
                scholarshipAmount: true,
                contingencyAmount: true,
              },
            },
          },
        });

        // Get scholarship record for the month (EXACT same as getStudentScholarships)
        const scholarship = await prisma.scholarship.findFirst({
          where: {
            studentId: student.id,
            year: numericYear,
            month: numericMonth,
          },
          select: {
            baseAmount: true,
            lwpDeduction: true,
            finalAmount: true,
            contingencyAmount: true,
          },
          orderBy: { id: 'desc' },
        });

        // Determine base amount - EXACT same logic as getStudentScholarships
        const tryParse = (value) => {
          if (value === null || value === undefined) return null;
          const parsed = Number(value);
          return Number.isNaN(parsed) ? null : parsed;
        };

        const fromScholarship = tryParse(scholarship?.baseAmount);
        const fromProfile = tryParse(studentWithProfile?.profile?.scholarshipAmount);
        const fromStudent = tryParse(student.scholarshipAmount);
        const baseAmount =
          fromScholarship && fromScholarship > 0
            ? fromScholarship
            : fromProfile && fromProfile > 0
            ? fromProfile
            : fromStudent && fromStudent > 0
            ? fromStudent
            : 30000;

        // Calculate LWP deduction - EXACT same logic as getStudentScholarships
        const perDayRate = daysInMonth > 0 ? baseAmount / daysInMonth : 0;
        const computedLwpDeduction = Number((perDayRate * lwpDaysInMonth).toFixed(2));
        const recordedLwpDeduction = Number(scholarship?.lwpDeduction || 0);
        const lwpDeduction = computedLwpDeduction || recordedLwpDeduction || 0;

        // Calculate final amount - EXACT same logic as getStudentScholarships
        const finalAmountRecorded = Number(scholarship?.finalAmount || 0);
        const finalAmountComputed = Math.max(0, Number((baseAmount - lwpDeduction).toFixed(2)));
        const finalAmount = finalAmountRecorded > 0 ? finalAmountRecorded : finalAmountComputed;

        return {
          studentId: student.id,
          name: student.user.name || 'Unknown',
          email: student.user.email,
          ugcId: student.profile?.ugcId || 'N/A',
          department: student.department || 'Unknown',
          clDays: clDaysInMonth,
          dlDays: dlDays,
          lwpDays: lwpDaysInMonth,
          baseAmount,
          lwpDeduction,
          finalAmount,
        };
      })
    );

    res.status(200).json({
      year: numericYear,
      month: numericMonth,
      monthName: new Date(numericYear, monthIndex, 1).toLocaleString('default', { month: 'long' }),
      students: reportData,
    });
  } catch (error) {
    console.error('Error fetching dean monthly report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

