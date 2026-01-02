import PDFDocument from "pdfkit";
import { IPharmacyInvoice } from "./pharmacyInvoice.model";

interface PharmacyInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
}

interface PatientInfo {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

/**
 * Generate detailed PDF invoice for pharmacy invoice (with batch details, tax breakup)
 */
export async function generatePharmacyInvoicePDF(
  invoice: any,
  pharmacyInfo?: PharmacyInfo,
  patientInfo?: PatientInfo
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 40, 
        size: "A4",
        autoFirstPage: true
      });
      const buffers: Buffer[] = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on("error", reject);

      doc.page.margins = { top: 40, bottom: 40, left: 40, right: 40 };

      // Header
      doc
        .rect(0, 0, 595.28, 80)
        .fill("#1e3a8a");

      doc
        .fontSize(28)
        .font("Helvetica-Bold")
        .fillColor("#ffffff")
        .text("PHARMACY INVOICE", 40, 30, { align: "center", width: 515.28 });

      const invoiceDate = new Date(invoice.billDate || invoice.createdAt || Date.now()).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#ffffff")
        .text(`Invoice #: ${invoice.invoiceNumber}`, 40, 50, { width: 200 })
        .text(`Date: ${invoiceDate}`, 355.28, 50, { width: 200, align: "right" });

      // From and To sections
      let yPos = 100;
      
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#1e3a8a")
        .text("FROM", 40, yPos);
      
      yPos += 18;
      if (pharmacyInfo) {
        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .fillColor("#000000")
          .text(pharmacyInfo.name || "Pharmacy", 40, yPos);
        yPos += 14;
        
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#333333");
        
        if (pharmacyInfo.address) {
          doc.text(pharmacyInfo.address, 40, yPos, { width: 240 });
          yPos += 12;
        }
        if (pharmacyInfo.phone) {
          doc.text(`Phone: ${pharmacyInfo.phone}`, 40, yPos);
          yPos += 12;
        }
        if (pharmacyInfo.email) {
          doc.text(`Email: ${pharmacyInfo.email}`, 40, yPos);
        }
      }

      // Bill To section
      if (patientInfo) {
        yPos = 100;
        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .fillColor("#1e3a8a")
          .text("BILL TO", 315, yPos);
        
        yPos += 18;
        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .fillColor("#000000")
          .text(patientInfo.name || "Customer", 315, yPos);
        yPos += 14;
        
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#333333");
        
        if (patientInfo.address) {
          doc.text(patientInfo.address, 315, yPos, { width: 240 });
          yPos += 12;
        }
        if (patientInfo.phone) {
          doc.text(`Phone: ${patientInfo.phone}`, 315, yPos);
        }
      }

      // Items Table with detailed columns
      yPos = patientInfo ? 200 : 170;
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#1e3a8a")
        .text("ITEMS", 40, yPos);

      // Table Header
      yPos += 25;
      doc
        .rect(40, yPos - 5, 515.28, 25)
        .fill("#f3f4f6");
      
      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("Medicine", 45, yPos, { width: 100 })
        .text("Batch", 150, yPos, { width: 60 })
        .text("Expiry", 215, yPos, { width: 55 })
        .text("Brand", 275, yPos, { width: 70 })
        .text("Qty", 350, yPos, { width: 30 })
        .text("MRP", 385, yPos, { width: 45 })
        .text("Disc%", 435, yPos, { width: 35 })
        .text("Tax", 475, yPos, { width: 40 })
        .text("Total", 520, yPos, { width: 35, align: "right" });

      // Table items
      yPos += 30;
      invoice.items.forEach((item: any, index: number) => {
        // Alternate row colors
        if (index % 2 === 0) {
          doc
            .rect(40, yPos - 3, 515.28, 45)
            .fill("#fafafa");
        }

        const expiryDate = new Date(item.expiryDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });

        doc
          .fontSize(7)
          .font("Helvetica")
          .fillColor("#000000")
          .text(item.medicineName || item.composition, 45, yPos, { width: 100 })
          .text(item.batchNumber || "-", 150, yPos, { width: 60 })
          .text(expiryDate, 215, yPos, { width: 55 })
          .text(item.brandName || "Generic", 275, yPos, { width: 70 })
          .text(String(item.quantity), 350, yPos, { width: 30 })
          .text(`₹${item.mrp?.toFixed(2) || item.sellingPrice?.toFixed(2) || "0.00"}`, 385, yPos, { width: 45 })
          .text(`${item.discount?.toFixed(1) || 0}%`, 435, yPos, { width: 35 })
          .text(`₹${item.taxAmount?.toFixed(2) || "0.00"}`, 475, yPos, { width: 40 })
          .text(`₹${item.total?.toFixed(2) || "0.00"}`, 520, yPos, { width: 35, align: "right" });

        // Composition on second line
        yPos += 12;
        doc
          .fontSize(6)
          .font("Helvetica")
          .fillColor("#666666")
          .text(`Comp: ${item.composition}`, 45, yPos, { width: 250 });

        // Location on third line
        if (item.rackNumber || item.rowNumber) {
          yPos += 10;
          doc
            .fontSize(6)
            .font("Helvetica")
            .fillColor("#666666")
            .text(`Loc: ${item.rackNumber || ""}${item.rackNumber && item.rowNumber ? "-" : ""}${item.rowNumber || ""}`, 45, yPos, { width: 150 });
        }

        yPos += 18;
      });

      // Totals section
      yPos += 10;
      const totalsStartY = yPos;
      
      doc
        .moveTo(300, yPos)
        .lineTo(555.28, yPos)
        .stroke("#cccccc");

      yPos += 15;
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#333333")
        .text("Subtotal:", 400, yPos)
        .text(`₹${invoice.subtotal?.toFixed(2) || "0.00"}`, 480, yPos, { align: "right", width: 70 });

      if (invoice.totalDiscount > 0) {
        yPos += 15;
        doc
          .text("Discount:", 400, yPos)
          .text(`₹${invoice.totalDiscount.toFixed(2)}`, 480, yPos, { align: "right", width: 70 });
      }

      yPos += 15;
      doc
        .text("Tax (GST):", 400, yPos)
        .text(`₹${invoice.totalTax?.toFixed(2) || "0.00"}`, 480, yPos, { align: "right", width: 70 });

      yPos += 15;
      doc
        .moveTo(300, yPos)
        .lineTo(555.28, yPos)
        .stroke("#1e3a8a");

      yPos += 15;
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .fillColor("#1e3a8a")
        .text("Grand Total:", 400, yPos)
        .text(`₹${invoice.grandTotal?.toFixed(2) || "0.00"}`, 480, yPos, { align: "right", width: 70 });

      if (invoice.paymentStatus) {
        yPos += 20;
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#333333")
          .text(`Payment Status: ${invoice.paymentStatus}`, 400, yPos);
        
        if (invoice.paidAmount !== undefined) {
          yPos += 15;
          doc
            .text(`Paid: ₹${invoice.paidAmount.toFixed(2)}`, 400, yPos);
          
          if (invoice.dueAmount !== undefined && invoice.dueAmount > 0) {
            yPos += 15;
            doc
              .text(`Due: ₹${invoice.dueAmount.toFixed(2)}`, 400, yPos);
          }
        }
      }

      // Footer
      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor("#999999")
        .text(
          "Thank you for your business! This is a computer-generated invoice.",
          40,
          800,
          { align: "center", width: 515.28 }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

