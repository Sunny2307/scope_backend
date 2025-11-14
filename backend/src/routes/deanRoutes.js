import express from 'express';
import {
  getAllStudentsWithLeaves,
  getStudentsByGuide,
  getAllGuides,
  getLeaveStatistics,
  getMonthlyLeaveCalendar,
  getDeanMonthlyReport
} from '../controllers/deanController.js';

const router = express.Router();

// Get all students with their leave data
router.get('/students', getAllStudentsWithLeaves);

// Get students filtered by guide
router.get('/students/guide/:guideId', getStudentsByGuide);

// Get all guides for filter dropdown
router.get('/guides', getAllGuides);

// Get leave statistics for dashboard
router.get('/statistics', getLeaveStatistics);

// Get monthly leave calendar aggregation
router.get('/calendar', getMonthlyLeaveCalendar);

// Get monthly report for dean
router.get('/monthly-report', getDeanMonthlyReport);

export default router;

