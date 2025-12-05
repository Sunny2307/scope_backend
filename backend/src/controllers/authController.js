import prisma from '../utils/prisma.js';
import { sendEmail } from '../mail/sendEmail.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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


// Generate a 4-digit OTP
const generateOTP = () => crypto.randomInt(1000, 9999).toString();


// Signup and send OTP
export const signup = async (req, res) => {
  const { email, studentId } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!studentId) return res.status(400).json({ error: 'Student ID is required' });


  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    // Check if student ID is already taken
    const existingStudentId = await prisma.user.findUnique({ where: { id: String(studentId).toUpperCase() } });
    if (existingStudentId) return res.status(400).json({ error: 'Student ID already registered' });


    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);


    const user = await prisma.user.create({
      data: {
        id: String(studentId).toUpperCase(), // Use student ID as the user ID
        email,
        otp,
        otpExpires,
        isVerified: false,
      },
    });


    await prisma.student.create({
      data: {
        userId: user.id,
        enrollmentYear: new Date().getFullYear(),
        department: 'Default Department',
      },
    });


    await sendEmail(email, 'Your OTP for Verification', `Your OTP is: ${otp}. It expires in 5 minutes.`);
    res.status(200).json({ message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};


// Verify OTP
export const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });


  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        student: {
          include: {
            profile: true,
          },
        },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });


    if (user.otp !== otp || new Date() > user.otpExpires) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }


    await prisma.user.update({
      where: { email },
      data: { otp: null, otpExpires: null },
    });
    res.status(200).json({ message: 'OTP verified. Please set your password' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
};


// Set password
export const setPassword = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });


  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isVerified) return res.status(400).json({ error: 'User not found or already verified' });


    await prisma.user.update({
      where: { email },
      data: { password, isVerified: true },
    });
    res.status(200).json({ message: 'Password set successfully. Account verified' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to set password' });
  }
};


// Forgot password - send OTP
export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.user.update({
      where: { email },
      data: { otp, otpExpires },
    });

    await sendEmail(email, 'Your OTP for Password Reset', `Your OTP is: ${otp}. It expires in 5 minutes.`);
    res.status(200).json({ message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};


// Verify OTP for forgot password
export const verifyForgotPasswordOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.otp !== otp || new Date() > user.otpExpires) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Keep OTP valid for password reset step
    res.status(200).json({ message: 'OTP verified. Please set your new password' });
  } catch (error) {
    console.error('Verify forgot password OTP error:', error.message);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
};


// Reset password after OTP verification
export const resetPassword = async (req, res) => {
  const { email, otp, password } = req.body;
  if (!email || !otp || !password) return res.status(400).json({ error: 'Email, OTP, and password are required' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify OTP again before resetting password
    if (user.otp !== otp || new Date() > user.otpExpires) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    await prisma.user.update({
      where: { email },
      data: { 
        password,
        otp: null,
        otpExpires: null,
      },
    });
    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};


// Change password when logged in (requires current password)
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current password and new password are required' });

  try {
    // Get user from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token is required' });

    const verificationToken = await prisma.verification_Token.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verificationToken || !verificationToken.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = verificationToken.user;

    // Verify current password
    if (user.password !== currentPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: newPassword },
    });

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
};


// Login
export const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  try {
    // Special admin user check
    if (email === 'admin' && password === '1234') {
      const token = crypto.randomBytes(32).toString('hex');
      // Create a temporary admin user record if it doesn't exist
      let adminUser = await prisma.user.findUnique({ where: { email: 'admin@charusat.edu.in' } });
      
      if (!adminUser) {
        adminUser = await prisma.user.create({
          data: {
            id: 'admin', // Use simple ID for admin
            email: 'admin@charusat.edu.in',
            name: 'Admin Guide',
            password: '1234',
            role: 'GUIDE',
            isVerified: true,
          },
        });
      }
      
      await prisma.verification_Token.create({
        data: {
          token,
          userId: adminUser.id,
        },
      });
      
      return res.status(200).json({ 
        message: 'Login successful', 
        token,
        role: 'GUIDE',
        user: {
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role
        }
      });
    }

    // Special operator user check
    if (email === 'operator' && password === '1234') {
      const token = crypto.randomBytes(32).toString('hex');
      // Create a temporary operator user record if it doesn't exist
      let operatorUser = await prisma.user.findUnique({ where: { email: 'operator@charusat.edu.in' } });
      
      if (!operatorUser) {
        operatorUser = await prisma.user.create({
          data: {
            id: 'operator', // Use simple ID for operator
            email: 'operator@charusat.edu.in',
            name: 'Operator',
            password: '1234',
            role: 'OPERATOR',
            isVerified: true,
          },
        });
      }
      
      await prisma.verification_Token.create({
        data: {
          token,
          userId: operatorUser.id,
        },
      });
      
      return res.status(200).json({ 
        message: 'Login successful', 
        token,
        role: 'OPERATOR',
        user: {
          email: operatorUser.email,
          name: operatorUser.name,
          role: operatorUser.role
        }
      });
    }

    // Special dean user check
    if ((email === 'dean' || email === 'dean@charusat.edu.in') && password === '1234') {
      const token = crypto.randomBytes(32).toString('hex');
      // Create a temporary dean user record if it doesn't exist
      let deanUser = await prisma.user.findUnique({ where: { email: 'dean@charusat.edu.in' } });
      
      if (!deanUser) {
        deanUser = await prisma.user.create({
          data: {
            id: 'dean', // Use simple ID for dean
            email: 'dean@charusat.edu.in',
            name: 'Dean',
            password: '1234',
            role: 'DEAN',
            isVerified: true,
          },
        });
      }
      
      await prisma.verification_Token.create({
        data: {
          token,
          userId: deanUser.id,
        },
      });
      
      return res.status(200).json({ 
        message: 'Login successful', 
        token,
        role: 'DEAN',
        user: {
          email: deanUser.email,
          name: deanUser.name,
          role: deanUser.role
        }
      });
    }

    // Regular user login
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isVerified || user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    let needsProfileCompletion = false;
    let approvalStatus = null;
    
    // Determine student access rules
    if (user.role === 'STUDENT') {
      const hasCompletedProfile = Boolean(user.student?.profile);
      
      if (!hasCompletedProfile) {
        needsProfileCompletion = true;
      } else {
        // Profile is complete, return approval status
        approvalStatus = user.approvalStatus || 'PENDING';
      }
    }
    
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.verification_Token.create({
      data: {
        token,
        userId: user.id,
      },
    });
    
    res.status(200).json({ 
      message: 'Login successful', 
      token,
      role: user.role,
      user: {
        email: user.email,
        name: user.name,
        role: user.role
      },
      needsProfileCompletion,
      approvalStatus // Include approval status for students
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
};


// Save Student Profile
export const saveStudentProfile = async (req, res) => {
  const { userEmail, ...profileData } = req.body;
  if (!userEmail) return res.status(400).json({ error: 'User email is required' });


  try {
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user || !user.isVerified) return res.status(400).json({ error: 'User not found or not verified' });


    const student = await prisma.student.findUnique({ where: { userId: user.id } });
    if (!student) return res.status(404).json({ error: 'Student record not found' });


    const existingProfile = await prisma.studentProfile.findUnique({ where: { studentId: student.id } });
    if (existingProfile) return res.status(400).json({ error: 'Student profile already exists' });


    // Enhanced validation
    if (!profileData.studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }
    if (!profileData.studentName) {
      return res.status(400).json({ error: 'Student name is required' });
    }
    if (!profileData.mobileNo || !/^\d{10}$/.test(profileData.mobileNo)) {
      return res.status(400).json({ error: 'Valid mobile number is required' });
    }
    if (!profileData.admissionDate) {
      return res.status(400).json({ error: 'Admission date is required' });
    }
    if (!profileData.registrationDate) {
      return res.status(400).json({ error: 'Registration date is required' });
    }
    if (!profileData.currentSemester) {
      return res.status(400).json({ error: 'Current semester is required' });
    }
    if (!profileData.gender) {
      return res.status(400).json({ error: 'Gender is required' });
    }
    if (!profileData.birthDate) {
      return res.status(400).json({ error: 'Birth date is required' });
    }
    if (!profileData.admissionCastCategory) {
      return res.status(400).json({ error: 'Admission cast category is required' });
    }
    if (!profileData.actualCastCategory) {
      return res.status(400).json({ error: 'Actual cast category is required' });
    }
    if (!profileData.nationality) {
      return res.status(400).json({ error: 'Nationality is required' });
    }
    if (!profileData.localAddress) {
      return res.status(400).json({ error: 'Local address is required' });
    }
    if (!profileData.permanentAddress) {
      return res.status(400).json({ error: 'Permanent address is required' });
    }
    if (!profileData.country) {
      return res.status(400).json({ error: 'Country is required' });
    }


    // Validate enum values
    const validGenders = ['MALE', 'FEMALE', 'OTHER'];
    const validCastCategories = ['GENERAL', 'OBC', 'SC', 'ST', 'OTHER'];
    const validScholarshipTypes = ['CPSF', 'SODH', 'UGC_CSIR_JRF', 'DST_INSPIRE', 'OTHER'];


    if (profileData.gender && !validGenders.includes(profileData.gender)) {
      return res.status(400).json({ error: 'Invalid gender value' });
    }
    if (profileData.admissionCastCategory && !validCastCategories.includes(profileData.admissionCastCategory)) {
      return res.status(400).json({ error: 'Invalid admission cast category' });
    }
    if (profileData.actualCastCategory && !validCastCategories.includes(profileData.actualCastCategory)) {
      return res.status(400).json({ error: 'Invalid actual cast category' });
    }
    if (profileData.scholarshipType && !validScholarshipTypes.includes(profileData.scholarshipType)) {
      return res.status(400).json({ error: 'Invalid scholarship type' });
    }


    // Update User with name and institutionalEmail, set approval status to PENDING
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: profileData.studentName.toUpperCase(),
        institutionalEmail: profileData.institutionalEmail || null,
        approvalStatus: 'PENDING',
        isApproved: false,
      },
    });


    // Validate guide and co-guide IDs if provided
    let guideId = null;
    let coGuideId = null;
    
    if (profileData.guideId) {
      const guide = await prisma.user.findUnique({
        where: { id: profileData.guideId },
      });
      if (!guide || guide.role !== 'GUIDE') {
        return res.status(400).json({ error: 'Invalid guide ID' });
      }
      guideId = profileData.guideId;
    }
    
    if (profileData.coGuideId) {
      const coGuide = await prisma.user.findUnique({
        where: { id: profileData.coGuideId },
      });
      if (!coGuide || coGuide.role !== 'GUIDE') {
        return res.status(400).json({ error: 'Invalid co-guide ID' });
      }
      coGuideId = profileData.coGuideId;
    }

    // Update Student with relevant fields including guide and co-guide
    await prisma.student.update({
      where: { id: student.id },
      data: {
        department: 'Computer Science', // Set a default department or derive from institute
        scholarshipType: profileData.scholarshipType || null,
        scholarshipAmount: profileData.scholarshipAmount ? parseInt(profileData.scholarshipAmount) : 30000,
        ugcId: profileData.studentId || null,
        guideId: guideId,
        coGuideId: coGuideId,
      },
    });


    const studentProfile = await prisma.studentProfile.create({
      data: {
        studentId: student.id,
        employeeId: profileData.employeeId ? profileData.employeeId.toUpperCase() : null, // Added: Employee ID field
        admissionDate: new Date(profileData.admissionDate),
        registrationDate: new Date(profileData.registrationDate),
        currentSemester: parseInt(profileData.currentSemester),
        gender: profileData.gender,
        birthDate: new Date(profileData.birthDate),
        admissionCastCategory: profileData.admissionCastCategory,
        actualCastCategory: profileData.actualCastCategory,
        nationality: profileData.nationality.toUpperCase(),
        localFullAddress: profileData.localAddress.toUpperCase(),
        permanentFullAddress: profileData.permanentAddress.toUpperCase(),
        country: profileData.country.toUpperCase(),
        mobileNo: profileData.mobileNo,
        guardianMobileNo: profileData.guardianMobileNo || null,
        guardianEmail: profileData.guardianEmail ? profileData.guardianEmail.toLowerCase() : null,
        personalEmail: profileData.personalEmail ? profileData.personalEmail.toLowerCase() : null,
        isHandicapped: Boolean(profileData.isHandicapped),
        disability: profileData.disability ? profileData.disability.toUpperCase() : null,
        photoUploaded: Boolean(profileData.photoUploaded),
        belongsToSamaj: Boolean(profileData.belongsToSamaj),
        hostelNameAndAddress: profileData.hostelNameAddress ? profileData.hostelNameAddress.toUpperCase() : null,
        aadhaarNumber: profileData.aadhaarNumber || null,
        pancardNumber: profileData.pancardNumber ? profileData.pancardNumber.toUpperCase() : null,
        nameOfGuide: profileData.nameOfGuide ? profileData.nameOfGuide.toUpperCase() : null,
        scholarshipAmount: profileData.scholarshipAmount ? parseInt(profileData.scholarshipAmount) : null,
        contingencyAmount: profileData.contingencyAmount ? parseInt(profileData.contingencyAmount) : null,
        scholarshipType: profileData.scholarshipType || null,
        ugcId: profileData.studentId.toUpperCase(),
      },
    });


    res.status(201).json({ message: 'Student profile saved successfully', studentId: student.id });
  } catch (error) {
    console.error('Save student profile error:', error.message, error.stack); // Detailed logging
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Duplicate entry for a unique field (e.g., ugcId or personalEmail)' });
    } else {
      res.status(500).json({ error: 'Failed to save student profile', details: error.message });
    }
  }
};


// Generate a token and store it in the Verification_Token table
export const generateToken = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });


    const token = crypto.randomBytes(32).toString('hex');
    await prisma.verification_Token.create({
      data: { token, userId: user.id },
    });
    res.status(200).json({ token });
  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


// Verify a token and return the associated email and role
export const verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });


    const verificationToken = await prisma.verification_Token.findUnique({
      where: { token },
      include: { 
        user: {
          select: {
            email: true,
            role: true,
          }
        }
      },
    });
    if (!verificationToken || !verificationToken.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Return both email and role for proper authentication
    res.status(200).json({ 
      email: verificationToken.user.email,
      role: verificationToken.user.role 
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Fetch complete user profile data
export const getUserProfile = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const verificationToken = await prisma.verification_Token.findUnique({
      where: { token },
      include: { 
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            institutionalEmail: true,
            institute: true,
            approvalStatus: true,
            isApproved: true,
            isActive: true,
          }
        }
      },
    });
    if (!verificationToken || !verificationToken.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = verificationToken.user;
    
    console.log('=== getUserProfile: User Role Check ===');
    console.log('User role:', user.role);
    console.log('User ID:', user.id);
    console.log('User email:', user.email);
    
    // For non-student users (DEAN, OPERATOR, GUIDE), return basic user info
    if (user.role !== 'STUDENT') {
      console.log('User is not a STUDENT, returning basic info');
      return res.status(200).json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        institutionalEmail: user.institutionalEmail,
        institute: user.institute,
        isActive: user.isActive,
      });
    }
    
    // Fetch student data with guide & profile information (only needed fields)
    const student = await prisma.student.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        enrollmentYear: true,
        department: true,
        ugcId: true,
        scholarshipType: true,
        scholarshipAmount: true,
        guideId: true,
        coGuideId: true,
        profile: {
          select: {
            ugcId: true,
            employeeId: true,
            admissionDate: true,
            registrationDate: true,
            currentSemester: true,
            gender: true,
            birthDate: true,
            admissionCastCategory: true,
            actualCastCategory: true,
            nationality: true,
            localFullAddress: true,
            permanentFullAddress: true,
            country: true,
            mobileNo: true,
            guardianMobileNo: true,
            guardianEmail: true,
            personalEmail: true,
            isHandicapped: true,
            disability: true,
            belongsToSamaj: true,
            hostelNameAndAddress: true,
            nameOfGuide: true,
            scholarshipAmount: true,
            contingencyAmount: true,
            scholarshipType: true,
            aadhaarNumber: true,
            pancardNumber: true,
          }
        },
        guide: {
          select: {
            name: true,
            email: true,
          }
        },
        coGuide: {
          select: {
            name: true,
            email: true,
          }
        }
      }
    });

    console.log('=== getUserProfile DEBUG START ===');
    console.log('Student ID:', student?.id);
    console.log('Student guideId:', student?.guideId);
    console.log('Student coGuideId:', student?.coGuideId);
    console.log('Student department:', student?.department);
    console.log('Student guide object:', JSON.stringify(student?.guide, null, 2));
    console.log('Student coGuide object:', JSON.stringify(student?.coGuide, null, 2));
    console.log('Student profile nameOfGuide:', student?.profile?.nameOfGuide);

    if (!student) {
      console.log('ERROR: Student record not found for userId:', user.id);
      console.log('This means the user is marked as STUDENT but has no Student record in database');
      return res.status(404).json({ error: 'Student record not found' });
    }
    
    console.log('Student record found! Proceeding with student data fetch...');

    const studentProfile = student.profile;

    // Extract student ID from institutional email (e.g., "23ce122@charusat.edu.in" -> "23CE122")
    const studentId = user.institutionalEmail 
      ? user.institutionalEmail.split('@')[0].toUpperCase()
      : user.email.split('@')[0].toUpperCase();

    const formatDate = (dateValue) => (dateValue ? new Date(dateValue).toISOString() : null);

    const profileDetails = {
      studentId: studentProfile?.ugcId ?? student.ugcId ?? studentId,
      employeeId: studentProfile?.employeeId ?? '',
      studentName: user.name ?? '',
      institute: user.institute ?? 'CHARUSAT',
      admissionDate: formatDate(studentProfile?.admissionDate),
      registrationDate: formatDate(studentProfile?.registrationDate),
      admissionYear: student.enrollmentYear ?? (studentProfile?.admissionDate ? new Date(studentProfile.admissionDate).getFullYear() : null),
      currentSemester: studentProfile?.currentSemester ?? null,
      gender: studentProfile?.gender ?? '',
      birthDate: formatDate(studentProfile?.birthDate),
      admissionCastCategory: studentProfile?.admissionCastCategory ?? '',
      actualCastCategory: studentProfile?.actualCastCategory ?? '',
      nationality: studentProfile?.nationality ?? '',
      localAddress: studentProfile?.localFullAddress ?? '',
      permanentAddress: studentProfile?.permanentFullAddress ?? '',
      country: studentProfile?.country ?? '',
      mobileNo: studentProfile?.mobileNo ?? '',
      guardianMobileNo: studentProfile?.guardianMobileNo ?? '',
      guardianEmail: studentProfile?.guardianEmail ?? '',
      personalEmail: studentProfile?.personalEmail ?? '',
      institutionalEmail: user.institutionalEmail ?? user.email ?? '',
      isHandicapped: studentProfile?.isHandicapped ?? false,
      disability: studentProfile?.disability ?? '',
      belongsToSamaj: studentProfile?.belongsToSamaj ?? false,
      hostelNameAddress: studentProfile?.hostelNameAndAddress ?? '',
      nameOfGuide: student.guide?.name ?? studentProfile?.nameOfGuide ?? '',
      nameOfCoGuide: student.coGuide?.name ?? '',
      ugcId: studentProfile?.ugcId ?? student.ugcId ?? '',
      scholarshipAmount: studentProfile?.scholarshipAmount ?? student.scholarshipAmount ?? null,
      contingencyAmount: studentProfile?.contingencyAmount ?? null,
      scholarshipType: studentProfile?.scholarshipType ?? student.scholarshipType ?? '',
      aadhaarNumber: studentProfile?.aadhaarNumber ?? '',
      pancardNumber: studentProfile?.pancardNumber ?? '',
    };

    // Extract values with detailed logging
    const guideName = student.guide?.name || studentProfile?.nameOfGuide || '';
    const coGuideName = student.coGuide?.name || '';
    const departmentName = student.department || '';

    console.log('=== EXTRACTED VALUES ===');
    console.log('guideName (from student.guide?.name):', student.guide?.name);
    console.log('guideName (from studentProfile?.nameOfGuide):', studentProfile?.nameOfGuide);
    console.log('Final guideName:', guideName);
    console.log('coGuideName (from student.coGuide?.name):', student.coGuide?.name);
    console.log('Final coGuideName:', coGuideName);
    console.log('departmentName:', departmentName);

    const userData = {
      email: user.email,
      name: user.name || '',
      collegeId: student.ugcId || studentProfile?.ugcId || '',
      studentId: studentId, // Use the institutional email prefix as Student ID
      employeeId: studentProfile?.employeeId || '',
      department: departmentName,
      guide: guideName,
      coGuide: coGuideName,
      approvalStatus: user.approvalStatus || 'PENDING',
      isApproved: user.isApproved,
      isActive: user.isActive,
      profile: profileDetails,
      profileRaw: studentProfile,
    };

    console.log('=== FINAL userData BEING SENT ===');
    console.log('userData.department:', userData.department);
    console.log('userData.guide:', userData.guide);
    console.log('userData.coGuide:', userData.coGuide);
    console.log('Full userData object:', JSON.stringify(userData, null, 2));
    console.log('=== getUserProfile DEBUG END ===');

    res.status(200).json(userData);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Submit leave application
export const submitLeaveApplication = async (req, res) => {
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
    
    // Get student record
    const student = await prisma.student.findUnique({
      where: { userId: user.id }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    const { leaveType, startDate, endDate, reason } = req.body;

    // Validate required fields
    if (!leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate leave type
    const validLeaveTypes = ['CL', 'DL', 'LWP'];
    if (!validLeaveTypes.includes(leaveType)) {
      return res.status(400).json({ error: 'Invalid leave type' });
    }

    // For DL leaves, document is required
    if (leaveType === 'DL' && !req.file) {
      return res.status(400).json({ error: 'Document is required for DL leave applications' });
    }

    // For non-DL leaves, document should not be provided
    if (leaveType !== 'DL' && req.file) {
      return res.status(400).json({ error: 'Documents can only be uploaded for DL leave applications' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    // Normalize to start of day for accurate date-only comparisons
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    // Allow only past (or today) dates, disallow future
    if (start > today) {
      return res.status(400).json({ error: 'Start date cannot be in the future' });
    }

    if (end > today) {
      return res.status(400).json({ error: 'End date cannot be in the future' });
    }

    if (end < start) {
      return res.status(400).json({ error: 'End date cannot be before start date' });
    }

    // Prepare document path if file is uploaded (for DL leaves)
    let documentPath = null;
    if (req.file && leaveType === 'DL') {
      // Store relative path: leave-documents/filename
      documentPath = `leave-documents/${req.file.filename}`;
    }

    // Create leave application
    const leaveApplication = await prisma.leave.create({
      data: {
        studentId: student.id,
        leaveType: leaveType,
        startDate: start,
        endDate: end,
        status: 'PENDING',
        applicationDate: new Date(),
        documentPath: documentPath,
      }
    });

    // Automatically route leave requests based on type
    // CL and DL requests go to guides, LWP requests go to operators
    let approverRole = '';
    if (leaveType === 'LWP') {
      approverRole = 'OPERATOR';
    } else {
      approverRole = 'GUIDE';
    }

    // Create a system remark indicating the routing (only for CL/DL to guides)
    // For LWP applications, no system remark is needed since operators know they handle LWP
    if (leaveType !== 'LWP') {
      await prisma.remark.create({
        data: {
          leaveId: leaveApplication.id,
          userId: user.id, // Using student's user ID for system remarks
          role: 'STUDENT', // Using STUDENT role since SYSTEM is not valid
          remark: `Leave request automatically routed to ${approverRole} for approval`,
          actionDate: new Date(),
        }
      });
    }

    // Create remark for the leave application
    await prisma.remark.create({
      data: {
        leaveId: leaveApplication.id,
        userId: user.id,
        role: 'STUDENT',
        remark: reason,
        actionDate: new Date(),
      }
    });

    res.status(201).json({ 
      message: 'Leave application submitted successfully',
      leaveId: leaveApplication.id 
    });

  } catch (error) {
    console.error('Error submitting leave application:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get leave summary (balances and recent history) for the authenticated student
export const getLeaveSummary = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const verificationToken = await prisma.verification_Token.findUnique({
      where: { token },
      include: { 
        user: {
          select: {
            id: true,
          }
        }
      },
    });
    if (!verificationToken || !verificationToken.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = verificationToken.user;

    const student = await prisma.student.findUnique({ 
      where: { userId: user.id },
      select: {
        id: true,
      }
    });
    if (!student) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    const leaves = await prisma.leave.findMany({
      where: { studentId: student.id },
      select: {
        leaveType: true,
        startDate: true,
        endDate: true,
        status: true,
      },
      orderBy: [{ startDate: 'asc' }, { applicationDate: 'asc' }],
    });

    const formatISODate = (d) => new Date(d).toISOString().slice(0, 10);

    const historyByType = { CL: [], DL: [], LWP: [] };
    const historySortBuckets = { CL: [], DL: [], LWP: [] };

    let approvedDLCount = 0;
    let approvedLwpDays = 0;

    const approvedCLLeaves = [];

    for (const leave of leaves) {
      const safeType = String(leave.leaveType || '').toUpperCase().trim();
      const type = ['CL', 'DL', 'LWP'].includes(safeType) ? safeType : null;
      if (!type) continue;

      const duration = differenceInDaysInclusive(leave.startDate, leave.endDate);
      const startDateObj = toDateStart(leave.startDate);
      const endDateObj = toDateStart(leave.endDate);
      const baseEntry = {
        dates: `${formatISODate(leave.startDate)} to ${formatISODate(leave.endDate)}`,
        duration: `${duration} days`,
        status: (leave.status || '').toString(),
        sortDate: startDateObj.getTime(),
        startDateObj,
        endDateObj,
      };

      historySortBuckets[type].push(baseEntry);

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

    const clOverflowSegments = computeCLOverflowSegments(approvedCLLeaves, 30);

    const totalOverflowDays = clOverflowSegments.reduce((sum, segment) => sum + segment.days, 0);
    const totalApprovedCLDays = approvedCLLeaves.reduce(
      (sum, leave) => sum + differenceInDaysInclusive(leave.startDate, leave.endDate),
      0
    );
    const clAllocatedDays = Math.min(30, Math.max(0, totalApprovedCLDays - totalOverflowDays));

    historySortBuckets.CL = historySortBuckets.CL.map((entry) => {
      if (!entry.startDateObj || !entry.endDateObj) return entry;
      const overflowForEntry = clOverflowSegments.reduce((sum, segment) => {
        const overlapStart =
          entry.startDateObj > segment.startDate ? entry.startDateObj : segment.startDate;
        const overlapEnd =
          entry.endDateObj < segment.endDate ? entry.endDateObj : segment.endDate;
        if (overlapEnd < overlapStart) return sum;
        return sum + differenceInDaysInclusive(overlapStart, overlapEnd);
      }, 0);

      if (overflowForEntry > 0) {
        return {
          ...entry,
          convertedToLWP: overflowForEntry,
          status: `${entry.status} (${overflowForEntry} day(s) converted to LWP)`,
        };
      }
      return entry;
    });

    const remainingCL = Math.max(0, 30 - clAllocatedDays);
    const totalLwpDays = approvedLwpDays + totalOverflowDays;

    // Append synthetic LWP history entries for overflow segments
    clOverflowSegments.forEach((segment) => {
      const overflowEntry = {
        dates: `${formatISODate(segment.startDate)} to ${formatISODate(segment.endDate)}`,
        duration: `${segment.days} days`,
        status: 'Converted from CL overflow',
        sortDate: segment.startDate.getTime(),
      };
      historySortBuckets.LWP.push(overflowEntry);
    });

    Object.keys(historyByType).forEach((key) => {
      historyByType[key] = historySortBuckets[key]
        .sort((a, b) => b.sortDate - a.sortDate)
        .map(({ sortDate, startDateObj, endDateObj, ...rest }) => rest);
    });

    const summary = {
      CL: { balance: `${remainingCL}/30`, history: historyByType.CL },
      DL: { balance: `${approvedDLCount}`, history: historyByType.DL },
      LWP: {
        balance:
          totalOverflowDays > 0
            ? `${totalLwpDays} (CL overflow: ${totalOverflowDays})`
            : `${totalLwpDays}`,
        overflowFromCL: totalOverflowDays,
        history: historyByType.LWP,
      },
    };

    res.status(200).json(summary);
  } catch (error) {
    console.error('Error fetching leave summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get student scholarships (current month and previous months)
export const getStudentScholarships = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const verificationToken = await prisma.verification_Token.findUnique({
      where: { token },
      include: { 
        user: {
          select: {
            id: true,
          }
        }
      },
    });
    if (!verificationToken || !verificationToken.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = verificationToken.user;
    const student = await prisma.student.findUnique({ 
      where: { userId: user.id },
      select: {
        id: true,
      }
    });
    if (!student) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed

    // Helper: calculate total overlapping days within current month for approved LWP leaves
    const currentMonthIndex = currentMonth - 1; // convert to 0-indexed
    const startOfMonth = new Date(currentYear, currentMonthIndex, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(currentYear, currentMonthIndex + 1, 0, 23, 59, 59, 999);
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

    const lwpLeaves = await prisma.leave.findMany({
      where: {
        studentId: student.id,
        leaveType: 'LWP',
        status: 'APPROVED',
        startDate: { lte: endOfMonth },
        endDate: { gte: startOfMonth },
      },
      select: {
        startDate: true,
        endDate: true,
      },
    });

    const approvedCLLeaves = await prisma.leave.findMany({
      where: {
        studentId: student.id,
        leaveType: 'CL',
        status: 'APPROVED',
      },
      select: {
        startDate: true,
        endDate: true,
      },
    });

    const clOverflowSegments = computeCLOverflowSegments(approvedCLLeaves, 30);

    const lwpDaysFromRecords = lwpLeaves.reduce((total, leave) => {
      return total + overlappingDays(leave.startDate, leave.endDate);
    }, 0);

    const lwpDaysFromOverflow = clOverflowSegments.reduce((total, segment) => {
      return total + overlappingDays(segment.startDate, segment.endDate);
    }, 0);

    const totalLwpDays = lwpDaysFromRecords + lwpDaysFromOverflow;

    const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();

    // Get current month's scholarship (only needed fields)
    const currentMonthScholarship = await prisma.scholarship.findFirst({
      where: {
        studentId: student.id,
        year: currentYear,
        month: currentMonth,
      },
      select: {
        baseAmount: true,
        contingencyAmount: true,
        lwpDeduction: true,
        finalAmount: true,
      },
      orderBy: { id: 'desc' },
    });

    // Get previous months' scholarships (last 3 months, excluding current month)
    const previousScholarships = await prisma.scholarship.findMany({
      where: {
        studentId: student.id,
        OR: [
          { year: currentYear, month: { lt: currentMonth } },
          { year: { lt: currentYear } },
        ],
      },
      select: {
        year: true,
        month: true,
        finalAmount: true,
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
      ],
      take: 3,
    });

    // Format month names
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Format current month data
    // If current month scholarship exists, use it; otherwise use student's default scholarship amount
    // Determine base amount priority: current scholarship record > profile > student table > default
    const determineBaseAmount = () => {
      const tryParse = (value) => {
        if (value === null || value === undefined) return null;
        const parsed = Number(value);
        return Number.isNaN(parsed) ? null : parsed;
      };

      const fromScholarship = tryParse(currentMonthScholarship?.baseAmount);
      if (fromScholarship && fromScholarship > 0) return fromScholarship;

      const fromProfile = tryParse(student.profile?.scholarshipAmount);
      if (fromProfile && fromProfile > 0) return fromProfile;

      const fromStudent = tryParse(student.scholarshipAmount);
      if (fromStudent && fromStudent > 0) return fromStudent;

      return 30000;
    };

    const baseAmount = determineBaseAmount();

    const perDayRate = daysInMonth > 0 ? baseAmount / daysInMonth : 0;
    const computedLwpDeduction = Number((perDayRate * totalLwpDays).toFixed(2));

    const recordedLwpDeduction = Number(currentMonthScholarship?.lwpDeduction || 0);
    const lwpDeduction = computedLwpDeduction || recordedLwpDeduction || 0;

    const finalAmountRecorded = Number(currentMonthScholarship?.finalAmount || 0);
    const finalAmountComputed = Math.max(0, Number((baseAmount - lwpDeduction).toFixed(2)));

    const contingencyFromProfile = (() => {
      const value = student.profile?.contingencyAmount;
      const parsed = value !== null && value !== undefined ? Number(value) : null;
      if (parsed !== null && !Number.isNaN(parsed) && parsed > 0) return parsed;
      const scholarshipContingency = Number(currentMonthScholarship?.contingencyAmount || 0);
      return scholarshipContingency;
    })();

    const currentMonthData = {
      baseAmount,
      lwpDeduction,
      finalAmount: finalAmountRecorded > 0 ? finalAmountRecorded : finalAmountComputed,
      contingencyAmount: contingencyFromProfile || 0,
      perDayRate: Number(perDayRate.toFixed(2)),
      lwpDays: totalLwpDays,
      lwpDaysFromRecords,
      lwpDaysFromOverflow,
      daysInMonth,
    };

    // Format previous months data
    const previousMonthsData = previousScholarships.map((scholarship) => ({
      month: monthNames[scholarship.month - 1],
      year: scholarship.year.toString().slice(-2), // Last 2 digits of year
      amount: scholarship.finalAmount || 0,
    }));

    res.status(200).json({
      currentMonth: currentMonthData,
      previousMonths: previousMonthsData,
    });
  } catch (error) {
    console.error('Error fetching student scholarships:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get enjoyed leaves: full list with reason and computed summary
export const getEnjoyedLeaves = async (req, res) => {
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
    const student = await prisma.student.findUnique({ where: { userId: user.id } });
    if (!student) return res.status(404).json({ error: 'Student record not found' });

    const leaves = await prisma.leave.findMany({
      where: { studentId: student.id },
      orderBy: { applicationDate: 'desc' },
      include: { remarks: { orderBy: { actionDate: 'asc' } } },
    });

    const msPerDay = 1000 * 60 * 60 * 24;
    const formatDMY = (d) => {
      const date = new Date(d);
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };
    const durationDays = (start, end) => 1 + Math.floor((new Date(end) - new Date(start)) / msPerDay);
    const mapStatus = (status) => {
      if (status === 'APPROVED') return 'Final Approved';
      if (status === 'PENDING') return 'Pending Review';
      if (status === 'REJECTED') return 'Rejected';
      return String(status || '');
    };

    const items = leaves.map((leave) => {
      const firstStudentRemark = leave.remarks.find((r) => r.role === 'STUDENT');
      return {
        id: leave.id,
        type: String(leave.leaveType || '').toUpperCase(),
        duration: `${formatDMY(leave.startDate)} to ${formatDMY(leave.endDate)}`,
        days: durationDays(leave.startDate, leave.endDate),
        reason: firstStudentRemark?.remark || '',
        status: mapStatus(leave.status),
        appliedDate: formatDMY(leave.applicationDate),
      };
    });

    // Build summary
    const totalApplications = items.length;
    const clUsedDays = items
      .filter((i) => i.type === 'CL' && i.status === 'Final Approved')
      .reduce((sum, i) => sum + i.days, 0);
    const dlUsed = items.filter((i) => i.type === 'DL' && i.status === 'Final Approved').length;
    const lwpUsedDays = items
      .filter((i) => i.type === 'LWP' && i.status === 'Final Approved')
      .reduce((sum, i) => sum + i.days, 0);

    const summary = [
      { label: 'Total Applications', value: String(totalApplications), icon: '📄' },
      { label: 'CL Used', value: `${clUsedDays}/30`, icon: '📅' },
      { label: 'DL Used', value: String(dlUsed), icon: '🗓️' },
      { label: 'LWP Used', value: String(lwpUsedDays), icon: '📆' },
    ];

    res.status(200).json({ summary, items });
  } catch (error) {
    console.error('Error fetching enjoyed leaves:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get auto-generated leaves for student
export const getAutoGeneratedLeaves = async (req, res) => {
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
    const student = await prisma.student.findUnique({ where: { userId: user.id } });
    if (!student) return res.status(404).json({ error: 'Student record not found' });

    const autoLeaves = await prisma.leave.findMany({
      where: { 
        studentId: student.id,
        leaveSource: 'AUTO'
      },
      orderBy: { applicationDate: 'desc' },
      include: {
        remarks: {
          where: {
            remark: {
              contains: 'Auto-generated'
            }
          },
          orderBy: { actionDate: 'desc' }
        }
      }
    });

    const formatDate = (date) => {
      const d = new Date(date);
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    };

    const leaves = autoLeaves.map(leave => ({
      id: leave.id,
      leaveType: leave.leaveType,
      startDate: formatDate(leave.startDate),
      endDate: formatDate(leave.endDate),
      status: leave.status,
      applicationDate: formatDate(leave.applicationDate),
      remark: leave.remarks[0]?.remark || 'Auto-generated leave'
    }));

    res.status(200).json({ leaves });
  } catch (error) {
    console.error('Error fetching auto-generated leaves:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all leave applications for guide dashboard
export const getGuideLeaveApplications = async (req, res) => {
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
    
    // Check if user is a guide
    if (user.role !== 'GUIDE') {
      return res.status(403).json({ error: 'Access denied. Only guides can view leave applications.' });
    }

    // Fetch only CL and DL leave applications for students assigned to this guide
    const leaves = await prisma.leave.findMany({
      where: {
        leaveType: {
          in: ['CL', 'DL']
        },
        student: {
          OR: [
            { guideId: user.id },
            { coGuideId: user.id }
          ]
        }
      },
      orderBy: { applicationDate: 'desc' },
      include: {
        student: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              }
            },
            profile: {
              select: {
                ugcId: true,
              }
            }
          }
        },
        remarks: {
          orderBy: { actionDate: 'asc' },
          include: {
            user: {
              select: {
                name: true,
                role: true,
              }
            }
          }
        }
      }
    });

    const formatDate = (date) => {
      const d = new Date(date);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    };

    const mapStatus = (status) => {
      if (status === 'APPROVED') return 'Approved';
      if (status === 'PENDING') return 'Pending';
      if (status === 'REJECTED') return 'Rejected';
      return String(status || '');
    };

    const applications = leaves.map((leave) => {
      // Get all student remarks and filter out system routing messages
      const studentRemarks = leave.remarks.filter((r) => r.role === 'STUDENT');
      const actualStudentRemark = studentRemarks.find((r) => 
        !r.remark.includes('Leave request automatically routed to') && 
        !r.remark.includes('automatically routed')
      ) || studentRemarks[studentRemarks.length - 1]; // Fallback to last remark if no actual reason found
      
      const guideRemark = leave.remarks.find((r) => r.role === 'GUIDE');
      
      // Use student's actual reason for event name, or fallback to leave type
      const eventName = actualStudentRemark?.remark 
        ? (actualStudentRemark.remark.length > 50 
            ? actualStudentRemark.remark.substring(0, 50) + '...' 
            : actualStudentRemark.remark)
        : `${leave.leaveType} Leave Application`;
      
      return {
        id: leave.student.profile?.ugcId || leave.student.user.email.split('@')[0],
        studentName: leave.student.user.name || 'Unknown Student',
        eventName: eventName,
        submissionDate: formatDate(leave.applicationDate),
        points: 0, // Not applicable for leave applications
        batch: 'C1', // Default batch - you might want to add this to student profile
        status: mapStatus(leave.status),
        leaveType: leave.leaveType,
        reason: guideRemark?.remark || null,
        studentEmail: leave.student.user.email,
        startDate: leave.startDate,
        endDate: leave.endDate,
        applicationDate: leave.applicationDate,
        leaveId: leave.id,
        studentRemark: actualStudentRemark?.remark || '',
        documentPath: leave.documentPath || null,
      };
    });

    res.status(200).json({ applications });
  } catch (error) {
    console.error('Error fetching guide leave applications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all students for guide dashboard
export const getGuideStudents = async (req, res) => {
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
    
    // Check if user is a guide
    if (user.role !== 'GUIDE') {
      return res.status(403).json({ error: 'Access denied. Only guides can view student information.' });
    }

    // Fetch only students assigned to this guide (as guide or co-guide)
    const students = await prisma.student.findMany({
      where: {
        OR: [
          { guideId: user.id },
          { coGuideId: user.id }
        ]
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          }
        },
        profile: {
          select: {
            ugcId: true,
          }
        }
      },
      orderBy: {
        user: {
          name: 'asc'
        }
      }
    });

    const studentsList = students.map((student) => {
      return {
        id: student.profile?.ugcId || student.user.email.split('@')[0],
        name: student.user.name || 'Unknown Student',
        batch: 'C1', // Default batch - you might want to add this to student profile
        email: student.user.email,
        department: student.department || 'Computer Science',
      };
    });

    res.status(200).json({ students: studentsList });
  } catch (error) {
    console.error('Error fetching guide students:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Guide action on leave application (approve/reject)
export const guideActionOnLeave = async (req, res) => {
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
    
    // Check if user is a guide
    if (user.role !== 'GUIDE') {
      return res.status(403).json({ error: 'Access denied. Only guides can perform this action.' });
    }

    const { leaveId, action, reason } = req.body;

    // Validate required fields
    if (!leaveId || !action || !reason) {
      return res.status(400).json({ error: 'Leave ID, action, and reason are required' });
    }

    // Validate action
    if (!['APPROVED', 'REJECTED'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be APPROVED or REJECTED' });
    }

    // Check if leave application exists
    const leaveApplication = await prisma.leave.findUnique({
      where: { id: parseInt(leaveId) },
      include: {
        student: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              }
            }
          }
        }
      }
    });

    if (!leaveApplication) {
      return res.status(404).json({ error: 'Leave application not found' });
    }

    if (!['CL', 'DL'].includes(leaveApplication.leaveType)) {
      return res.status(400).json({ error: 'Only CL and DL leave applications can be processed by guides' });
    }

    // Update leave status
    await prisma.leave.update({
      where: { id: parseInt(leaveId) },
      data: { status: action }
    });

    // Note: CL leaves are now calculated dynamically based on approved leave days
    // No need to update clLeavesRemaining field as it's calculated in real-time

    // Create guide remark
    await prisma.remark.create({
      data: {
        leaveId: parseInt(leaveId),
        userId: user.id,
        role: 'GUIDE',
        remark: reason,
        actionDate: new Date(),
      }
    });

    res.status(200).json({ 
      message: `Leave application ${action.toLowerCase()} successfully`,
      leaveId: parseInt(leaveId),
      status: action,
      reason: reason
    });

  } catch (error) {
    console.error('Error performing guide action on leave:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all LWP leave applications for operator dashboard
export const getOperatorLWPApplications = async (req, res) => {
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
    
    // Check if user is an operator
    if (user.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can view LWP applications.' });
    }

    // Fetch only LWP leave applications with student and user information
    const leaves = await prisma.leave.findMany({
      where: {
        leaveType: 'LWP'
      },
      orderBy: { applicationDate: 'desc' },
      include: {
        student: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              }
            },
            profile: {
              select: {
                ugcId: true,
              }
            }
          }
        },
        remarks: {
          orderBy: { actionDate: 'asc' },
          include: {
            user: {
              select: {
                name: true,
                role: true,
              }
            }
          }
        }
      }
    });

    const formatDate = (date) => {
      const d = new Date(date);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[d.getMonth()]}, ${d.getDate()}, ${d.getFullYear()}`;
    };

    const mapStatus = (status) => {
      if (status === 'APPROVED') return 'Approved';
      if (status === 'PENDING') return 'Pending';
      if (status === 'REJECTED') return 'Rejected';
      return String(status || '');
    };

    const applications = leaves.map((leave) => {
      // Get all student remarks and filter out system routing messages
      const studentRemarks = leave.remarks.filter((r) => r.role === 'STUDENT');
      const actualStudentRemark = studentRemarks.find((r) => 
        !r.remark.includes('Leave request automatically routed to') && 
        !r.remark.includes('automatically routed')
      ) || studentRemarks[studentRemarks.length - 1]; // Fallback to last remark if no actual reason found
      
      const operatorRemark = leave.remarks.find((r) => r.role === 'OPERATOR');
      
      return {
        id: leave.student.profile?.ugcId || leave.student.user.email.split('@')[0],
        studentName: leave.student.user.name || 'Unknown Student',
        eventName: `${leave.leaveType} Leave Application`,
        submissionDate: formatDate(leave.applicationDate),
        points: 0, // Not applicable for leave applications
        batch: 'C1', // Default batch - you might want to add this to student profile
        status: mapStatus(leave.status),
        leaveType: leave.leaveType,
        reason: operatorRemark?.remark || null,
        studentEmail: leave.student.user.email,
        startDate: leave.startDate,
        endDate: leave.endDate,
        applicationDate: leave.applicationDate,
        leaveId: leave.id,
        studentRemark: actualStudentRemark?.remark || '',
      };
    });

    res.status(200).json({ applications });
  } catch (error) {
    console.error('Error fetching operator LWP applications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Operator action on LWP leave application (approve/reject)
export const operatorActionOnLeave = async (req, res) => {
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
    
    // Check if user is an operator
    if (user.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can perform this action.' });
    }

    const { leaveId, action, reason } = req.body;

    // Validate required fields
    if (!leaveId || !action || !reason) {
      return res.status(400).json({ error: 'Leave ID, action, and reason are required' });
    }

    // Validate action
    if (!['APPROVED', 'REJECTED'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be APPROVED or REJECTED' });
    }

    // Check if leave application exists and is LWP type
    const leaveApplication = await prisma.leave.findUnique({
      where: { id: parseInt(leaveId) },
      include: {
        student: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              }
            }
          }
        }
      }
    });

    if (!leaveApplication) {
      return res.status(404).json({ error: 'Leave application not found' });
    }

    if (leaveApplication.leaveType !== 'LWP') {
      return res.status(400).json({ error: 'Only LWP leave applications can be processed by operators' });
    }

    // Update leave status
    await prisma.leave.update({
      where: { id: parseInt(leaveId) },
      data: { status: action }
    });

    // Create operator remark
    await prisma.remark.create({
      data: {
        leaveId: parseInt(leaveId),
        userId: user.id,
        role: 'OPERATOR',
        remark: reason,
        actionDate: new Date(),
      }
    });

    res.status(200).json({ 
      message: `LWP leave application ${action.toLowerCase()} successfully`,
      leaveId: parseInt(leaveId),
      status: action,
      reason: reason
    });

  } catch (error) {
    console.error('Error performing operator action on leave:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all pending students for operator approval
export const getPendingStudents = async (req, res) => {
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
    
    // Check if user is an operator
    if (user.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can view pending students.' });
    }

    // Fetch all students with PENDING approval status
    const pendingStudents = await prisma.user.findMany({
      where: {
        role: 'STUDENT',
        approvalStatus: 'PENDING'
      },
      include: {
        student: {
          include: {
            profile: true,
            guide: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            },
            coGuide: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    const studentsList = pendingStudents.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name || 'Unknown Student',
      institutionalEmail: user.institutionalEmail,
      approvalStatus: user.approvalStatus,
      createdAt: user.updatedAt,
      studentId: user.student?.profile?.ugcId || user.student?.ugcId,
      department: user.student?.department,
      enrollmentYear: user.student?.enrollmentYear,
      profile: user.student?.profile,
      guideId: user.student?.guideId || null,
      coGuideId: user.student?.coGuideId || null,
      guide: user.student?.guide ? {
        id: user.student.guide.id,
        name: user.student.guide.name,
        email: user.student.guide.email,
      } : null,
      coGuide: user.student?.coGuide ? {
        id: user.student.coGuide.id,
        name: user.student.coGuide.name,
        email: user.student.coGuide.email,
      } : null,
    }));

    res.status(200).json({ students: studentsList });
  } catch (error) {
    console.error('Error fetching pending students:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Approve or reject a student
export const approveRejectStudent = async (req, res) => {
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

    const operator = verificationToken.user;
    
    // Check if user is an operator
    if (operator.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can approve/reject students.' });
    }

    const { studentId, action, reason } = req.body;

    // Validate required fields
    if (!studentId || !action) {
      return res.status(400).json({ error: 'Student ID and action are required' });
    }

    // Validate action
    if (!['APPROVED', 'REJECTED'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be APPROVED or REJECTED' });
    }

    // Check if student exists and is pending
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      include: { student: true }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (student.role !== 'STUDENT') {
      return res.status(400).json({ error: 'User is not a student' });
    }

    if (student.approvalStatus !== 'PENDING') {
      return res.status(400).json({ error: 'Student is not in pending status' });
    }

    // Update student approval status
    const updateData = {
      approvalStatus: action,
      approvedBy: operator.id,
      approvedAt: new Date(),
    };

    if (action === 'APPROVED') {
      updateData.isApproved = true;
    } else if (action === 'REJECTED') {
      updateData.isApproved = false;
      updateData.rejectionReason = reason || 'No reason provided';
    }

    await prisma.user.update({
      where: { id: studentId },
      data: updateData
    });

    res.status(200).json({ 
      message: `Student ${action.toLowerCase()} successfully`,
      studentId: studentId,
      action: action,
      reason: reason
    });

  } catch (error) {
    console.error('Error approving/rejecting student:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all students for operator management
export const getAllStudents = async (req, res) => {
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
    
    // Check if user is an operator
    if (user.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can view all students.' });
    }

    // Fetch all students with their approval status
    const students = await prisma.user.findMany({
      where: {
        role: 'STUDENT'
      },
      include: {
        student: {
          include: {
            profile: true,
            guide: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            },
            coGuide: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    const studentsList = students.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name || 'Unknown Student',
      institutionalEmail: user.institutionalEmail,
      approvalStatus: user.approvalStatus,
      isApproved: user.isApproved,
      isActive: user.isActive,
      createdAt: user.updatedAt,
      approvedAt: user.approvedAt,
      approvedBy: user.approvedBy,
      rejectionReason: user.rejectionReason,
      studentId: user.student?.profile?.ugcId || user.student?.ugcId,
      department: user.student?.department,
      enrollmentYear: user.student?.enrollmentYear,
      profile: user.student?.profile,
      guideId: user.student?.guideId,
      coGuideId: user.student?.coGuideId,
      guide: user.student?.guide,
      coGuide: user.student?.coGuide
    }));

    res.status(200).json({ students: studentsList });
  } catch (error) {
    console.error('Error fetching all students:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Activate or deactivate a student
export const toggleStudentStatus = async (req, res) => {
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

    const operator = verificationToken.user;
    
    // Check if user is an operator
    if (operator.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can manage student status.' });
    }

    const { studentId, isActive } = req.body;

    // Validate required fields
    if (!studentId || typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'Student ID and isActive status are required' });
    }

    // Check if student exists
    const student = await prisma.user.findUnique({
      where: { id: studentId }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (student.role !== 'STUDENT') {
      return res.status(400).json({ error: 'User is not a student' });
    }

    // Update student active status
    await prisma.user.update({
      where: { id: studentId },
      data: { isActive: isActive }
    });

    res.status(200).json({ 
      message: `Student ${isActive ? 'activated' : 'deactivated'} successfully`,
      studentId: studentId,
      isActive: isActive
    });

  } catch (error) {
    console.error('Error toggling student status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Upload profile photo
export const uploadProfilePhoto = async (req, res) => {
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
    
    if (!req.file) {
      return res.status(400).json({ error: 'No profile photo uploaded' });
    }

    const profilePhoto = req.file;
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(profilePhoto.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, and GIF images are allowed' });
    }

    // Validate file size (5MB max for base64 storage)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (profilePhoto.size > maxSize) {
      return res.status(400).json({ error: 'File size too large. Maximum size is 5MB' });
    }

    // Convert to base64
    const base64Photo = profilePhoto.buffer.toString('base64');
    const dataUrl = `data:${profilePhoto.mimetype};base64,${base64Photo}`;
    
    // Update the user's profile photo in database as base64
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        institutionalEmail: user.institutionalEmail || user.email,
        profilePhotoUrl: dataUrl
      },
    });

    res.status(200).json({ 
      message: 'Profile photo uploaded successfully',
      photoUrl: dataUrl
    });

  } catch (error) {
    console.error('Error uploading profile photo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update student profile by operator
export const updateStudentProfile = async (req, res) => {
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

    const operator = verificationToken.user;
    
    // Check if user is an operator
    if (operator.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can update student profiles.' });
    }

    const { studentId, profileData } = req.body;

    // Validate required fields
    if (!studentId || !profileData) {
      return res.status(400).json({ error: 'Student ID and profile data are required' });
    }

    // Check if student exists
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      include: { student: { include: { profile: true } } }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (student.role !== 'STUDENT') {
      return res.status(400).json({ error: 'User is not a student' });
    }

    // Update User table
    await prisma.user.update({
      where: { id: studentId },
      data: {
        name: profileData.studentName ? profileData.studentName.toUpperCase() : student.name,
        institutionalEmail: profileData.institutionalEmail || student.institutionalEmail,
      },
    });

    // Validate and set guide and co-guide IDs if provided
    let guideId = student.student.guideId;
    let coGuideId = student.student.coGuideId;
    
    // Only update guideId if a valid (non-empty) value is provided
    if (profileData.guideId && String(profileData.guideId).trim() !== '') {
      const guide = await prisma.user.findUnique({
        where: { id: String(profileData.guideId) },
      });
      if (!guide || guide.role !== 'GUIDE') {
        return res.status(400).json({ error: 'Invalid guide ID' });
      }
      guideId = String(profileData.guideId);
    }
    
    // Handle co-guide: can be updated or cleared (empty string means clear)
    if (profileData.coGuideId !== undefined) {
      const coGuideIdStr = String(profileData.coGuideId).trim();
      if (coGuideIdStr !== '') {
        const coGuide = await prisma.user.findUnique({
          where: { id: coGuideIdStr },
        });
        if (!coGuide || coGuide.role !== 'GUIDE') {
          return res.status(400).json({ error: 'Invalid co-guide ID' });
        }
        coGuideId = coGuideIdStr;
      } else {
        // Allow clearing co-guide by sending empty string
        coGuideId = null;
      }
    }

    // Update Student table
    await prisma.student.update({
      where: { id: student.student.id },
      data: {
        department: student.student.department, // Keep existing department
        scholarshipType: profileData.scholarshipType || student.student.scholarshipType,
        scholarshipAmount: profileData.scholarshipAmount ? parseInt(profileData.scholarshipAmount) : student.student.scholarshipAmount,
        ugcId: profileData.studentId || student.student.ugcId,
        guideId: guideId,
        coGuideId: coGuideId,
      },
    });

    // Update or create StudentProfile
    if (student.student.profile) {
      // Update existing profile
      await prisma.studentProfile.update({
        where: { studentId: student.student.id },
        data: {
          employeeId: profileData.employeeId ? profileData.employeeId.toUpperCase() : student.student.profile.employeeId,
          admissionDate: profileData.admissionDate ? new Date(profileData.admissionDate) : student.student.profile.admissionDate,
          registrationDate: profileData.registrationDate ? new Date(profileData.registrationDate) : student.student.profile.registrationDate,
          currentSemester: profileData.currentSemester ? parseInt(profileData.currentSemester) : student.student.profile.currentSemester,
          gender: profileData.gender || student.student.profile.gender,
          birthDate: profileData.birthDate ? new Date(profileData.birthDate) : student.student.profile.birthDate,
          admissionCastCategory: profileData.admissionCastCategory || student.student.profile.admissionCastCategory,
          actualCastCategory: profileData.actualCastCategory || student.student.profile.actualCastCategory,
          nationality: profileData.nationality ? profileData.nationality.toUpperCase() : student.student.profile.nationality,
          localFullAddress: profileData.localAddress ? profileData.localAddress.toUpperCase() : student.student.profile.localFullAddress,
          permanentFullAddress: profileData.permanentAddress ? profileData.permanentAddress.toUpperCase() : student.student.profile.permanentFullAddress,
          country: profileData.country ? profileData.country.toUpperCase() : student.student.profile.country,
          mobileNo: profileData.mobileNo || student.student.profile.mobileNo,
          guardianMobileNo: profileData.guardianMobileNo || student.student.profile.guardianMobileNo,
          guardianEmail: profileData.guardianEmail ? profileData.guardianEmail.toLowerCase() : student.student.profile.guardianEmail,
          personalEmail: profileData.personalEmail ? profileData.personalEmail.toLowerCase() : student.student.profile.personalEmail,
          isHandicapped: Boolean(profileData.isHandicapped),
          disability: profileData.disability ? profileData.disability.toUpperCase() : student.student.profile.disability,
          photoUploaded: student.student.profile.photoUploaded,
          belongsToSamaj: Boolean(profileData.belongsToSamaj),
          hostelNameAndAddress: profileData.hostelNameAddress ? profileData.hostelNameAddress.toUpperCase() : student.student.profile.hostelNameAndAddress,
          aadhaarNumber: profileData.aadhaarNumber || student.student.profile.aadhaarNumber,
          pancardNumber: profileData.pancardNumber ? profileData.pancardNumber.toUpperCase() : student.student.profile.pancardNumber,
          nameOfGuide: profileData.nameOfGuide ? profileData.nameOfGuide.toUpperCase() : student.student.profile.nameOfGuide,
          scholarshipAmount: profileData.scholarshipAmount ? parseInt(profileData.scholarshipAmount) : student.student.profile.scholarshipAmount,
          contingencyAmount: profileData.contingencyAmount ? parseInt(profileData.contingencyAmount) : student.student.profile.contingencyAmount,
          scholarshipType: profileData.scholarshipType || student.student.profile.scholarshipType,
          ugcId: profileData.studentId ? profileData.studentId.toUpperCase() : student.student.profile.ugcId,
        },
      });
    } else {
      // Create new profile
      await prisma.studentProfile.create({
        data: {
          studentId: student.student.id,
          employeeId: profileData.employeeId ? profileData.employeeId.toUpperCase() : null,
          admissionDate: profileData.admissionDate ? new Date(profileData.admissionDate) : new Date(),
          registrationDate: profileData.registrationDate ? new Date(profileData.registrationDate) : new Date(),
          currentSemester: profileData.currentSemester ? parseInt(profileData.currentSemester) : 1,
          gender: profileData.gender || 'MALE',
          birthDate: profileData.birthDate ? new Date(profileData.birthDate) : new Date(),
          admissionCastCategory: profileData.admissionCastCategory || 'GENERAL',
          actualCastCategory: profileData.actualCastCategory || 'GENERAL',
          nationality: profileData.nationality ? profileData.nationality.toUpperCase() : 'INDIAN',
          localFullAddress: profileData.localAddress ? profileData.localAddress.toUpperCase() : '',
          permanentFullAddress: profileData.permanentAddress ? profileData.permanentAddress.toUpperCase() : '',
          country: profileData.country ? profileData.country.toUpperCase() : 'INDIA',
          mobileNo: profileData.mobileNo || '',
          guardianMobileNo: profileData.guardianMobileNo || null,
          guardianEmail: profileData.guardianEmail ? profileData.guardianEmail.toLowerCase() : null,
          personalEmail: profileData.personalEmail ? profileData.personalEmail.toLowerCase() : null,
          isHandicapped: Boolean(profileData.isHandicapped),
          disability: profileData.disability ? profileData.disability.toUpperCase() : null,
          photoUploaded: false,
          belongsToSamaj: Boolean(profileData.belongsToSamaj),
          hostelNameAndAddress: profileData.hostelNameAddress ? profileData.hostelNameAddress.toUpperCase() : null,
          aadhaarNumber: profileData.aadhaarNumber || null,
          pancardNumber: profileData.pancardNumber ? profileData.pancardNumber.toUpperCase() : null,
          nameOfGuide: profileData.nameOfGuide ? profileData.nameOfGuide.toUpperCase() : null,
          scholarshipAmount: profileData.scholarshipAmount ? parseInt(profileData.scholarshipAmount) : 30000,
          contingencyAmount: profileData.contingencyAmount ? parseInt(profileData.contingencyAmount) : null,
          scholarshipType: profileData.scholarshipType || null,
          ugcId: profileData.studentId ? profileData.studentId.toUpperCase() : null,
        },
      });
    }

    res.status(200).json({ 
      message: 'Student profile updated successfully',
      studentId: studentId
    });

  } catch (error) {
    console.error('Error updating student profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add Guide
export const addGuide = async (req, res) => {
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

    const operator = verificationToken.user;
    if (operator.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can add guides.' });
    }

    const { name, guideId, email, password } = req.body;

    if (!name || !guideId || !email || !password) {
      return res.status(400).json({ error: 'Name, Guide ID, Email, and Password are required' });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Check if guide ID is already taken
    const existingGuideId = await prisma.user.findUnique({ where: { id: String(guideId) } });
    if (existingGuideId) {
      return res.status(400).json({ error: 'Guide ID already registered' });
    }

    // Create guide user
    const guideUser = await prisma.user.create({
      data: {
        id: String(guideId), // Use guide ID as the user ID
        email,
        name,
        password,
        role: 'GUIDE',
        isVerified: true,
        isActive: true,
      },
    });

    res.status(201).json({
      message: 'Guide added successfully',
      guide: {
        id: guideUser.id,
        name: guideUser.name,
        guideId,
        email: guideUser.email,
        role: guideUser.role,
      },
    });
  } catch (error) {
    console.error('Error adding guide:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add Co-guide
export const addCoGuide = async (req, res) => {
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

    const operator = verificationToken.user;
    if (operator.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can add co-guides.' });
    }

    const { name, coGuideId, email, password } = req.body;

    if (!name || !coGuideId || !email || !password) {
      return res.status(400).json({ error: 'Name, Co-guide ID, Email, and Password are required' });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Check if co-guide ID is already taken
    const existingCoGuideId = await prisma.user.findUnique({ where: { id: String(coGuideId) } });
    if (existingCoGuideId) {
      return res.status(400).json({ error: 'Co-guide ID already registered' });
    }

    // Create co-guide user (also with GUIDE role)
    const coGuideUser = await prisma.user.create({
      data: {
        id: String(coGuideId), // Use co-guide ID as the user ID
        email,
        name,
        password,
        role: 'GUIDE',
        isVerified: true,
        isActive: true,
      },
    });

    res.status(201).json({
      message: 'Co-guide added successfully',
      coGuide: {
        id: coGuideUser.id,
        name: coGuideUser.name,
        coGuideId,
        email: coGuideUser.email,
        role: coGuideUser.role,
      },
    });
  } catch (error) {
    console.error('Error adding co-guide:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get Available Guides and Co-guides
export const getAvailableGuides = async (req, res) => {
  try {
    // Get all users with GUIDE role
    const guides = await prisma.user.findMany({
      where: {
        role: 'GUIDE',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        institutionalEmail: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.status(200).json({
      guides,
    });
  } catch (error) {
    console.error('Error fetching guides:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get All Guides (for operator dashboard)
// Batch transfer students from one guide to another
export const batchTransferStudents = async (req, res) => {
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

    const operator = verificationToken.user;
    
    // Check if user is an operator
    if (operator.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can perform batch transfers.' });
    }

    const { fromGuideId, toGuideId } = req.body;

    // Validate required fields
    if (!fromGuideId || !toGuideId) {
      return res.status(400).json({ error: 'From Guide ID and To Guide ID are required' });
    }

    if (fromGuideId === toGuideId) {
      return res.status(400).json({ error: 'From Guide and To Guide cannot be the same' });
    }

    // Verify both guides exist and are valid
    const fromGuide = await prisma.user.findUnique({
      where: { id: fromGuideId },
    });

    const toGuide = await prisma.user.findUnique({
      where: { id: toGuideId },
    });

    if (!fromGuide || fromGuide.role !== 'GUIDE') {
      return res.status(400).json({ error: 'Invalid From Guide ID' });
    }

    if (!toGuide || toGuide.role !== 'GUIDE') {
      return res.status(400).json({ error: 'Invalid To Guide ID' });
    }

    // Find all students assigned to the from guide
    const studentsToTransfer = await prisma.student.findMany({
      where: {
        guideId: fromGuideId,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          }
        }
      }
    });

    if (studentsToTransfer.length === 0) {
      return res.status(400).json({ error: 'No students found assigned to the selected guide' });
    }

    // Transfer all students to the new guide
    const updateResult = await prisma.student.updateMany({
      where: {
        guideId: fromGuideId,
      },
      data: {
        guideId: toGuideId,
      },
    });

    res.status(200).json({
      message: `Successfully transferred ${updateResult.count} student(s) from ${fromGuide.name || fromGuide.email} to ${toGuide.name || toGuide.email}`,
      transferredCount: updateResult.count,
      fromGuide: {
        id: fromGuide.id,
        name: fromGuide.name || fromGuide.email,
      },
      toGuide: {
        id: toGuide.id,
        name: toGuide.name || toGuide.email,
      },
    });
  } catch (error) {
    console.error('Error performing batch transfer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllGuides = async (req, res) => {
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

    const operator = verificationToken.user;
    if (operator.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can view guides.' });
    }

    const guides = await prisma.user.findMany({
      where: {
        role: 'GUIDE',
      },
      select: {
        id: true,
        name: true,
        email: true,
        institutionalEmail: true,
        isActive: true,
        _count: {
          select: {
            guidedStudents: true,
            coGuidedStudents: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.status(200).json({
      guides: guides.map((guide) => ({
        id: guide.id,
        name: guide.name || 'Unknown',
        email: guide.email,
        status: guide.isActive ? 'Active' : 'Inactive',
        studentCount: guide._count.guidedStudents + guide._count.coGuidedStudents,
      })),
    });
  } catch (error) {
    console.error('Error fetching all guides:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get monthly report for all students (for operator)
export const getMonthlyReport = async (req, res) => {
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
    if (user.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Access denied. Only operators can view monthly reports.' });
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

    // Process each student - use EXACT same calculation as student dashboard APIs
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
          department: student.profile?.department || student.department || 'Unknown',
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
    console.error('Error fetching monthly report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get monthly report for guide's students only
export const getGuideMonthlyReport = async (req, res) => {
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
    if (user.role !== 'GUIDE') {
      return res.status(403).json({ error: 'Access denied. Only guides can view this report.' });
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

    // Get only students assigned to this guide (as guide or co-guide)
    const students = await prisma.student.findMany({
      where: {
        OR: [
          { guideId: user.id },
          { coGuideId: user.id }
        ],
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
          department: student.profile?.department || student.department || 'Unknown',
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
    console.error('Error fetching guide monthly report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};