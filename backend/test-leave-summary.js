import axios from 'axios';

async function testLeaveSummary() {
  try {
    // You'll need to replace this with a valid token from your database
    const token = 'your-test-token-here';
    
    const response = await axios.get('http://localhost:3000/api/auth/student/leave-summary', {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    console.log('Leave Summary Response:', response.data);
  } catch (error) {
    console.error('Error testing leave summary:', error.response?.data || error.message);
  }
}

testLeaveSummary();

