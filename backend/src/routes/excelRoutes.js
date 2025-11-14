import express from 'express';
import multer from 'multer';
import { uploadExcelAndProcessAbsences, getUploadHistory, testDatabaseConnection } from '../controllers/excelController.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.mimetype === 'text/csv') {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files (.xlsx, .xls) and CSV files are allowed'), false);
        }
    }
});

// Test route to check database connectivity
router.get('/test-db', testDatabaseConnection);

// Route to upload and process Excel file
router.post('/upload', upload.single('excelFile'), uploadExcelAndProcessAbsences);

// Route to get upload history
router.get('/history', getUploadHistory);

export default router;
