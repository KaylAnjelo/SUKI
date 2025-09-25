import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Generate PDF for sales report
 */
export const generateSalesReportPDF = (salesData, filters = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('SUKI Sales Report', 50, 50);
      doc.fontSize(12).text(`Generated: ${new Date().toLocaleDateString()}`, 50, 80);
      
      // Filters
      if (filters.dateFrom || filters.dateTo) {
        doc.text(`Date Range: ${filters.dateFrom || 'N/A'} to ${filters.dateTo || 'N/A'}`, 50, 100);
      }
      if (filters.storeId) {
        doc.text(`Store ID: ${filters.storeId}`, 50, 115);
      }

      // Table headers
      const tableTop = 140;
      const itemHeight = 20;
      const col1 = 50;
      const col2 = 200;
      const col3 = 300;
      const col4 = 400;

      // Headers
      doc.fontSize(10).text('Date', col1, tableTop);
      doc.text('Reference', col2, tableTop);
      doc.text('Product', col3, tableTop);
      doc.text('Amount', col4, tableTop);

      // Draw line under headers
      doc.moveTo(col1, tableTop + 15).lineTo(col4 + 100, tableTop + 15).stroke();

      // Table data
      let currentY = tableTop + 25;
      let totalAmount = 0;

      salesData.forEach((transaction, index) => {
        if (currentY > 700) { // New page if needed
          doc.addPage();
          currentY = 50;
        }

        const date = new Date(transaction.date).toLocaleDateString();
        const reference = transaction.reference || 'N/A';
        const product = transaction.product || 'N/A';
        const amount = transaction.amount || 0;

        doc.text(date, col1, currentY);
        doc.text(reference, col2, currentY);
        doc.text(product, col3, currentY);
        doc.text(`₱${amount.toFixed(2)}`, col4, currentY);

        totalAmount += amount;
        currentY += itemHeight;
      });

      // Summary
      const summaryY = currentY + 20;
      doc.fontSize(12).text('Summary:', col1, summaryY);
      doc.text(`Total Transactions: ${salesData.length}`, col1, summaryY + 20);
      doc.text(`Total Amount: ₱${totalAmount.toFixed(2)}`, col1, summaryY + 40);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate PDF for transaction receipt
 */
export const generateTransactionReceiptPDF = (transaction) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', reject);

      // Header
      doc.fontSize(24).text('SUKI', 50, 50);
      doc.fontSize(16).text('Transaction Receipt', 50, 80);
      
      // Transaction details
      doc.fontSize(12);
      doc.text(`Reference: ${transaction.reference_number || 'N/A'}`, 50, 120);
      doc.text(`Date: ${new Date(transaction.transaction_date).toLocaleString()}`, 50, 140);
      doc.text(`Store: ${transaction.stores?.store_name || 'N/A'}`, 50, 160);
      doc.text(`Customer: ${transaction.users?.username || 'Guest'}`, 50, 180);
      
      // Product details
      doc.text(`Product: ${transaction.products?.product_name || 'N/A'}`, 50, 220);
      doc.text(`Quantity: ${transaction.quantity}`, 50, 240);
      doc.text(`Price: ₱${transaction.price.toFixed(2)}`, 50, 260);
      doc.text(`Total: ₱${(transaction.quantity * transaction.price).toFixed(2)}`, 50, 280);
      doc.text(`Points Earned: ${transaction.points || 0}`, 50, 300);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

