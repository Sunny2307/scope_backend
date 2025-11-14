# Excel File Format Guide for Attendance Upload

## Overview
This guide explains the expected format for Excel files used to upload attendance data and automatically generate leave records for absent students.

## Required File Format
- **File Types**: `.xlsx`, `.xls`, or `.csv`
- **Maximum Size**: 10MB
- **Encoding**: UTF-8 (for CSV files)

## Expected Structure

### Header Section
The Excel file should have a header section containing:
- **Title**: "Monthly Status Report (Basic Work Duration)"
- **Date Range**: "Jun 01 2025 To Jun 30 2025"
- **Company**: "URC"
- **Department**: "FOS" (Finance Operations Services)
- **Printed Date**: Current date and time

### Daily Attendance Grid (Row 7)
Row 7 serves as the header for daily attendance with columns for each day:
- **Columns B through AP**: Days 1-30 with day names
- **Format**: "1 S", "2 M", "3 T", "4 W", "5 T", "6 F", "7 S", etc.
- **Example**: "1 S" = 1st Sunday, "2 M" = 2nd Monday, etc.

### Employee Data Blocks
Each employee's data is presented in a block structure with multiple rows:

#### Employee Information Rows
- **Emp. Code Row**: Contains "Emp. Code:" followed by the 5-digit employee code (e.g., 11501)
- **Emp. Name Row**: Contains "Emp. Name:" followed by the employee's full name (e.g., "23CE137 TILVA AAYUSH JAYESHBHAI")

#### Attendance Data Rows
Each employee block contains these rows in sequence:

1. **Status Row**: 
   - **First Cell**: Contains "Status"
   - **Daily Columns**: Contains attendance status for each day
   - **Values**: 
     - "P" = Present
     - "A" = Absent (will generate leave record)
     - "WO" = Weekly Off

2. **InTime Row**:
   - **First Cell**: Contains "InTime"
   - **Daily Columns**: Clock-in time (HH:MM format) for present days, blank for absent/weekly off days

3. **OutTime Row**:
   - **First Cell**: Contains "OutTime"
   - **Daily Columns**: Clock-out time (HH:MM format) for present days, blank for absent/weekly off days

4. **Total Row**:
   - **First Cell**: Contains "Total"
   - **Daily Columns**: Total work duration (HH:MM format) for present days, "00:00" for absent/weekly off days

## Example Structure

```
| A           | B     | C     | D     | ... | AP    |
|-------------|-------|-------|-------|-----|-------|
|             | 1 S   | 2 M   | 3 T   | ... | 30 M  |
|             |       |       |       |     |       |
| Emp. Code:  | 11501 |       |       | ... |       |
| Emp. Name:  | 23CE137 TILVA AAYUSH JAYESHBHAI | ... |       |
| Status      | WO    | P     | P     | ... | P     |
| InTime      |       | 09:24 | 09:17 | ... | 09:31 |
| OutTime     |       | 16:36 | 16:53 | ... | 17:03 |
| Total       | 00:00 | 7:12  | 7:36  | ... | 7:32  |
|             |       |       |       |     |       |
| Emp. Code:  | 11502 |       |       | ... |       |
| Emp. Name:  | 23CE122 RADADIYA SUNNY VIPULBHAI | ... |       |
| Status      | WO    | P     | P     | ... | P     |
| InTime      |       | 09:24 | 09:54 | ... | 09:31 |
| OutTime     |       | 16:36 | 17:30 | ... | 17:05 |
| Total       | 00:00 | 7:12  | 7:36  | ... | 7:34  |
```

## Important Notes

1. **Date Range**: The system expects data for June 2025 (columns 1-30)
2. **Employee ID**: Must match the `employeeId` field in student profiles
3. **Absent Days**: Only days marked with 'A' will generate leave records
4. **Duplicate Prevention**: The system checks for existing leave records before generating new ones
5. **Leave Type**: All auto-generated leaves are set to 'CL' (Casual Leave) type
6. **Status**: Auto-generated leaves are automatically approved
7. **Structure**: The system automatically detects the daily columns and employee blocks

## Processing Results

After upload, the system will provide:
- Total employees processed
- Total leaves generated
- Detailed summary for each employee
- List of absent days and whether leaves were generated
- Any errors encountered during processing

## Error Handling

Common errors and solutions:
- **"Daily headers (days 1-30) not found"**: Ensure the daily columns are properly formatted with day numbers and letters
- **"Student not found for employee ID"**: The employee ID doesn't exist in the database
- **"Invalid Excel file format"**: Check that the file has the expected structure with employee blocks

## Sample File
A sample Excel file is available at: `FOS_June-2025_RS Monthly Status Report (1)_sample.xls`

## Support
For technical support or questions about the file format, please contact the system administrator.
