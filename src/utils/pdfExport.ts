import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import {
  calculateBmi,
  computeCommonIssues,
  computeFrequentVisitors,
  extractDatePart,
  formatMedicineDisplay,
  formatShiftPeriodLabel,
  formatTimeFromDatetime,
  getStockStatus,
  resolveVisitShiftPeriod,
  type DailyLogEntry,
  type HealthProfileRecord,
  type MeasurementRecord,
  type NurseDatabase,
  type StudentRecord,
  type VisitRecord,
} from './nurseLogic.ts';
import { DEFAULT_STAFF_NAME, SCHOOL_NAME } from './seedData.ts';

export type PrintReportConfig =
  | {
      type: 'daily-log';
      date: string;
      entries: DailyLogEntry[];
      staffName?: string;
      nurseName?: string;
    }
  | {
      type: 'student-history';
      student: StudentRecord;
      visits: VisitRecord[];
      healthProfiles: HealthProfileRecord[];
      latestMeasurement?: MeasurementRecord;
      startDate?: string;
      endDate?: string;
      staffName?: string;
      nurseName?: string;
    }
  | {
      type: 'single-visit';
      student: StudentRecord;
      visit: VisitRecord;
      staffName?: string;
      nurseName?: string;
    };

export type DownloadableSheetTab =
  | 'Students'
  | 'Visits'
  | 'Measurements'
  | 'Health Profiles'
  | 'Medicines'
  | 'Items'
  | 'Bills'
  | 'Stock Ledger'
  | 'Doctor Visits'
  | 'External OPD'
  | 'Medical Camps'
  | 'Annual Checkups'
  | 'Health Insights'
  | 'Menstrual Log'
  | 'All';

export type DownloadableExcelTab = Exclude<DownloadableSheetTab, 'Health Insights'>;

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY?: number;
  };
};

// Standard PDF WinAnsi fonts (helvetica) do not support U+20B9 (₹) or some arrows/bullets cleanly
function pdfSafeText(value: unknown): string {
  return String(value ?? '')
    .replace(/₹/g, 'Rs. ')
    .replace(/•/g, '-')
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/·/g, '|')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function pdfSafeOrDash(value: unknown): string {
  const s = pdfSafeText(value);
  return s || '-';
}

function formatInrPdf(amount: number): string {
  const num = Number(amount) || 0;
  return `Rs. ${num.toLocaleString('en-IN', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function getPrintReportPdfFilename(config: PrintReportConfig): string {
  if (config.type === 'daily-log') {
    return `Infirmary-Daily-Log-${config.date}.pdf`;
  }
  if (config.type === 'student-history') {
    const sanitizedName = config.student.full_name.replace(/[^a-zA-Z0-9]/g, '_');
    return `Health-History-${sanitizedName}-${config.student.roll_number}.pdf`;
  }
  const sanitizedName = config.student.full_name.replace(/[^a-zA-Z0-9]/g, '_');
  return `Visit-Slip-${sanitizedName}-${config.visit.visit_id}.pdf`;
}

export function getSheetPdfFilename(tab: DownloadableSheetTab, todayIso?: string): string {
  const todayStamp = todayIso || new Date().toISOString().slice(0, 10);
  return tab === 'All'
    ? `SVA_Infirmary_All_Sheets_${todayStamp}.pdf`
    : `SVA_${tab.replace(/\s+/g, '_')}_${todayStamp}.pdf`;
}

function drawPortraitLetterhead(doc: jsPDF, todayIso: string, subtitle?: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(24, 24, 27);
  doc.text(pdfSafeText(SCHOOL_NAME), margin, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(82, 82, 91);
  doc.text('School Infirmary & Student Health Department', margin, 56);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text('Official Health Record', pageWidth - margin, 42, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  doc.text(`Generated: ${todayIso}`, pageWidth - margin, 55, { align: 'right' });

  doc.setDrawColor(24, 24, 27);
  doc.setLineWidth(1.2);
  doc.line(margin, 66, pageWidth - margin, 66);

  if (subtitle) {
    doc.setFontSize(8.5);
    doc.setTextColor(113, 113, 122);
    doc.text(pdfSafeText(subtitle), margin, 78);
    return 88;
  }

  return 78;
}

function drawPortraitRunningHeader(doc: jsPDF, subtitle: string, todayIso: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(24, 24, 27);
  doc.text(`${pdfSafeText(SCHOOL_NAME)} | ${pdfSafeText(subtitle)}`, margin, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(113, 113, 122);
  doc.text(`Generated: ${todayIso}`, pageWidth - margin, 26, { align: 'right' });

  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.5);
  doc.line(margin, 32, pageWidth - margin, 32);
}

function drawPortraitSignatures(doc: JsPdfWithAutoTable, startY: number, staffName: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const neededHeight = 82;

  let y = startY + 22;
  if (y + neededHeight > pageHeight - 40) {
    doc.addPage();
    y = 54;
  }

  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);

  const boxWidth = 185;
  const leftX = margin;
  const rightX = pageWidth - margin - boxWidth;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(39, 39, 42);
  doc.text('Staff In-Charge Signature:', leftX, y + 18);
  doc.text('Principal Signature:', rightX, y + 18);

  doc.setDrawColor(161, 161, 170);
  doc.setLineWidth(0.75);
  doc.line(leftX, y + 52, leftX + boxWidth, y + 52);
  doc.line(rightX, y + 52, rightX + boxWidth, y + 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(113, 113, 122);
  doc.text(pdfSafeText(staffName || 'Signature & Name'), leftX, y + 64);
  doc.text('Signature & Date', rightX, y + 64);
}

function stampPortraitFooters(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(161, 161, 170);
    doc.text(
      `${pdfSafeText(SCHOOL_NAME)} | Confidential Student Health Record`,
      margin,
      pageHeight - 22
    );
    doc.text(
      `Page ${i} of ${pageCount} | Valid with official signature`,
      pageWidth - margin,
      pageHeight - 22,
      { align: 'right' }
    );
  }
}

export function buildPrintReportPdfDoc(
  config: PrintReportConfig,
  staffNameArg?: string,
  todayIsoArg?: string
): { doc: jsPDF; filename: string } {
  const staffName = staffNameArg || config.staffName || config.nurseName || DEFAULT_STAFF_NAME;
  const todayIso = todayIsoArg || new Date().toISOString().slice(0, 10);
  const filename = getPrintReportPdfFilename(config);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  let y = drawPortraitLetterhead(doc, todayIso);

  if (config.type === 'daily-log') {
    // Summary strip
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.7);
    doc.rect(margin, y, contentWidth, 34, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(24, 24, 27);
    doc.text('DAILY STUDENT INFIRMARY LOG', margin + 10, y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(82, 82, 91);
    doc.text('Chronological infirmary attendance register', margin + 10, y + 26);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(24, 24, 27);
    doc.text(
      `Log Date: ${config.date}  |  Total Visits: ${config.entries.length}`,
      pageWidth - margin - 10,
      y + 20,
      { align: 'right' }
    );

    y += 44;

    if (config.entries.length === 0) {
      doc.setDrawColor(212, 212, 216);
      doc.rect(margin, y, contentWidth, 48, 'S');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(113, 113, 122);
      doc.text(`No student visits recorded for ${config.date}.`, pageWidth / 2, y + 28, {
        align: 'center',
      });
      y += 56;
    } else {
      const body: RowInput[] = config.entries.map((entry) => {
        const reasonText = entry.visit.observations
          ? `${pdfSafeText(entry.visit.reason)}\nObs: ${pdfSafeText(entry.visit.observations)}`
          : pdfSafeText(entry.visit.reason);
        const actionText = entry.visit.notes
          ? `${pdfSafeText(entry.visit.action_taken)}\nNote: ${pdfSafeText(entry.visit.notes)}`
          : pdfSafeText(entry.visit.action_taken);
        return [
          String(entry.visitNumber),
          pdfSafeText(entry.visitTimeFormatted),
          pdfSafeText(entry.student.full_name),
          pdfSafeText(`${entry.student.section} | #${entry.student.roll_number}`),
          reasonText,
          actionText,
          pdfSafeText(entry.medicineSummary),
        ];
      });

      autoTable(doc, {
        startY: y,
        margin: { top: 44, left: margin, right: margin, bottom: 48 },
        head: [['#', 'Time', 'Student Name', 'Section / Roll', 'Reason & Observations', 'Action Taken', 'Medicine Given']],
        body,
        theme: 'grid',
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
        styles: {
          font: 'helvetica',
          fontSize: 8.3,
          cellPadding: 4.5,
          textColor: [24, 24, 27],
          lineColor: [212, 212, 216],
          lineWidth: 0.5,
          valign: 'top',
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [244, 244, 245],
          textColor: [39, 39, 42],
          fontStyle: 'bold',
          fontSize: 8.3,
        },
        alternateRowStyles: {
          fillColor: [252, 252, 253],
        },
        columnStyles: {
          0: { cellWidth: 24, halign: 'center' },
          1: { cellWidth: 50 },
          2: { cellWidth: 92, fontStyle: 'bold' },
          3: { cellWidth: 66 },
          4: { cellWidth: 112 },
          5: { cellWidth: 90 },
          6: { cellWidth: 'auto' },
        },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            drawPortraitRunningHeader(
              doc,
              `Daily Student Infirmary Log (${config.date}) - Cont.`,
              todayIso
            );
          }
        },
      });
      y = doc.lastAutoTable?.finalY ?? y + 60;
    }

    drawPortraitSignatures(doc, y, staffName);
    stampPortraitFooters(doc);
    return { doc, filename };
  }

  if (config.type === 'student-history') {
    const titleText =
      config.startDate || config.endDate
        ? `STUDENT HEALTH HISTORY (${config.startDate || 'Start'} TO ${config.endDate || 'Present'})`
        : 'COMPLETE STUDENT HEALTH & INFIRMARY HISTORY';

    const profileText =
      config.healthProfiles.length > 0
        ? `Medical Profile / Care Notes: ${config.healthProfiles
            .map((h) => `${h.condition_or_note} (${h.status})`)
            .join('; ')}`
        : '';

    const boxHeight = profileText ? 84 : 64;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.7);
    doc.rect(margin, y, contentWidth, boxHeight, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(24, 24, 27);
    doc.text(pdfSafeText(titleText), margin + 10, y + 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(82, 82, 91);
    doc.text(`Total Visits: ${config.visits.length}`, pageWidth - margin - 10, y + 15, {
      align: 'right',
    });

    doc.setDrawColor(228, 228, 231);
    doc.line(margin + 10, y + 21, pageWidth - margin - 10, y + 21);

    const colW = (contentWidth - 20) / 3;
    const labelY = y + 33;
    const valY = y + 45;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(113, 113, 122);
    doc.text('Student Name', margin + 10, labelY);
    doc.text('Class & Roll Number', margin + 10 + colW, labelY);
    doc.text('Latest Height / Weight', margin + 10 + colW * 2, labelY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(24, 24, 27);
    doc.text(pdfSafeText(config.student.full_name), margin + 10, valY, { maxWidth: colW - 8 });
    doc.setFont('helvetica', 'normal');
    const grSuffix = config.student.gr_number ? ` (GR ${config.student.gr_number})` : '';
    doc.text(
      pdfSafeText(`${config.student.section} | Roll #${config.student.roll_number}${grSuffix}`),
      margin + 10 + colW,
      valY,
      { maxWidth: colW - 8 }
    );
    doc.text(
      config.latestMeasurement
        ? `${config.latestMeasurement.height_cm} cm / ${config.latestMeasurement.weight_kg} kg`
        : 'Not recorded',
      margin + 10 + colW * 2,
      valY
    );

    if (profileText) {
      doc.setDrawColor(228, 228, 231);
      doc.line(margin + 10, y + 54, pageWidth - margin - 10, y + 54);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(39, 39, 42);
      doc.text(pdfSafeText(profileText), margin + 10, y + 66, {
        maxWidth: contentWidth - 20,
      });
    }

    y += boxHeight + 12;

    if (config.visits.length === 0) {
      doc.setDrawColor(212, 212, 216);
      doc.rect(margin, y, contentWidth, 48, 'S');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(113, 113, 122);
      doc.text(
        'No visits recorded for this student in the selected period.',
        pageWidth / 2,
        y + 28,
        { align: 'center' }
      );
      y += 56;
    } else {
      const body: RowInput[] = config.visits.map((v) => [
        `${extractDatePart(v.visit_datetime)}\n${formatTimeFromDatetime(v.visit_datetime)}`,
        v.observations
          ? `${pdfSafeText(v.reason)}\nObs: ${pdfSafeText(v.observations)}`
          : pdfSafeText(v.reason),
        v.notes
          ? `${pdfSafeText(v.action_taken)}\nNote: ${pdfSafeText(v.notes)}`
          : pdfSafeText(v.action_taken),
        pdfSafeText(formatMedicineDisplay(v)),
      ]);

      autoTable(doc, {
        startY: y,
        margin: { top: 44, left: margin, right: margin, bottom: 48 },
        head: [['Date & Time', 'Reason & Observations', 'Action Taken / Resolution', 'Medicine Given']],
        body,
        theme: 'grid',
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
        styles: {
          font: 'helvetica',
          fontSize: 8.5,
          cellPadding: 5,
          textColor: [24, 24, 27],
          lineColor: [212, 212, 216],
          lineWidth: 0.5,
          valign: 'top',
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [244, 244, 245],
          textColor: [39, 39, 42],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 74 },
          1: { cellWidth: 165 },
          2: { cellWidth: 155 },
          3: { cellWidth: 'auto' },
        },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            drawPortraitRunningHeader(
              doc,
              `${config.student.full_name} (${config.student.section} | #${config.student.roll_number}) - Health History Cont.`,
              todayIso
            );
          }
        },
      });
      y = doc.lastAutoTable?.finalY ?? y + 60;
    }

    drawPortraitSignatures(doc, y, staffName);
    stampPortraitFooters(doc);
    return { doc, filename };
  }

  // REPORT TYPE 3: SINGLE VISIT SLIP
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.7);
  doc.rect(margin, y, contentWidth, 38, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(24, 24, 27);
  doc.text('INDIVIDUAL STUDENT INFIRMARY VISIT SLIP', margin + 10, y + 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  doc.text(`Visit ID: ${pdfSafeText(config.visit.visit_id)}`, margin + 10, y + 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(24, 24, 27);
  doc.text(
    `Date: ${extractDatePart(config.visit.visit_datetime)}  |  Time: ${formatTimeFromDatetime(config.visit.visit_datetime)}`,
    pageWidth - margin - 10,
    y + 22,
    { align: 'right' }
  );

  y += 48;

  const slipRows: RowInput[] = [
    ['Student Full Name', pdfSafeText(config.student.full_name)],
    [
      'Class & Roll Number',
      pdfSafeText(
        `${config.student.section} | Roll #${config.student.roll_number}${
          config.student.gr_number ? ` | GR ${config.student.gr_number}` : ''
        }`
      ),
    ],
    ['Reason for Visit / Health Concern', pdfSafeText(config.visit.reason)],
    ['Clinical Observations', pdfSafeText(config.visit.observations || 'None recorded')],
    ['Care Provided / Action Taken', pdfSafeText(config.visit.action_taken)],
    ['Medication Administered', pdfSafeText(formatMedicineDisplay(config.visit))],
  ];

  if (config.visit.notes) {
    slipRows.push(['Additional Clinical Notes', pdfSafeText(config.visit.notes)]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 48 },
    body: slipRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      cellPadding: 8,
      textColor: [24, 24, 27],
      lineColor: [212, 212, 216],
      lineWidth: 0.6,
      valign: 'top',
    },
    columnStyles: {
      0: { cellWidth: 165, fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [82, 82, 91] },
      1: { cellWidth: 'auto', fontStyle: 'normal' },
    },
  });

  y = doc.lastAutoTable?.finalY ?? y + 180;
  drawPortraitSignatures(doc, y, staffName);
  stampPortraitFooters(doc);
  return { doc, filename };
}

export function downloadPrintReportPdf(
  config: PrintReportConfig,
  staffName?: string
): string {
  const { doc, filename } = buildPrintReportPdfDoc(config, staffName);
  if (typeof window !== 'undefined') {
    doc.save(filename);
  }
  return filename;
}

function drawLandscapeSheetHeader(
  doc: jsPDF,
  title: string,
  recordCount: number,
  generatedStr: string,
  confidentialNote?: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 28;
  const contentWidth = pageWidth - margin * 2;

  // Deep teal banner matching the Excel workbooks
  doc.setFillColor(15, 76, 92);
  doc.rect(margin, 24, contentWidth, 26, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `SARASWATI VIDYA ACADEMY - SCHOOL INFIRMARY  |  ${pdfSafeText(title).toUpperCase()}`,
    margin + 10,
    41
  );

  doc.setFillColor(245, 244, 240);
  doc.rect(margin, 50, contentWidth, 18, 'F');

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.2);
  doc.setTextColor(71, 85, 105);
  const note =
    confidentialNote ||
    'Confidential School Medical Register';
  doc.text(
    pdfSafeText(`Generated: ${generatedStr}   |   Total Records: ${recordCount}   |   ${note}`),
    margin + 10,
    62
  );

  return 76;
}

function renderSectionTable(
  doc: JsPdfWithAutoTable,
  options: {
    title: string;
    recordCount: number;
    generatedStr: string;
    head: string[];
    body: RowInput[];
    columnStyles?: Record<number, { cellWidth?: number | 'auto' | 'wrap'; halign?: 'left' | 'center' | 'right' }>;
    emptyMessage: string;
    confidentialNote?: string;
    startOnNewPage?: boolean;
  }
): void {
  if (options.startOnNewPage) {
    doc.addPage();
  }
  const margin = 28;
  const startY = drawLandscapeSheetHeader(
    doc,
    options.title,
    options.recordCount,
    options.generatedStr,
    options.confidentialNote
  );

  const safeBody: RowInput[] =
    options.body.length > 0
      ? options.body
      : [
          [
            {
              content: options.emptyMessage,
              colSpan: options.head.length,
              styles: { halign: 'center', textColor: [113, 113, 122], fontStyle: 'italic' },
            },
          ],
        ];

  autoTable(doc, {
    startY,
    margin: { top: 44, left: margin, right: margin, bottom: 36 },
    head: [options.head],
    body: safeBody,
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7.6,
      cellPadding: 3.5,
      textColor: [24, 24, 27],
      lineColor: [228, 228, 231],
      lineWidth: 0.45,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [19, 78, 74],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 249],
    },
    columnStyles: options.columnStyles,
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 76, 92);
        doc.text(
          `${pdfSafeText(SCHOOL_NAME)} | ${pdfSafeText(options.title)} (Cont.)`,
          margin,
          26
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(113, 113, 122);
        doc.text(pdfSafeText(options.generatedStr), pageWidth - margin, 26, { align: 'right' });
        doc.setDrawColor(212, 212, 216);
        doc.line(margin, 32, pageWidth - margin, 32);
      }
    },
  });
}

function stampLandscapeFooters(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 26, pageWidth - margin, pageHeight - 26);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(113, 113, 122);
    doc.text(
      `${pdfSafeText(SCHOOL_NAME)} | Confidential School Medical Register`,
      margin,
      pageHeight - 15
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 15, {
      align: 'right',
    });
  }
}

export function buildSheetPdfDoc(
  tab: DownloadableSheetTab,
  db: NurseDatabase,
  options?: { todayIso?: string }
): { doc: jsPDF; filename: string } {
  const todayIso = options?.todayIso || new Date().toISOString().slice(0, 10);
  const filename = getSheetPdfFilename(tab, todayIso);
  const generatedStr = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
    compress: true,
  }) as JsPdfWithAutoTable;

  const students = db.students || [];
  const studentMap = new Map<string, StudentRecord>(students.map((s) => [s.student_id, s]));
  let hasDrawnAnySection = false;

  const nextNewPage = (): boolean => {
    const startNew = hasDrawnAnySection;
    hasDrawnAnySection = true;
    return startNew;
  };

  if (tab === 'Students' || tab === 'All') {
    const sorted = [...students].sort((a, b) => {
      const secCmp = a.section.localeCompare(b.section);
      if (secCmp !== 0) return secCmp;
      return a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
    });
    renderSectionTable(doc, {
      title: 'Student Roster',
      recordCount: sorted.length,
      generatedStr,
      head: ['Sr', 'GR Number', 'Student Full Name', 'Class Section', 'Roll No', 'Status', 'Last Updated'],
      body: sorted.map((s, idx) => [
        String(idx + 1),
        pdfSafeOrDash(s.gr_number),
        pdfSafeText(s.full_name),
        pdfSafeText(s.section),
        pdfSafeText(s.roll_number),
        pdfSafeText(s.active_status || 'Active'),
        extractDatePart(s.updated_at || s.created_at),
      ]),
      columnStyles: {
        0: { cellWidth: 28, halign: 'center' },
        1: { cellWidth: 90, halign: 'center' },
        3: { cellWidth: 90, halign: 'center' },
        4: { cellWidth: 60, halign: 'center' },
        5: { cellWidth: 70, halign: 'center' },
        6: { cellWidth: 85, halign: 'center' },
      },
      emptyMessage: 'No student records available.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'Visits' || tab === 'All') {
    const sorted = [...(db.visits || [])].sort((a, b) => {
      const cmp = (b.visit_datetime || '').localeCompare(a.visit_datetime || '');
      if (cmp !== 0) return cmp;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    renderSectionTable(doc, {
      title: 'Infirmary Visit Log',
      recordCount: sorted.length,
      generatedStr,
      head: [
        'Sr',
        'Date',
        'Time',
        'Shift',
        'Student Name',
        'Class / Roll',
        'Reason & Observations',
        'Care / Action Taken',
        'Medicine & Item Used',
        'Recorded By',
      ],
      body: sorted.map((v, idx) => {
        const stu = studentMap.get(v.student_id);
        const sec = v.class || v.section || stu?.section || '-';
        const roll = v.roll_no || v.roll_number || stu?.roll_number || '-';
        const shiftLabel = formatShiftPeriodLabel(resolveVisitShiftPeriod(v, db.settings), true);
        const itemUsed = v.item_name
          ? `\nItem: ${v.item_name}${v.item_qty ? ` (x${v.item_qty})` : ''}`
          : '';
        return [
          String(idx + 1),
          extractDatePart(v.visit_datetime),
          formatTimeFromDatetime(v.visit_datetime),
          pdfSafeText(shiftLabel),
          pdfSafeText(v.student_name || stu?.full_name || 'Unknown'),
          pdfSafeText(`${sec} | #${roll}`),
          pdfSafeText(v.observations ? `${v.reason}\nObs: ${v.observations}` : v.reason),
          pdfSafeText(v.notes ? `${v.action_taken}\nNote: ${v.notes}` : v.action_taken),
          pdfSafeText(`${formatMedicineDisplay(v)}${itemUsed}`),
          pdfSafeOrDash(v.recorded_by || 'Staff on Duty'),
        ];
      }),
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        1: { cellWidth: 56, halign: 'center' },
        2: { cellWidth: 46, halign: 'center' },
        3: { cellWidth: 58, halign: 'center' },
        4: { cellWidth: 96 },
        5: { cellWidth: 66 },
        9: { cellWidth: 66 },
      },
      emptyMessage: 'No infirmary visits recorded.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'Measurements' || tab === 'All') {
    const sorted = [...(db.measurements || [])].sort((a, b) =>
      (b.measurement_date || '').localeCompare(a.measurement_date || '')
    );
    renderSectionTable(doc, {
      title: 'Growth & Anthropometric Measurements',
      recordCount: sorted.length,
      generatedStr,
      head: ['Sr', 'Date', 'Student Name', 'Class', 'Roll No', 'Height (cm)', 'Weight (kg)', 'BMI', 'Notes'],
      body: sorted.map((m, idx) => {
        const stu = studentMap.get(m.student_id);
        const bmi = calculateBmi(m.height_cm, m.weight_kg);
        return [
          String(idx + 1),
          extractDatePart(m.measurement_date),
          pdfSafeText(stu?.full_name || m.student_id),
          pdfSafeOrDash(stu?.section),
          pdfSafeOrDash(stu?.roll_number),
          String(Number(m.height_cm) || 0),
          String(Number(m.weight_kg) || 0),
          bmi !== undefined ? String(bmi) : '-',
          pdfSafeOrDash(m.notes),
        ];
      }),
      columnStyles: {
        0: { cellWidth: 28, halign: 'center' },
        1: { cellWidth: 68, halign: 'center' },
        3: { cellWidth: 70, halign: 'center' },
        4: { cellWidth: 50, halign: 'center' },
        5: { cellWidth: 64, halign: 'right' },
        6: { cellWidth: 64, halign: 'right' },
        7: { cellWidth: 48, halign: 'right' },
      },
      emptyMessage: 'No anthropometric measurements recorded.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'Health Profiles' || tab === 'All') {
    const sorted = [...(db.healthProfiles || [])].sort((a, b) => {
      if (a.status === 'Active' && b.status !== 'Active') return -1;
      if (a.status !== 'Active' && b.status === 'Active') return 1;
      return (b.date_recorded || '').localeCompare(a.date_recorded || '');
    });
    renderSectionTable(doc, {
      title: 'Student Allergies & Health Profiles',
      recordCount: sorted.length,
      generatedStr,
      head: ['Sr', 'Student Name', 'Class', 'Roll No', 'Condition / Allergy / Medical Note', 'Status', 'Date Recorded', 'Last Reviewed'],
      body: sorted.map((h, idx) => {
        const stu = studentMap.get(h.student_id);
        return [
          String(idx + 1),
          pdfSafeText(stu?.full_name || h.student_id),
          pdfSafeOrDash(stu?.section),
          pdfSafeOrDash(stu?.roll_number),
          pdfSafeText(h.condition_or_note),
          pdfSafeText(h.status || 'Active'),
          extractDatePart(h.date_recorded),
          extractDatePart(h.last_reviewed || h.date_recorded),
        ];
      }),
      columnStyles: {
        0: { cellWidth: 28, halign: 'center' },
        2: { cellWidth: 70, halign: 'center' },
        3: { cellWidth: 52, halign: 'center' },
        5: { cellWidth: 68, halign: 'center' },
        6: { cellWidth: 72, halign: 'center' },
        7: { cellWidth: 72, halign: 'center' },
      },
      emptyMessage: 'No student health profile records available.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'Medicines' || tab === 'All') {
    const sorted = [...(db.medicines || [])].sort((a, b) => a.name.localeCompare(b.name));
    renderSectionTable(doc, {
      title: 'Medicines Inventory',
      recordCount: sorted.length,
      generatedStr,
      head: [
        'Sr',
        'Medicine ID',
        'Medicine Name',
        'Category',
        'Form & Strength',
        'Batch No.',
        'Expiry Date',
        'Stock',
        'Unit',
        'Min Alert',
        'Status',
      ],
      body: sorted.map((m, idx) => {
        const st = getStockStatus(m.current_stock, m.min_stock_alert);
        const statusLabel = st === 'out' ? 'Out of Stock' : st === 'low' ? 'Low Stock' : 'In Stock';
        return [
          String(idx + 1),
          pdfSafeText(m.medicine_id),
          pdfSafeText(m.name),
          pdfSafeOrDash(m.category || 'General'),
          pdfSafeOrDash(m.form_strength),
          pdfSafeOrDash(m.batch_number),
          m.expiry_date ? extractDatePart(m.expiry_date) : '-',
          String(Number(m.current_stock) || 0),
          pdfSafeOrDash(m.unit || 'tablets'),
          String(Number(m.min_stock_alert) || 0),
          statusLabel,
        ];
      }),
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        1: { cellWidth: 74, halign: 'center' },
        6: { cellWidth: 64, halign: 'center' },
        7: { cellWidth: 44, halign: 'right' },
        8: { cellWidth: 50, halign: 'center' },
        9: { cellWidth: 46, halign: 'right' },
        10: { cellWidth: 66, halign: 'center' },
      },
      emptyMessage: 'No medicines in stock.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'Items' || tab === 'All') {
    const sorted = [...(db.items || [])].sort((a, b) => a.name.localeCompare(b.name));
    renderSectionTable(doc, {
      title: 'Infirmary Supplies & Items Inventory',
      recordCount: sorted.length,
      generatedStr,
      head: ['Sr', 'Item ID', 'Item Name', 'Category', 'Current Stock', 'Unit', 'Min Alert', 'Status', 'Notes'],
      body: sorted.map((it, idx) => {
        const st = getStockStatus(it.current_stock, it.min_stock_alert);
        const statusLabel = st === 'out' ? 'Out of Stock' : st === 'low' ? 'Low Stock' : 'In Stock';
        return [
          String(idx + 1),
          pdfSafeText(it.item_id),
          pdfSafeText(it.name),
          pdfSafeOrDash(it.category || 'First Aid'),
          String(Number(it.current_stock) || 0),
          pdfSafeOrDash(it.unit || 'pcs'),
          String(Number(it.min_stock_alert) || 0),
          statusLabel,
          pdfSafeOrDash(it.notes),
        ];
      }),
      columnStyles: {
        0: { cellWidth: 26, halign: 'center' },
        1: { cellWidth: 78, halign: 'center' },
        4: { cellWidth: 64, halign: 'right' },
        5: { cellWidth: 54, halign: 'center' },
        6: { cellWidth: 54, halign: 'right' },
        7: { cellWidth: 70, halign: 'center' },
      },
      emptyMessage: 'No infirmary items tracked yet.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'Bills' || tab === 'All') {
    const sorted = [...(db.bills || [])].sort((a, b) =>
      (b.bill_date || '').localeCompare(a.bill_date || '')
    );
    renderSectionTable(doc, {
      title: 'Infirmary Bills & Pharmacy Receipts',
      recordCount: sorted.length,
      generatedStr,
      head: ['Sr', 'Bill ID', 'Bill Date', 'Invoice / Bill No.', 'Vendor / Pharmacy', 'Category', 'Amount', 'Receipt Photo', 'Notes'],
      body: sorted.map((b, idx) => [
        String(idx + 1),
        pdfSafeText(b.bill_id),
        extractDatePart(b.bill_date),
        pdfSafeOrDash(b.bill_number),
        pdfSafeText(b.vendor_name),
        pdfSafeText(b.category),
        formatInrPdf(b.total_amount),
        b.image_url ? 'Drive Link Attached' : b.image_data_url ? 'Attached in App' : '-',
        pdfSafeOrDash(b.notes),
      ]),
      columnStyles: {
        0: { cellWidth: 26, halign: 'center' },
        1: { cellWidth: 76, halign: 'center' },
        2: { cellWidth: 66, halign: 'center' },
        3: { cellWidth: 82 },
        5: { cellWidth: 66, halign: 'center' },
        6: { cellWidth: 76, halign: 'right' },
        7: { cellWidth: 86, halign: 'center' },
      },
      emptyMessage: 'No bills recorded yet.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'Stock Ledger' || tab === 'All') {
    const sorted = [...(db.stockTransactions || [])].sort((a, b) =>
      (b.created_at || '').localeCompare(a.created_at || '')
    );
    renderSectionTable(doc, {
      title: 'Inventory Stock Movement & Audit Ledger',
      recordCount: sorted.length,
      generatedStr,
      head: ['Sr', 'Date & Time', 'Type', 'Medicine / Item', 'Change', 'Balance After', 'Reason', 'Reference ID', 'Recorded By', 'Notes'],
      body: sorted.map((t, idx) => {
        const qty = Number(t.change_qty) || 0;
        const reasonLabel =
          t.reason === 'visit'
            ? 'Student Visit'
            : t.reason === 'bill_restock'
              ? 'Bill Restock'
              : t.reason === 'menstrual'
                ? 'Hygiene Support'
                : 'Manual Adjustment';
        return [
          String(idx + 1),
          pdfSafeText((t.created_at || '').slice(0, 16).replace('T', ' ')),
          t.target_type === 'medicine' ? 'Medicine' : 'Item',
          pdfSafeText(t.target_name || t.target_id),
          qty > 0 ? `+${qty}` : `${qty}`,
          t.balance_after !== undefined ? String(Number(t.balance_after)) : '-',
          reasonLabel,
          pdfSafeOrDash(t.reference_id),
          pdfSafeOrDash(t.recorded_by || 'Staff on Duty'),
          pdfSafeOrDash(t.notes),
        ];
      }),
      columnStyles: {
        0: { cellWidth: 26, halign: 'center' },
        1: { cellWidth: 82, halign: 'center' },
        2: { cellWidth: 54, halign: 'center' },
        4: { cellWidth: 46, halign: 'right' },
        5: { cellWidth: 56, halign: 'right' },
        6: { cellWidth: 78, halign: 'center' },
        7: { cellWidth: 76, halign: 'center' },
      },
      emptyMessage: 'No stock movements recorded yet.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'Doctor Visits' || tab === 'All') {
    const sessions = db.doctorVisits || [];
    const cases = db.doctorVisitCases || [];
    const sessionById = new Map(sessions.map((s) => [s.doctor_visit_id, s]));
    const sortedCases = [...cases].sort((a, b) => {
      const dA = sessionById.get(a.doctor_visit_id)?.visit_date || a.created_at || '';
      const dB = sessionById.get(b.doctor_visit_id)?.visit_date || b.created_at || '';
      return dB.localeCompare(dA);
    });
    const sessionsWithCases = new Set(sortedCases.map((c) => c.doctor_visit_id));
    const emptySessions = [...sessions]
      .filter((s) => !sessionsWithCases.has(s.doctor_visit_id))
      .sort((a, b) => (b.visit_date || '').localeCompare(a.visit_date || ''));

    const rows: RowInput[] = [];
    let sr = 1;
    sortedCases.forEach((c) => {
      const sess = sessionById.get(c.doctor_visit_id);
      const stu = studentMap.get(c.student_id);
      rows.push([
        String(sr++),
        extractDatePart(sess?.visit_date || c.created_at),
        pdfSafeText(
          sess?.specialization ? `${sess.doctor_name} (${sess.specialization})` : sess?.doctor_name || '-'
        ),
        pdfSafeText(c.student_name || stu?.full_name || c.student_id),
        pdfSafeText(`${c.section || stu?.section || '-'} | #${c.roll_number || stu?.roll_number || '-'}`),
        pdfSafeText(c.complaint),
        pdfSafeOrDash(c.findings),
        pdfSafeOrDash(c.prescription_or_advice),
        c.follow_up_needed ? 'Yes' : 'No',
        pdfSafeOrDash(c.notes || sess?.campus_notes),
      ]);
    });
    emptySessions.forEach((sess) => {
      rows.push([
        String(sr++),
        extractDatePart(sess.visit_date),
        pdfSafeText(
          sess.specialization ? `${sess.doctor_name} (${sess.specialization})` : sess.doctor_name
        ),
        '- No cases logged yet -',
        '-',
        '-',
        '-',
        '-',
        'No',
        pdfSafeOrDash(sess.campus_notes),
      ]);
    });

    renderSectionTable(doc, {
      title: 'Weekly Visiting Doctor Consultations',
      recordCount: rows.length,
      generatedStr,
      head: [
        'Sr',
        'Visit Date',
        'Visiting Doctor',
        'Student Name',
        'Class / Roll',
        'Complaint / Reason',
        'Clinical Findings',
        'Prescription / Advice',
        'Follow-up',
        'Notes',
      ],
      body: rows,
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        1: { cellWidth: 58, halign: 'center' },
        4: { cellWidth: 64 },
        8: { cellWidth: 46, halign: 'center' },
      },
      emptyMessage: 'No weekly doctor visits logged yet.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'External OPD' || tab === 'All') {
    const sorted = [...(db.opdRecords || [])].sort((a, b) =>
      (b.referral_datetime || '').localeCompare(a.referral_datetime || '')
    );
    renderSectionTable(doc, {
      title: 'External OPD & Hospital Referral Register',
      recordCount: sorted.length,
      generatedStr,
      head: [
        'Sr',
        'Date & Time',
        'Student Name',
        'Class / Roll',
        'Hospital / Clinic & Doctor',
        'Reason for Referral',
        'Escort / Parent',
        'Diagnosis & Advice',
        'Follow-up',
        'Status',
      ],
      body: sorted.map((o, idx) => {
        const stu = studentMap.get(o.student_id);
        return [
          String(idx + 1),
          `${extractDatePart(o.referral_datetime)}\n${formatTimeFromDatetime(o.referral_datetime)}`,
          pdfSafeText(o.student_name || stu?.full_name || o.student_id),
          pdfSafeText(`${o.section || stu?.section || '-'} | #${o.roll_number || stu?.roll_number || '-'}`),
          pdfSafeText(o.doctor_name ? `${o.hospital_or_clinic}\n${o.doctor_name}` : o.hospital_or_clinic),
          pdfSafeText(o.reason),
          pdfSafeOrDash(o.escort_or_parent),
          pdfSafeOrDash(o.diagnosis_and_advice),
          o.follow_up_date ? extractDatePart(o.follow_up_date) : '-',
          pdfSafeText(o.status || 'Referred'),
        ];
      }),
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        1: { cellWidth: 62, halign: 'center' },
        3: { cellWidth: 64 },
        8: { cellWidth: 56, halign: 'center' },
        9: { cellWidth: 52, halign: 'center' },
      },
      emptyMessage: 'No external OPD referrals logged yet.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'Medical Camps' || tab === 'All') {
    const camps = db.medicalCamps || [];
    const screenings = db.campScreenings || [];
    const campById = new Map(camps.map((c) => [c.camp_id, c]));
    const sortedScreenings = [...screenings].sort((a, b) => {
      const dA = campById.get(a.camp_id)?.camp_date || a.created_at || '';
      const dB = campById.get(b.camp_id)?.camp_date || b.created_at || '';
      return dB.localeCompare(dA);
    });
    const campsWithScreenings = new Set(sortedScreenings.map((s) => s.camp_id));
    const emptyCamps = [...camps]
      .filter((c) => !campsWithScreenings.has(c.camp_id))
      .sort((a, b) => (b.camp_date || '').localeCompare(a.camp_date || ''));

    const rows: RowInput[] = [];
    let sr = 1;
    sortedScreenings.forEach((sc) => {
      const camp = campById.get(sc.camp_id);
      const stu = studentMap.get(sc.student_id);
      const orgLabel = [camp?.organizer, camp?.doctor_team].filter(Boolean).join(' | ');
      rows.push([
        String(sr++),
        extractDatePart(camp?.camp_date || sc.created_at),
        pdfSafeText(camp?.camp_title || sc.camp_id),
        pdfSafeText(camp?.camp_type || 'General Health'),
        pdfSafeOrDash(orgLabel),
        pdfSafeText(sc.student_name || stu?.full_name || sc.student_id),
        pdfSafeText(`${sc.section || stu?.section || '-'} | #${sc.roll_number || stu?.roll_number || '-'}`),
        pdfSafeText(sc.findings),
        sc.referral_needed ? 'Yes' : 'No',
        pdfSafeOrDash(sc.notes),
      ]);
    });
    emptyCamps.forEach((camp) => {
      const orgLabel = [camp.organizer, camp.doctor_team].filter(Boolean).join(' | ');
      rows.push([
        String(sr++),
        extractDatePart(camp.camp_date),
        pdfSafeText(camp.camp_title),
        pdfSafeText(camp.camp_type || 'General Health'),
        pdfSafeOrDash(orgLabel),
        '- No screenings logged yet -',
        pdfSafeOrDash(camp.target_classes),
        pdfSafeOrDash(camp.summary),
        'No',
        '-',
      ]);
    });

    renderSectionTable(doc, {
      title: 'School Medical Camps & Student Screenings',
      recordCount: rows.length,
      generatedStr,
      head: [
        'Sr',
        'Camp Date',
        'Camp Title',
        'Camp Type',
        'Organizer / Team',
        'Student Name',
        'Class / Roll',
        'Screening Findings',
        'Referral',
        'Notes',
      ],
      body: rows,
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        1: { cellWidth: 56, halign: 'center' },
        3: { cellWidth: 66, halign: 'center' },
        6: { cellWidth: 64 },
        8: { cellWidth: 44, halign: 'center' },
      },
      emptyMessage: 'No medical camps recorded yet.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'Annual Checkups' || tab === 'All') {
    const sorted = [...(db.annualCheckups || [])].sort((a, b) => {
      const yrCmp = (b.academic_year || '').localeCompare(a.academic_year || '');
      if (yrCmp !== 0) return yrCmp;
      return (b.checkup_date || '').localeCompare(a.checkup_date || '');
    });
    renderSectionTable(doc, {
      title: 'Annual Student Physical Health Checkups',
      recordCount: sorted.length,
      generatedStr,
      head: [
        'Sr',
        'Year',
        'Date',
        'Student Name',
        'Class / Roll',
        'Ht/Wt (BMI)',
        'Vision L/R',
        'Dental',
        'ENT',
        'Blood / Hb',
        'Fitness',
        'Referral',
        'Remarks',
      ],
      body: sorted.map((c, idx) => {
        const stu = studentMap.get(c.student_id);
        const bmi = c.bmi ?? calculateBmi(c.height_cm, c.weight_kg);
        const hwBmi =
          c.height_cm || c.weight_kg
            ? `${c.height_cm ?? '-'}cm / ${c.weight_kg ?? '-'}kg${bmi !== undefined ? ` (${bmi})` : ''}`
            : '-';
        const vision =
          c.vision_left || c.vision_right ? `${c.vision_left || '-'} / ${c.vision_right || '-'}` : '-';
        const bloodHb = [c.blood_group, c.hemoglobin ? `Hb ${c.hemoglobin}` : '']
          .filter(Boolean)
          .join(' | ');
        return [
          String(idx + 1),
          pdfSafeText(c.academic_year),
          extractDatePart(c.checkup_date),
          pdfSafeText(c.student_name || stu?.full_name || c.student_id),
          pdfSafeText(`${c.section || stu?.section || '-'} | #${c.roll_number || stu?.roll_number || '-'}`),
          hwBmi,
          vision,
          pdfSafeOrDash(c.dental_status),
          pdfSafeOrDash(c.ent_notes),
          pdfSafeOrDash(bloodHb),
          pdfSafeText(c.general_fitness || 'Fit'),
          c.parent_referral ? 'Yes' : 'No',
          pdfSafeOrDash(c.doctor_remarks),
        ];
      }),
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 42, halign: 'center' },
        2: { cellWidth: 52, halign: 'center' },
        4: { cellWidth: 62 },
        6: { cellWidth: 48, halign: 'center' },
        10: { cellWidth: 58, halign: 'center' },
        11: { cellWidth: 40, halign: 'center' },
      },
      emptyMessage: 'No annual health checkups recorded yet.',
      startOnNewPage: nextNewPage(),
    });
  }

  if (tab === 'Health Insights' || tab === 'All') {
    const refDate = todayIso;
    const commonIssues = computeCommonIssues({
      students,
      visits: db.visits || [],
      doctorVisits: db.doctorVisits || [],
      doctorVisitCases: db.doctorVisitCases || [],
      opdRecords: db.opdRecords || [],
      timeframe: '30d',
      includePrograms: true,
      referenceDate: refDate,
    });
    const frequentVisitors = computeFrequentVisitors({
      students,
      visits: db.visits || [],
      doctorVisits: db.doctorVisits || [],
      doctorVisitCases: db.doctorVisitCases || [],
      opdRecords: db.opdRecords || [],
      timeframe: '30d',
      includePrograms: true,
      minVisits: 2,
      referenceDate: refDate,
    });

    renderSectionTable(doc, {
      title: 'Health Insights - Common Issues & Outbreak Watch (Last 30 Days)',
      recordCount: commonIssues.length,
      generatedStr,
      head: ['Sr', 'Health Issue / Symptom Category', 'Total Cases', 'Unique Students', 'Last 7 Days', 'Class Spread', 'Top Affected Students'],
      body: commonIssues.map((issue, idx) => [
        String(idx + 1),
        pdfSafeText(issue.label),
        String(issue.totalCases),
        String(issue.uniqueStudentCount),
        String(issue.recent7dCount),
        pdfSafeOrDash(issue.classBreakdown.map((c) => `${c.section} (${c.count})`).join(' | ')),
        pdfSafeOrDash(
          issue.affectedStudents
            .slice(0, 5)
            .map((a) => `${a.student.full_name} (${a.student.section}, ${a.count}x)`)
            .join('; ')
        ),
      ]),
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        2: { cellWidth: 54, halign: 'right' },
        3: { cellWidth: 64, halign: 'right' },
        4: { cellWidth: 54, halign: 'right' },
      },
      emptyMessage: 'No common illness clusters in the last 30 days.',
      startOnNewPage: nextNewPage(),
    });

    renderSectionTable(doc, {
      title: 'Health Insights - Frequent Infirmary Visitors (2+ Visits, Last 30 Days)',
      recordCount: frequentVisitors.length,
      generatedStr,
      head: ['Sr', 'Student Name', 'Class / Roll', 'Total Visits', 'Breakdown', 'Last Visit', 'Recurring Reasons'],
      body: frequentVisitors.map((v, idx) => [
        String(idx + 1),
        pdfSafeText(v.student.full_name),
        pdfSafeText(`${v.student.section} | #${v.student.roll_number}`),
        String(v.totalVisits),
        pdfSafeText(
          [
            v.visitCount > 0 ? `${v.visitCount} infirmary` : '',
            v.doctorCaseCount > 0 ? `${v.doctorCaseCount} doctor` : '',
            v.opdCount > 0 ? `${v.opdCount} OPD` : '',
          ]
            .filter(Boolean)
            .join(', ')
        ),
        extractDatePart(v.lastVisitDate),
        pdfSafeOrDash(
          v.topReasons.map((r) => `${r.label.split(' / ')[0]} (${r.count})`).join(' | ')
        ),
      ]),
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        2: { cellWidth: 74 },
        3: { cellWidth: 54, halign: 'right' },
        5: { cellWidth: 66, halign: 'center' },
      },
      emptyMessage: 'No repeat visitors (2+ visits) in the last 30 days.',
      startOnNewPage: true,
    });
  }

  // Privacy Safeguard: Menstrual Log is strictly excluded from "All" exports and only generated on explicit opt-in
  if (tab === 'Menstrual Log') {
    const sorted = [...(db.menstrualLogs || [])].sort((a, b) =>
      (b.cycle_start_date || '').localeCompare(a.cycle_start_date || '')
    );
    renderSectionTable(doc, {
      title: 'Menstrual Health Register (Nurse & Admin Only)',
      recordCount: sorted.length,
      generatedStr,
      head: ['Sr', 'Cycle Start', 'Cycle End', 'Student Name', 'Class / Roll', 'Flow / Pain Notes', 'Pads Issued', 'Irregular', 'Private Clinical Notes', 'Recorded By'],
      body: sorted.map((m, idx) => {
        const stu = studentMap.get(m.student_id);
        return [
          String(idx + 1),
          extractDatePart(m.cycle_start_date),
          m.cycle_end_date ? extractDatePart(m.cycle_end_date) : '-',
          pdfSafeText(m.student_name || stu?.full_name || m.student_id),
          pdfSafeText(`${m.section || stu?.section || '-'} | #${m.roll_number || stu?.roll_number || '-'}`),
          pdfSafeOrDash(m.flow_or_pain_notes),
          String(Number(m.pads_issued) || 0),
          m.irregular_flag ? 'Yes' : 'No',
          pdfSafeOrDash(m.private_notes),
          pdfSafeOrDash(m.recorded_by || 'School Nurse'),
        ];
      }),
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        1: { cellWidth: 58, halign: 'center' },
        2: { cellWidth: 58, halign: 'center' },
        4: { cellWidth: 64 },
        6: { cellWidth: 48, halign: 'right' },
        7: { cellWidth: 46, halign: 'center' },
      },
      emptyMessage: 'No menstrual care entries logged.',
      confidentialNote: 'CONFIDENTIAL - Restricted to Nurse & Admin Only',
      startOnNewPage: nextNewPage(),
    });
  }

  stampLandscapeFooters(doc);
  return { doc, filename };
}

export function downloadSheetPdf(
  tab: DownloadableSheetTab,
  db: NurseDatabase
): { ok: boolean; filename: string; message: string } {
  try {
    const { doc, filename } = buildSheetPdfDoc(tab, db);
    if (typeof window !== 'undefined') {
      doc.save(filename);
    }
    return {
      ok: true,
      filename,
      message: `Downloaded PDF register: ${filename}`,
    };
  } catch (err) {
    return {
      ok: false,
      filename: '',
      message:
        err instanceof Error
          ? `Unable to generate PDF: ${err.message}`
          : 'Unable to generate PDF right now.',
    };
  }
}
