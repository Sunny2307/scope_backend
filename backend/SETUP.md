# Backend Setup Guide

## Database Configuration

The application requires a PostgreSQL database. Follow these steps to set up the database connection:

### 1. Create a `.env` file

Create a `.env` file in the `backend` directory with the following content:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/scope_db"

# Server Configuration
PORT=3000

# Email Configuration (for OTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

### 2. Replace the DATABASE_URL

Replace the `DATABASE_URL` with your actual PostgreSQL connection string:
- `username`: Your database username
- `password`: Your database password
- `localhost`: Your database host (use `localhost` for local development)
- `5432`: PostgreSQL port (default is 5432)
- `scope_db`: Your database name

### 3. Test Database Connection

Run the test script to verify your database connection:

```bash
node test-db.js
```

### 4. Generate Prisma Client

If the database connection is successful, generate the Prisma client:

```bash
npx prisma generate
```

### 5. Run Database Migrations

Apply the database schema:

```bash
npx prisma db push
```

## Common Issues and Solutions

### Issue: "Failed to connect to the database"
- **Solution**: Check your `DATABASE_URL` in the `.env` file
- **Solution**: Ensure PostgreSQL is running
- **Solution**: Verify database credentials

### Issue: "Student profile already exists"
- **Solution**: This error occurs when trying to create a duplicate profile
- **Solution**: Check if the user already has a profile in the database

### Issue: "Invalid enum value"
- **Solution**: The form now properly validates enum values
- **Solution**: Ensure you're using the correct values (MALE/FEMALE/OTHER, GENERAL/SC/ST/OBC/OTHER, etc.)

## Form Data Validation

The application now includes comprehensive validation for all required fields:

### Required Fields:
- Student ID
- Student Name
- Admission Date
- Registration Date
- Current Semester
- Gender
- Birth Date
- Admission Cast Category
- Actual Cast Category
- Nationality
- Local Address
- Permanent Address
- Country
- Mobile Number
- Personal Email
- Institutional Email
- Aadhaar Number
- Pancard Number

### Enum Values:
- **Gender**: MALE, FEMALE, OTHER
- **Cast Categories**: GENERAL, SC, ST, OBC, OTHER
- **Scholarship Types**: CPSF, SODH, UGC_CSIR_JRF, DST_INSPIRE, OTHER

## Running the Application

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. The server will run on `http://localhost:3000`

## API Endpoints

- `POST /api/auth/signup` - User signup
- `POST /api/auth/verify-otp` - Verify OTP
- `POST /api/auth/set-password` - Set password
- `POST /api/auth/login` - User login
- `POST /api/auth/student/saveStudentProfile` - Save student profile
- `POST /api/auth/generate-token` - Generate token
- `GET /api/auth/verify-token` - Verify token 