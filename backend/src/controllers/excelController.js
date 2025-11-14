import xlsx from 'xlsx';
import prisma from '../utils/prisma.js';

export const testDatabaseConnection = async (req, res) => {
    try {
        console.log('=== DATABASE CONNECTION TEST START ===');
        const userCount = await prisma.user.count();
        console.log('✅ Total users in database:', userCount);
        res.json({ message: 'Database connection test successful', userCount });
    } catch (error) {
        console.error('❌ Database connection test failed:', error);
        res.status(500).json({ error: 'Database connection test failed', details: error.message });
    }
};

export const uploadExcelAndProcessAbsences = async (req, res) => {
    try {
        console.log('=== EXCEL UPLOAD PROCESS START ===');
        
        if (!req.file) {
            console.log('❌ No Excel file uploaded');
            return res.status(400).json({ error: 'No Excel file uploaded' });
        }

        console.log('✅ File received:', req.file.originalname, 'Size:', req.file.size, 'bytes');

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        console.log('✅ Excel data loaded successfully');
        console.log('   - Sheet name:', sheetName);
        console.log('   - Total rows:', data.length);

        // Process data to extract Employee ID, Name, and Absent Dates
        console.log('🔍 Processing Excel data to extract employee information...');
        
        const result = [];
        let currentEmp = null;
        const daysInJune = Array.from({ length: 30 }, (_, i) => i + 1); // June 1 to 30

        // Iterate through rows
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            
            if (!row || !Array.isArray(row)) continue;

            console.log(`   Row ${i}:`, row.slice(0, 10));

            // Identify Employee Code row
            if (row[0] === 'Emp. Code:') {
                console.log(`   🔍 FOUND EMPLOYEE CODE ROW at row ${i}`);
                // Find first non-empty value after the label as employee code
                const codeCell = row.slice(1).find(cell => cell !== undefined && cell !== null && String(cell).toString().trim() !== '');
                const parsedCode = codeCell !== undefined && codeCell !== null ? String(codeCell).trim() : '';
                currentEmp = {
                    code: parsedCode,
                    name: '',
                    absentDates: [],
                };
                console.log(`   🎯 Created Employee with code: ${currentEmp.code}`);
            }

            // Identify Employee Name row and attach to current employee block (if any)
            if (row[0] === 'Emp. Name:' && currentEmp) {
                const nameCell = row.slice(1).find(cell => cell !== undefined && cell !== null && String(cell).toString().trim() !== '');
                currentEmp.name = nameCell !== undefined && nameCell !== null ? String(nameCell).trim() : '';
                console.log(`   🏷️ Set Employee Name: ${currentEmp.name} for code ${currentEmp.code}`);
            }

            // Identify Status row and extract absent dates
            if (row[0] === 'Status' && currentEmp) {
                console.log(`   🔍 FOUND STATUS ROW at row ${i} for employee ${currentEmp.code}`);
                
                // Walk across cells after 'Status', count days only when encountering a valid token
                const cells = row.slice(1); // after 'Status'
                let dayCounter = 0;
                const absentDays = [];
                for (let c = 0; c < cells.length; c++) {
                    if (dayCounter >= 30) break;
                    const normalized = cells[c] === undefined || cells[c] === null ? '' : String(cells[c]).trim().toUpperCase();
                    // Only treat P/A/WO as actual day columns; skip spacers/others
                    if (normalized === 'P' || normalized === 'A' || normalized === 'WO') {
                        dayCounter += 1;
                        if (normalized === 'A') {
                            absentDays.push(`June ${dayCounter}, 2025`);
                        }
                    }
                }
                
                // If we ended short (less than 30 days scanned), no problem; mapping is based on counted days
                currentEmp.absentDates = absentDays;
                console.log(`   📅 Employee ${currentEmp.code} absent dates:`, currentEmp.absentDates);
                
                result.push(currentEmp);
                currentEmp = null; // Reset for next employee
            }
        }

        console.log(`\n=== EXCEL PROCESSING COMPLETE ===`);
        console.log(`Total employees found: ${result.length}`);
        
        result.forEach((emp, index) => {
            console.log(`   Employee ${index + 1}: ${emp.code} - ${emp.name} (${emp.absentDates.length} absent days)`);
        });

        // Process each employee and generate leaves for absent days
        console.log('\n=== PROCESSING ABSENT DAYS AND GENERATING LEAVES ===');
        const processedResults = [];
        let totalLeavesGenerated = 0;
        const allErrors = [];

        for (const emp of result) {
            console.log(`\n🔍 Processing employee: ${emp.code} - ${emp.name}`);
            
            const empResult = {
                employeeId: emp.code,
                employeeName: emp.name,
                absentDays: [],
                leavesGenerated: 0,
                errors: []
            };

            try {
                // Find student by employee ID
                const student = await prisma.student.findFirst({
                    where: {
                        profile: {
                            employeeId: emp.code
                        }
                    },
                    include: {
                        user: true,
                        profile: true
                    }
                });

                if (!student) {
                    console.log(`   ⚠️ Student not found for employee ID: ${emp.code}`);
                    empResult.errors.push(`Student not found for employee ID: ${emp.code}`);
                    processedResults.push(empResult);
                    continue;
                }

                console.log(`   ✅ Found student: ${student.user.name} (ID: ${student.id})`);

                // Process each absent day
                for (const absentDateStr of emp.absentDates) {
                    console.log(`   📅 Processing absent date: ${absentDateStr}`);
                    
                    // Parse the date string (format: "June X, 2025")
                    const dateMatch = absentDateStr.match(/June (\d+), 2025/);
                    if (!dateMatch) {
                        console.log(`   ❌ Invalid date format: ${absentDateStr}`);
                        empResult.absentDays.push({
                            date: absentDateStr,
                            leaveGenerated: false,
                            error: 'Invalid date format'
                        });
                        continue;
                    }

                    const dayOfMonth = parseInt(dateMatch[1]);
                    const absentDate = new Date(2025, 5, dayOfMonth); // Month is 0-indexed, so 5 = June
                    
                    console.log(`   📅 Parsed date: ${absentDate.toISOString().split('T')[0]}`);

                    // Check if student already has a leave for this date
                    const existingLeave = await prisma.leave.findFirst({
                        where: {
                            studentId: student.id,
                            OR: [
                                {
                                    AND: [
                                        { startDate: { lte: absentDate } },
                                        { endDate: { gte: absentDate } }
                                    ]
                                },
                                {
                                    AND: [
                                        { startDate: { lte: absentDate } },
                                        { endDate: { gte: absentDate } }
                                    ]
                                }
                            ]
                        }
                    });

                    if (existingLeave) {
                        console.log(`   ✅ Leave already exists for ${absentDateStr}`);
                        empResult.absentDays.push({
                            date: absentDateStr,
                            leaveGenerated: false,
                            reason: 'Leave already exists'
                        });
                        continue;
                    }

                    // Generate auto leave for this absent day
                    try {
                        const autoLeave = await prisma.leave.create({
                            data: {
                                studentId: student.id,
                                leaveType: 'CL', // Default to CL for auto-generated leaves
                                leaveSource: 'AUTO',
                                startDate: absentDate,
                                endDate: absentDate,
                                status: 'APPROVED', // Auto-approve since it's based on attendance
                                applicationDate: new Date()
                            }
                        });

                        // Add a remark indicating this is auto-generated
                        await prisma.remark.create({
                            data: {
                                leaveId: autoLeave.id,
                                userId: student.userId,
                                role: 'STUDENT',
                                remark: `Auto-generated leave for absent day (${absentDateStr}) - Generated from Excel upload`,
                                actionDate: new Date()
                            }
                        });

                        console.log(`   ✅ Auto-generated leave for ${absentDateStr} (Leave ID: ${autoLeave.id})`);
                        empResult.absentDays.push({
                            date: absentDateStr,
                            leaveGenerated: true,
                            leaveId: autoLeave.id
                        });
                        empResult.leavesGenerated++;
                        totalLeavesGenerated++;

                    } catch (leaveError) {
                        console.error(`   ❌ Error generating leave for ${absentDateStr}:`, leaveError);
                        empResult.absentDays.push({
                            date: absentDateStr,
                            leaveGenerated: false,
                            error: leaveError.message
                        });
                        empResult.errors.push(`Failed to generate leave for ${absentDateStr}: ${leaveError.message}`);
                    }
                }

            } catch (error) {
                console.error(`   ❌ Error processing employee ${emp.code}:`, error);
                empResult.errors.push(`Error processing employee: ${error.message}`);
            }

            processedResults.push(empResult);
        }

        console.log(`\n=== PROCESSING COMPLETE ===`);
        console.log(`Total leaves generated: ${totalLeavesGenerated}`);

        // Initialize results object with the structure the frontend expects
        const results = {
            processed: result.length,
            leavesGenerated: totalLeavesGenerated,
            errors: allErrors,
            summary: processedResults
        };

        res.json({
            message: 'Excel file processed successfully',
            sheetName: sheetName,
            totalRows: data.length,
            employeesFound: result.length,
            results: results
        });

    } catch (error) {
        console.error('❌ EXCEL PROCESSING FAILED:', error);
        res.status(500).json({ 
            error: 'Failed to process Excel file',
            details: error.message 
        });
    }
};

export const getUploadHistory = async (req, res) => {
    try {
        console.log('=== FETCHING UPLOAD HISTORY ===');
        
        const recentLeaves = await prisma.leave.findMany({
            where: { leaveSource: 'AUTO' },
            include: {
                student: {
                    include: { profile: true, user: true }
                }
            },
            orderBy: { applicationDate: 'desc' },
            take: 100
        });

        console.log('✅ Found leaves in database:', recentLeaves.length);

        const formattedLeaves = recentLeaves.map(leave => ({
            id: leave.id,
            employeeId: leave.student.profile.employeeId,
            employeeName: leave.student.profile.employeeId ? 
                leave.student.profile.employeeId : leave.student.user.name,
            startDate: leave.startDate,
            endDate: leave.endDate,
            applicationDate: leave.applicationDate,
            status: leave.status,
            leaveType: leave.leaveType,
            leaveSource: leave.leaveSource
        }));

        res.json({ recentLeaves: formattedLeaves });

    } catch (error) {
        console.error('❌ Error fetching upload history:', error);
        res.status(500).json({ error: 'Failed to fetch upload history', details: error.message });
    }
};
