import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const EXCEL_PATH = process.env.GUIDE_EXCEL_PATH
  ? path.resolve(process.env.GUIDE_EXCEL_PATH)
  : path.resolve('..', 'Guide List.xlsx');

const normalize = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const pickFromRow = (row, variants) => {
  for (const key of variants) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
};

function loadGuides() {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(
      `Excel file not found at ${EXCEL_PATH}. Update GUIDE_EXCEL_PATH or place "Guide List.xlsx" in the project root.`,
    );
  }

  const workbook = xlsx.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

  const guides = [];
  rows.forEach((row, index) => {
    const name = normalize(
      pickFromRow(row, ['Guide name', 'guide name', 'Name', 'name']),
    );
    const email = normalize(
      pickFromRow(row, ['email', 'Email', 'Institutional Email']),
    )?.toLowerCase();
    const password = normalize(pickFromRow(row, ['password', 'Password']));
    const guideId = normalize(
      pickFromRow(row, ['guide id', 'guideId', 'Guide ID', 'guide_id', 'Guide Id']),
    );

    if (!email || !password) {
      console.warn(
        `Skipping row ${index + 2}: missing required email or password.`,
      );
      return;
    }

    if (!guideId) {
      console.warn(
        `Skipping row ${index + 2}: missing required guide ID.`,
      );
      return;
    }

    guides.push({
      id: String(guideId), // Use guide ID as the user ID
      email,
      name,
      institutionalEmail: email,
      role: 'GUIDE',
      isActive: true,
      isVerified: true,
      password,
    });
  });

  return guides;
}

async function main() {
  const guides = loadGuides();
  if (!guides.length) {
    console.log('No guides found in Excel; nothing to import.');
    return;
  }

  const uniqueGuides = Array.from(
    new Map(guides.map((guide) => [guide.email, guide])).values(),
  );

  const result = await prisma.user.createMany({
    data: uniqueGuides,
    skipDuplicates: true,
  });

  console.log(`Processed ${uniqueGuides.length} guides from Excel.`);
  console.log(
    `Prisma reported ${result.count} new records (existing emails skipped).`,
  );
}

main()
  .catch((error) => {
    console.error('Guide import failed:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


