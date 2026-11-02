const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

async function generatePayslipPdf({
  payslipData,
  filePath,
}) {
  return new Promise((resolve, reject) => {
    try {
    
      // VALIDATION

      if (!payslipData) {
        return reject(
          new Error("payslipData is required")
        );
      }

      const {
        company = {},
        employee = {},
        payroll = {},
        earnings = [],
        deductions = [],
        grossEarnings = 0,
        totalDeductions = 0,
        netPay = 0,
      } = payslipData;

     
      // COMPANY INFORMATION

      //
      // If company.name is not coming from payslipData,
      // this exact company name will be used.
      //
  

      const companyName =
        company.name ||
        "NANDGATE IT SERVICE PVT LTD";

      const companyAddress =
        company.location ||
        "34, Maruthamalai Gounder Layout, Gopalakrishnapuram, Ganapathy, Coimbatore, Tamilnadu, India 641006";

      
      // FILE / DIRECTORY

      const directory =
        path.dirname(filePath);

      fs.mkdirSync(directory, {
        recursive: true,
      });

   
      // ASSETS

      const assetsPath = path.join(
        process.cwd(),
        "src",
        "assets"
      );

      const logoPath = path.join(
        assetsPath,
        "company-logo.png"
      );

      const regularFontPath = path.join(
        assetsPath,
        "NotoSans-Regular.ttf"
      );

      const boldFontPath = path.join(
        assetsPath,
        "NotoSans-Bold.ttf"
      );

      console.log(
        "================================================="
      );

      console.log(
        "Company:",
        companyName
      );

      console.log(
        "Company Address:",
        companyAddress
      );

      console.log(
        "Logo Path:",
        logoPath
      );

      console.log(
        "Regular Font:",
        regularFontPath
      );

      console.log(
        "Bold Font:",
        boldFontPath
      );

      console.log(
        "================================================="
      );

      
      // CHECK ASSETS

      if (!fs.existsSync(logoPath)) {
        console.warn(
          "WARNING: Company logo not found:",
          logoPath
        );
      }

      if (!fs.existsSync(regularFontPath)) {
        return reject(
          new Error(
            `NotoSans-Regular.ttf not found at: ${regularFontPath}`
          )
        );
      }

      if (!fs.existsSync(boldFontPath)) {
        return reject(
          new Error(
            `NotoSans-Bold.ttf not found at: ${boldFontPath}`
          )
        );
      }

      
      // PDF DOCUMENT

      const doc = new PDFDocument({
        size: "A4",
        margin: 42,

        info: {
          Title: "Payslip",
          Author: "Payroll System",
          Subject: "Employee Payslip",
        },
      });

     
      // REGISTER NOTO SANS FONTS

      doc.registerFont(
        "NotoSans",
        regularFontPath
      );

      doc.registerFont(
        "NotoSans-Bold",
        boldFontPath
      );

    
      // FILE STREAM

      const stream =
        fs.createWriteStream(filePath);

      stream.on("finish", resolve);
      stream.on("error", reject);

      doc.pipe(stream);

    
      // PAGE SETTINGS

      const pageWidth = 595.28;
      const pageHeight = 841.89;

      const margin = 42;

      const contentWidth =
        pageWidth - margin * 2;

      let y = 40;

    
      // COLORS

      const green = "#66C96A";
      const lightGreen = "#EEF9EF";
      const border = "#D8DDE2";
      const lightGray = "#F7F8FA";
      const textColor = "#222222";
      const muted = "#6B6F73";

     
      // HELPERS

      function money(value) {
        return Number(value || 0).toLocaleString(
          "en-IN",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        );
      }

      function formatDate(value) {
        if (!value) {
          return "-";
        }

        const date =
          value instanceof Date
            ? value
            : new Date(value);

        if (Number.isNaN(date.getTime())) {
          return "-";
        }

        const day = String(
          date.getDate()
        ).padStart(2, "0");

        const month = String(
          date.getMonth() + 1
        ).padStart(2, "0");

        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
      }

      function monthName(month) {
        const numericMonth =
          Number(month);

        if (
          !numericMonth ||
          numericMonth < 1 ||
          numericMonth > 12
        ) {
          return "-";
        }

        return new Date(
          2000,
          numericMonth - 1,
          1
        ).toLocaleString("en-IN", {
          month: "long",
        });
      }

     
      // LABEL / VALUE

      function drawLabelValue(
        label,
        value,
        x,
        y,
        labelWidth = 115
      ) {
        doc
          .font("NotoSans")
          .fontSize(9)
          .fillColor("#5D6064")
          .text(
            label,
            x,
            y,
            {
              width: labelWidth,
            }
          );

        doc
          .font("NotoSans")
          .fontSize(9)
          .fillColor(textColor)
          .text(
            ":",
            x + labelWidth,
            y
          );

        doc
          .font("NotoSans")
          .fontSize(9)
          .fillColor(textColor)
          .text(
            value !== undefined &&
              value !== null &&
              value !== ""
              ? String(value)
              : "-",
            x + labelWidth + 14,
            y
          );
      }

     
      // HEADER


      const logoX = margin;
      const logoY = y;

      
      // COMPANY LOGO

      if (fs.existsSync(logoPath)) {
        try {
          doc.image(
            logoPath,
            logoX,
            logoY + 5,
            {
              fit: [80, 42],
              align: "left",
              valign: "center",
            }
          );

          console.log(
            "Company logo loaded successfully."
          );
        } catch (logoError) {
          console.error(
            "Failed to load company logo:",
            logoError
          );
        }
      }

      
      // COMPANY NAME

      doc
        .font("NotoSans-Bold")
        .fontSize(16)
        .fillColor(textColor)
        .text(
          companyName,
          logoX + 85,
          logoY + 2,
          {
            width: 300,
          }
        );

     
      // COMPANY ADDRESS

      doc
        .font("NotoSans")
        .fontSize(8)
        .fillColor(muted)
        .text(
          companyAddress,
          logoX + 85,
          logoY + 24,
          {
            width: 300,
            lineGap: 1,
          }
        );


      // PAYSLIP MONTH
     

      const headerRightX =
        margin +
        contentWidth -
        175;

      doc
        .font("NotoSans")
        .fontSize(8)
        .fillColor(muted)
        .text(
          "Payslip For the Month",
          headerRightX,
          logoY + 2,
          {
            width: 175,
            align: "right",
          }
        );

      doc
        .font("NotoSans-Bold")
        .fontSize(13)
        .fillColor(textColor)
        .text(
          `${monthName(
            payroll.month
          )} ${payroll.year || ""}`,
          headerRightX,
          logoY + 20,
          {
            width: 175,
            align: "right",
          }
        );

     
      // HEADER DIVIDER

      y += 60;

      doc
        .moveTo(margin, y)
        .lineTo(
          margin + contentWidth,
          y
        )
        .strokeColor(border)
        .lineWidth(1)
        .stroke();

      y += 20;

    
      // EMPLOYEE SUMMARY

      doc
        .font("NotoSans-Bold")
        .fontSize(9)
        .fillColor("#55585C")
        .text(
          "EMPLOYEE SUMMARY",
          margin,
          y
        );

      y += 20;

      const leftX = margin + 4;

      drawLabelValue(
        "Employee Name",
        employee.name,
        leftX,
        y
      );

      y += 21;

      drawLabelValue(
        "Designation",
        employee.designation,
        leftX,
        y
      );

      y += 21;

      drawLabelValue(
        "Employee ID",
        employee.employeeId,
        leftX,
        y
      );

      y += 21;

      drawLabelValue(
        "Date of Joining",
        formatDate(
          employee.dateOfJoining
        ),
        leftX,
        y
      );

      y += 21;

      drawLabelValue(
        "Pay Period",
        `${monthName(
          payroll.month
        )} ${payroll.year || ""}`,
        leftX,
        y
      );

      y += 21;

      drawLabelValue(
        "Pay Date",
        formatDate(
          payroll.payDate
        ),
        leftX,
        y
      );

    
      // NET PAY CARD

      const cardWidth = 180;

      // Increased from 145 to 158 so that
      // Calendar / Paid / LOP rows fit correctly.
      const cardHeight = 158;

      const cardX =
        margin +
        contentWidth -
        cardWidth;

      const cardY =
        y - 126;

     
      // CARD BACKGROUND

      doc
        .roundedRect(
          cardX,
          cardY,
          cardWidth,
          cardHeight,
          10
        )
        .fillColor("#FFFFFF")
        .fill();

      doc
        .roundedRect(
          cardX,
          cardY,
          cardWidth,
          cardHeight,
          10
        )
        .strokeColor("#CDD5DA")
        .lineWidth(1)
        .stroke();

     
      // GREEN NET PAY AREA

      doc
        .roundedRect(
          cardX + 1,
          cardY + 1,
          cardWidth - 2,
          89,
          9
        )
        .fillColor(lightGreen)
        .fill();

      
      // GREEN VERTICAL LINE

      doc
        .rect(
          cardX + 16,
          cardY + 19,
          4,
          55
        )
        .fillColor(green)
        .fill();

     
      // NET PAY

      doc
        .font("NotoSans-Bold")
        .fontSize(21)
        .fillColor("#111111")
        .text(
          `₹${money(netPay)}`,
          cardX + 32,
          cardY + 17,
          {
            width: cardWidth - 42,
            align: "left",
          }
        );

      doc
        .font("NotoSans")
        .fontSize(8)
        .fillColor("#648067")
        .text(
          "Employee Net Pay",
          cardX + 32,
          cardY + 51
        );

    
      // CARD DIVIDER

      doc
        .moveTo(
          cardX,
          cardY + 90
        )
        .lineTo(
          cardX + cardWidth,
          cardY + 90
        )
        .strokeColor(border)
        .lineWidth(1)
        .stroke();

    
      // ATTENDANCE INFORMATION
      //
      // FIX:
      // Previously the rows were:
      //
      // 105
      // 122
      // 139
      //
      // which caused LOP Days to touch/overflow the bottom.
      //
      // Now we use evenly spaced rows:
      //
      // 105
      // 122
      // 139
      //
      // and the card itself has enough height.
      //
      // =========================================================

      const attendanceX =
        cardX + 16;

      const attendanceLabelWidth = 95;

      drawLabelValue(
        "Calendar Days",
        payroll.calendarDays,
        attendanceX,
        cardY + 105,
        attendanceLabelWidth
      );

      drawLabelValue(
        "Paid Days",
        payroll.paidDays,
        attendanceX,
        cardY + 122,
        attendanceLabelWidth
      );

      drawLabelValue(
        "LOP Days",
        payroll.lopDays,
        attendanceX,
        cardY + 139,
        attendanceLabelWidth
      );

      // =========================================================
      // MOVE BELOW CARD
      // =========================================================
      //
      // The card is now taller, so move y enough to prevent
      // the table divider from touching the card.
      //
      // =========================================================

      y += 34;

      // =========================================================
      // DIVIDER
      // =========================================================

      doc
        .moveTo(margin, y)
        .lineTo(
          margin + contentWidth,
          y
        )
        .strokeColor(border)
        .lineWidth(1)
        .stroke();

      y += 16;

      // =========================================================
      // EARNINGS / DEDUCTIONS TABLE
      // =========================================================

      const tableX = margin;
      const tableY = y;

      const tableWidth = contentWidth;

      const earningsWidth = 220;
      const earningsAmountWidth = 90;

      const deductionsWidth = 150;

      const deductionsAmountWidth =
        tableWidth -
        earningsWidth -
        earningsAmountWidth -
        deductionsWidth;

      const headerHeight = 34;
      const rowHeight = 24;

      const maxRows = Math.max(
        earnings.length,
        deductions.length,
        1
      );

      const totalRowsHeight =
        maxRows * rowHeight;

      const totalHeight =
        headerHeight +
        totalRowsHeight +
        rowHeight;

      // =========================================================
      // OUTER TABLE
      // =========================================================

      doc
        .roundedRect(
          tableX,
          tableY,
          tableWidth,
          totalHeight,
          10
        )
        .fillColor("#FFFFFF")
        .fill();

      doc
        .roundedRect(
          tableX,
          tableY,
          tableWidth,
          totalHeight,
          10
        )
        .strokeColor("#D6DBDF")
        .lineWidth(1)
        .stroke();

      // =========================================================
      // TABLE HEADER
      // =========================================================

      doc
        .font("NotoSans-Bold")
        .fontSize(8)
        .fillColor("#4E5256")
        .text(
          "EARNINGS",
          tableX + 14,
          tableY + 13
        );

      doc
        .text(
          "AMOUNT",
          tableX +
            earningsWidth -
            70,
          tableY + 13
        );

      const deductionStart =
        tableX +
        earningsWidth +
        earningsAmountWidth;

      doc
        .text(
          "DEDUCTIONS",
          deductionStart + 14,
          tableY + 13
        );

      doc
        .text(
          "AMOUNT",
          tableX +
            tableWidth -
            deductionsAmountWidth +
            10,
          tableY + 13
        );

      // =========================================================
      // HEADER DIVIDER
      // =========================================================

      doc
        .moveTo(
          tableX + 12,
          tableY + headerHeight
        )
        .lineTo(
          tableX +
            tableWidth -
            12,
          tableY + headerHeight
        )
        .strokeColor(border)
        .lineWidth(1)
        .stroke();

      // =========================================================
      // TABLE ROWS
      // =========================================================

      for (
        let i = 0;
        i < maxRows;
        i++
      ) {
        const rowY =
          tableY +
          headerHeight +
          i * rowHeight;

        const earning =
          earnings[i];

        const deduction =
          deductions[i];

        // =======================================================
        // EARNING
        // =======================================================

        if (earning) {
          doc
            .font("NotoSans")
            .fontSize(8)
            .fillColor(textColor)
            .text(
              earning.label || "-",
              tableX + 14,
              rowY + 7,
              {
                width:
                  earningsWidth - 25,
              }
            );

          doc
            .font("NotoSans")
            .fontSize(8)
            .fillColor(textColor)
            .text(
              `₹${money(
                earning.amount
              )}`,
              tableX +
                earningsWidth -
                75,
              rowY + 7,
              {
                width: 65,
                align: "right",
              }
            );
        }

        // =======================================================
        // DEDUCTION
        // =======================================================

        if (deduction) {
          doc
            .font("NotoSans")
            .fontSize(8)
            .fillColor(textColor)
            .text(
              deduction.label || "-",
              deductionStart + 14,
              rowY + 7,
              {
                width:
                  deductionsWidth - 20,
              }
            );

          doc
            .font("NotoSans")
            .fontSize(8)
            .fillColor(textColor)
            .text(
              `₹${money(
                deduction.amount
              )}`,
              tableX +
                tableWidth -
                deductionsAmountWidth +
                5,
              rowY + 7,
              {
                width:
                  deductionsAmountWidth -
                  15,
                align: "right",
              }
            );
        }
      }

      // =========================================================
      // TOTAL ROW
      // =========================================================

      const totalY =
        tableY +
        headerHeight +
        totalRowsHeight;

      doc
        .rect(
          tableX + 1,
          totalY,
          tableWidth - 2,
          rowHeight
        )
        .fillColor(lightGray)
        .fill();

      // Gross Earnings

      doc
        .font("NotoSans-Bold")
        .fontSize(8)
        .fillColor(textColor)
        .text(
          "Gross Earnings",
          tableX + 14,
          totalY + 7
        );

      doc
        .font("NotoSans-Bold")
        .fontSize(8)
        .fillColor(textColor)
        .text(
          `₹${money(
            grossEarnings
          )}`,
          tableX +
            earningsWidth -
            75,
          totalY + 7,
          {
            width: 65,
            align: "right",
          }
        );

      // Total Deductions

      doc
        .font("NotoSans-Bold")
        .fontSize(8)
        .fillColor(textColor)
        .text(
          "Total Deductions",
          deductionStart + 14,
          totalY + 7
        );

      doc
        .font("NotoSans-Bold")
        .fontSize(8)
        .fillColor(textColor)
        .text(
          `₹${money(
            totalDeductions
          )}`,
          tableX +
            tableWidth -
            deductionsAmountWidth +
            5,
          totalY + 7,
          {
            width:
              deductionsAmountWidth -
              15,
            align: "right",
          }
        );

      y =
        tableY +
        totalHeight +
        22;

      // =========================================================
      // TOTAL NET PAYABLE
      // =========================================================

      const netBoxHeight = 65;

      doc
        .roundedRect(
          tableX,
          y,
          tableWidth,
          netBoxHeight,
          9
        )
        .strokeColor("#D5DADF")
        .lineWidth(1)
        .stroke();

      const amountBoxWidth = 150;

      doc
        .roundedRect(
          tableX +
            tableWidth -
            amountBoxWidth,
          y + 1,
          amountBoxWidth - 1,
          netBoxHeight - 2,
          9
        )
        .fillColor(lightGreen)
        .fill();

      doc
        .font("NotoSans-Bold")
        .fontSize(9)
        .fillColor("#222222")
        .text(
          "TOTAL NET PAYABLE",
          tableX + 14,
          y + 13
        );

      doc
        .font("NotoSans")
        .fontSize(8)
        .fillColor("#777777")
        .text(
          "Gross Earnings - Total Deductions",
          tableX + 14,
          y + 32
        );

      doc
        .font("NotoSans-Bold")
        .fontSize(16)
        .fillColor("#111111")
        .text(
          `₹${money(netPay)}`,
          tableX +
            tableWidth -
            amountBoxWidth +
            8,
          y + 21,
          {
            width:
              amountBoxWidth - 18,
            align: "right",
          }
        );

      y += netBoxHeight + 24;

      // =========================================================
      // AMOUNT IN WORDS
      // =========================================================

      const amountInWords =
        numberToIndianWords(netPay);

      doc
        .font("NotoSans")
        .fontSize(8)
        .fillColor("#777777")
        .text(
          "Amount In Words:",
          tableX,
          y,
          {
            continued: true,
          }
        );

      doc
        .font("NotoSans-Bold")
        .fontSize(8)
        .fillColor("#333333")
        .text(
          ` ${amountInWords}`
        );

      // =========================================================
      // FOOTER
      // =========================================================

      const footerY =
        pageHeight - 55;

      doc
        .moveTo(
          margin,
          footerY - 15
        )
        .lineTo(
          margin + contentWidth,
          footerY - 15
        )
        .strokeColor(border)
        .lineWidth(1)
        .stroke();

      doc
        .font("NotoSans")
        .fontSize(7)
        .fillColor("#777777")
        .text(
          "This document has been automatically generated by the Payroll System; therefore, a signature is not required.",
          margin,
          footerY,
          {
            width: contentWidth,
            align: "center",
          }
        );

      // =========================================================
      // FINISH PDF
      // =========================================================

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

// =============================================================
// INDIAN NUMBER TO WORDS
// =============================================================

function numberToIndianWords(number) {
  const num = Math.round(
    Number(number) || 0
  );

  if (num === 0) {
    return "Zero Only";
  }

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
  ];

  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function twoDigits(n) {
    if (n === 0) {
      return "";
    }

    if (n < 10) {
      return ones[n];
    }

    if (n < 20) {
      return teens[n - 10];
    }

    return (
      tens[Math.floor(n / 10)] +
      (n % 10
        ? ` ${ones[n % 10]}`
        : "")
    );
  }

  function convert(n) {
    let result = "";

    if (n >= 10000000) {
      result +=
        `${convert(
          Math.floor(n / 10000000)
        )} Crore `;

      n %= 10000000;
    }

    if (n >= 100000) {
      result +=
        `${convert(
          Math.floor(n / 100000)
        )} Lakh `;

      n %= 100000;
    }

    if (n >= 1000) {
      result +=
        `${convert(
          Math.floor(n / 1000)
        )} Thousand `;

      n %= 1000;
    }

    if (n >= 100) {
      result +=
        `${ones[
          Math.floor(n / 100)
        ]} Hundred `;

      n %= 100;
    }

    if (n > 0) {
      result += twoDigits(n);
    }

    return result.trim();
  }

  return `${convert(num)} Only`;
}

// =============================================================
// EXPORT
// =============================================================

module.exports = {
  generatePayslipPdf,
};



// async function generatePayslipPdf({
//   user,
//   payrollRun,
//   payrollItem,
//   filePath,
// }) {
//   return new Promise((resolve, reject) => {

//     try {

//       const directory = path.dirname(filePath);

//       fs.mkdirSync(directory, {
//         recursive: true,
//       });

//       const doc = new PDFDocument({
//         size: "A4",
//         margin: 50,
//       });

//       const stream = fs.createWriteStream(filePath);

//       stream.on("finish", resolve);
//       stream.on("error", reject);

//       doc.pipe(stream);

//       // HEADER

//       doc
//         .fontSize(18)
//         .font("Helvetica-Bold")
//         .text("SALARY PAYSLIP", {
//           align: "center",
//         });

//       doc.moveDown();

//       doc
//         .fontSize(11)
//         .font("Helvetica")
//         .text(
//           `Payroll Period: ${String(payrollRun.month).padStart(2, "0")}/${payrollRun.year}`,
//           {
//             align: "center",
//           }
//         );

//       doc.moveDown(2);

//       // EMPLOYEE DETAILS

//       doc
//         .fontSize(11)
//         .font("Helvetica-Bold")
//         .text("Employee Details");

//       doc.moveDown(0.5);

//       doc
//         .font("Helvetica")
//         .text(`Employee Code: ${user.emp_code}`)
//         .text(`Employee Name: ${user.name}`)
//         .text(`Designation: ${user.designation || "-"}`);

//       doc.moveDown(1.5);

//       // ATTENDANCE

//       doc
//         .font("Helvetica-Bold")
//         .text("Attendance");

//       doc.moveDown(0.5);

//       doc
//         .font("Helvetica")
//         .text(
//           `Calendar Days: ${payrollItem.calendar_days}`
//         )
//         .text(
//           `Payable Days: ${payrollItem.payable_days}`
//         )
//         .text(
//           `LOP Days: ${payrollItem.lop_days}`
//         );

//       doc.moveDown(1.5);

//       // EARNINGS

//       doc
//         .font("Helvetica-Bold")
//         .text("Earnings");

//       doc.moveDown(0.5);

//       doc
//         .font("Helvetica")
//         .text(
//           `Gross Salary: ₹${Number(
//             payrollItem.gross
//           ).toFixed(2)}`
//         );

//       const earnings =
//         payrollItem.other_earnings || [];

//       for (const earning of earnings) {
//         doc.text(
//           `${earning.label}: ₹${Number(
//             earning.amount || 0
//           ).toFixed(2)}`
//         );
//       }

//       doc.moveDown(1.5);

//       // DEDUCTIONS

//       doc
//         .font("Helvetica-Bold")
//         .text("Deductions");

//       doc.moveDown(0.5);

//       doc
//         .font("Helvetica")
//         .text(
//           `LOP Deduction: ₹${Number(
//             payrollItem.lop_amount
//           ).toFixed(2)}`
//         );

//       const deductions =
//         payrollItem.other_deductions || [];

//       for (const deduction of deductions) {
//         doc.text(
//           `${deduction.label}: ₹${Number(
//             deduction.amount || 0
//           ).toFixed(2)}`
//         );
//       }

//       doc.moveDown(2);

//       // NET PAY

//       doc
//         .fontSize(14)
//         .font("Helvetica-Bold")
//         .text(
//           `Net Pay: ₹${Number(
//             payrollItem.net_pay
//           ).toFixed(2)}`,
//           {
//             align: "right",
//           }
//         );

//       // REMARKS

//       if (payrollItem.remarks) {

//         doc.moveDown(2);

//         doc
//           .fontSize(11)
//           .font("Helvetica-Bold")
//           .text("Remarks");

//         doc
//           .font("Helvetica")
//           .text(payrollItem.remarks);
//       }

//       doc.end();

//     } catch (error) {
//       reject(error);
//     }

//   });
// }


