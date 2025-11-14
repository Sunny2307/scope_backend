import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

async function testAPI() {
  try {
    console.log('Testing API endpoints...');
    
    // Test the basic endpoint
    const testResponse = await axios.get(`${API_BASE_URL}/test`);
    console.log('✅ Test endpoint:', testResponse.data);
    
    // Test the saveStudentProfile endpoint with sample data
    const sampleData = {
      userEmail: 'test@example.com',
      studentId: 'TEST123',
      studentName: 'Test Student',
      admissionDate: '2024-01-01',
      registrationDate: '2024-01-15',
      currentSemester: 1,
      gender: 'MALE',
      birthDate: '2000-01-01',
      admissionCastCategory: 'GENERAL',
      actualCastCategory: 'GENERAL',
      nationality: 'Indian',
      localAddress: 'Test Local Address',
      permanentAddress: 'Test Permanent Address',
      country: 'India',
      mobileNo: '1234567890',
      guardianMobileNo: '0987654321',
      guardianEmail: 'guardian@example.com',
      personalEmail: 'personal@example.com',
      institutionalEmail: 'institutional@example.com',
      isHandicapped: false,
      disability: '',
      belongsToSamaj: false,
      hostelNameAddress: 'Test Hostel',
      nameOfGuide: 'Dr. Test Guide',
      scholarshipAmount: 30000,
      contingencyAmount: 5000,
      scholarshipType: 'CPSF',
      aadhaarNumber: '123456789012',
      pancardNumber: 'ABCDE1234F'
    };
    
    console.log('Testing saveStudentProfile endpoint...');
    const profileResponse = await axios.post(`${API_BASE_URL}/auth/student/saveStudentProfile`, sampleData);
    console.log('✅ Save profile response:', profileResponse.data);
    
  } catch (error) {
    console.error('❌ API test failed:', error.response?.data || error.message);
  }
}

testAPI(); 