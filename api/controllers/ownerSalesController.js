import supabase from '../../config/db.js';
import { getOwnedStoreIdsOrFail } from '../helper/getOwnerStoreIdsOrFail.js';
import PDFDocument from 'pdfkit';

function groupTransactionsByReference(transactions) {
  const groups = {};
  transactions.forEach(tx => {
    const ref = tx.reference_number || `ref_${tx.id}`;
    if (!groups[ref]) {
      groups[ref] = {
        reference_number: ref,
        store_id: tx.store_id,
        store_name: tx.stores?.store_name || tx.store_name || 'N/A',
        transaction_date: tx.transaction_date,
        total_amount: 0,
        products: []
      };
    }
    const amount = (Number(tx.price) || 0) * (Number(tx.quantity) || 0);
    groups[ref].total_amount += amount;
    groups[ref].products.push(tx.products?.product_name || 'Item');
  });
  return Object.values(groups).map(g => ({
    date: g.transaction_date,
    reference: g.reference_number,
    product: g.products.join(', '),
    amount: g.total_amount,
    store_id: g.store_id,
    store_name: g.store_name
  }));
}

export const getStoresDropdown = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: stores, error } = await supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('owner_id', userId)
      .order('store_name', { ascending: true });

    if (error) throw error;
    return res.json(Array.isArray(stores) ? stores : []);
  } catch (err) {
    console.error('getStoresDropdown error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

export const getSalesReport = async (req, res) => {
  try {
    console.log('GET /api/owner/sales-report - query:', req.query);
    const userId = req.session?.userId || req.session?.user?.user_id;
    console.log('session userId:', userId);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { dateFrom, dateTo, storeId, sortBy = 'newest', page = '1', limit = '10' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageLimit = Math.max(1, parseInt(limit, 10) || 10);

    // ✅ First, get the stores owned by this user
    const ownedStoreIds = await getOwnedStoreIdsOrFail(userId, res);
    if (!Array.isArray(ownedStoreIds)) return; // response already sent on error

    // Log here (after fetching)
    console.log("🧩 Owned store IDs:", ownedStoreIds);

    // If owner has no stores return empty result
    if (ownedStoreIds.length === 0) {
      return res.json({ sales: [], total: 0, page: pageNum, totalPages: 0 });
    }

    // Validate and pick store target(s)
    let targetStoreIds;
    if (storeId) {
      const sid = Number(storeId);
      if (!ownedStoreIds.includes(sid)) {
        return res.status(403).json({ error: 'Requested store not accessible' });
      }
      targetStoreIds = [sid];
    } else {
      targetStoreIds = ownedStoreIds;
    }

    // Log target store IDs here (now defined)
    console.log("🧩 Target store IDs:", targetStoreIds);

    // ✅ Ensure store_id matches type — string vs number issue fix
    let query = supabase
      .from('transactions')
      .select(`
        id,
        reference_number,
        transaction_date,
        price,
        quantity,
        product_id,
        store_id,
        products:product_id(product_name),
        stores:store_id(store_name)
      `)
      .in('store_id', targetStoreIds.map(String)); // <-- important

    if (dateFrom) query = query.gte('transaction_date', dateFrom);
    if (dateTo) query = query.lte('transaction_date', dateTo);

    const { data, error } = await query.order('transaction_date', { ascending: false });
    if (error) throw error;

    const grouped = groupTransactionsByReference(data || []);

    // sorting
    if (sortBy === 'newest') grouped.sort((a,b) => new Date(b.date) - new Date(a.date));
    else if (sortBy === 'oldest') grouped.sort((a,b) => new Date(a.date) - new Date(b.date));
    else if (sortBy === 'amount_high') grouped.sort((a,b) => b.amount - a.amount);
    else if (sortBy === 'amount_low') grouped.sort((a,b) => a.amount - b.amount);
    else if (sortBy === 'product') grouped.sort((a,b) => a.product.localeCompare(b.product));

    const total = grouped.length;
    const totalPages = Math.ceil(total / pageLimit);
    const start = (pageNum - 1) * pageLimit;
    const paged = grouped.slice(start, start + pageLimit);

    return res.json({
      sales: paged,
      total,
      page: pageNum,
      totalPages
    });
  } catch (err) {
    console.error('getSalesReport error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};


export const exportSalesCsv = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });


    const { dateFrom, dateTo, storeId } = req.query;

    const ownedStoreIds = await getOwnedStoreIdsOrFail(userId, res);
    if (!Array.isArray(ownedStoreIds)) return;

    if (ownedStoreIds.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="sales_report.csv"`);
      return res.send('Date,Reference,Product(s),Amount,Store\r\n'); // empty CSV with header
    }

    let targetStoreIds;
    if (storeId) {
      const sid = Number(storeId);
      if (!ownedStoreIds.includes(sid)) return res.status(403).json({ error: 'Requested store not accessible' });
      targetStoreIds = [sid];
    } else {
      targetStoreIds = ownedStoreIds;
    }

    let query = supabase
      .from('transactions')
      .select(`
        id,
        reference_number,
        transaction_date,
        price,
        quantity,
        product_id,
        store_id,
        products:product_id(product_name),
        stores:store_id(store_name)
      `)
      .in('store_id', targetStoreIds.map(String));

    if (dateFrom) query = query.gte('transaction_date', dateFrom);
    if (dateTo) query = query.lte('transaction_date', dateTo);

    const { data, error } = await query.order('transaction_date', { ascending: false });
    if (error) throw error;

    const rows = groupTransactionsByReference(data || []);

    const header = ['Date','Reference','Product(s)','Amount','Store'];
    const csv = [header.join(',')].concat(
      rows.map(r => {
        const cols = [
          `"${(new Date(r.date)).toISOString()}"`,
          `"${r.reference}"`,
          `"${r.product.replace(/"/g,'""')}"`,
          String(r.amount),
          `"${(r.store_name||'').replace(/"/g,'""')}"`
        ];
        return cols.join(',');
      })
    ).join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    const filename = (req.query.filename ? req.query.filename : 'sales_report') + '.csv';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error('exportSalesCsv error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

export const exportSalesPdf = async (req, res) => {
  try {
    const userId = req.session?.userId || req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { dateFrom, dateTo, storeId } = req.query;

    const ownedStoreIds = await getOwnedStoreIdsOrFail(userId, res);
    if (!Array.isArray(ownedStoreIds)) return;

    if (ownedStoreIds.length === 0) {
      // send a small PDF with header only
      const docEmpty = new PDFDocument({ margin: 40, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="sales_report.pdf"`);
      docEmpty.pipe(res);
      docEmpty.fontSize(18).text('Sales Report', { align: 'center' });
      docEmpty.moveDown();
      docEmpty.fontSize(12).text('No transactions for your stores.');
      docEmpty.end();
      return;
    }

    let targetStoreIds;
    if (storeId) {
      const sid = Number(storeId);
      if (!ownedStoreIds.includes(sid)) return res.status(403).json({ error: 'Requested store not accessible' });
      targetStoreIds = [sid];
    } else {
      targetStoreIds = ownedStoreIds;
    }

    let query = supabase
      .from('transactions')
      .select(`
        id,
        reference_number,
        transaction_date,
        price,
        quantity,
        product_id,
        store_id,
        products:product_id(product_name),
        stores:store_id(store_name)
      `)
      .in('store_id', targetStoreIds.map(String));

    if (dateFrom) query = query.gte('transaction_date', dateFrom);
    if (dateTo) query = query.lte('transaction_date', dateTo);

    const { data, error } = await query.order('transaction_date', { ascending: false });
    if (error) throw error;

    const rows = groupTransactionsByReference(data || []);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    const filename = `${req.query.filename || 'sales_report'}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Title
    doc.fontSize(18).text('Sales Report', { align: 'center' });
    doc.moveDown();
    
    // Add filter info if present
    if (dateFrom || dateTo) {
      doc.fontSize(10);
      if (dateFrom && dateTo) {
        doc.text(`Period: ${dateFrom} to ${dateTo}`, { align: 'center' });
      } else if (dateFrom) {
        doc.text(`From: ${dateFrom}`, { align: 'center' });
      } else if (dateTo) {
        doc.text(`To: ${dateTo}`, { align: 'center' });
      }
      doc.moveDown();
    }

    // Table setup
    const tableTop = doc.y;
    const tableLeft = 40;
    const colWidths = {
      date: 90,
      reference: 85,
      product: 150,
      amount: 70,
      store: 120
    };
    
    // Draw table header
    doc.fontSize(10).fillColor('#000');
    let currentX = tableLeft;
    
    // Header background
    doc.rect(tableLeft, tableTop, 515, 25).fillAndStroke('#e0e0e0', '#000');
    
    // Header text
    doc.fillColor('#000');
    doc.text('Date', currentX + 5, tableTop + 8, { width: colWidths.date, align: 'left' });
    currentX += colWidths.date;
    
    doc.text('Reference', currentX + 5, tableTop + 8, { width: colWidths.reference, align: 'left' });
    currentX += colWidths.reference;
    
    doc.text('Product(s)', currentX + 5, tableTop + 8, { width: colWidths.product, align: 'left' });
    currentX += colWidths.product;
    
    doc.text('Amount', currentX + 5, tableTop + 8, { width: colWidths.amount, align: 'right' });
    currentX += colWidths.amount;
    
    doc.text('Store', currentX + 5, tableTop + 8, { width: colWidths.store, align: 'left' });
    
    let currentY = tableTop + 25;
    
    // Calculate total amount
    let totalAmount = 0;
    
    // Draw table rows
    rows.forEach((r, index) => {
      // Check if we need a new page
      if (currentY > 720) {
        doc.addPage();
        currentY = 40;
      }
      
      const rowHeight = Math.max(30, Math.ceil(r.product.length / 25) * 12);
      totalAmount += r.amount;
      
      // Alternate row colors
      if (index % 2 === 0) {
        doc.rect(tableLeft, currentY, 515, rowHeight).fillAndStroke('#f9f9f9', '#000');
      } else {
        doc.rect(tableLeft, currentY, 515, rowHeight).stroke('#000');
      }
      
      currentX = tableLeft;
      doc.fillColor('#000').fontSize(9);
      
      // Date
      doc.text(new Date(r.date).toLocaleDateString(), currentX + 5, currentY + 8, { 
        width: colWidths.date - 10, 
        align: 'left' 
      });
      currentX += colWidths.date;
      
      // Reference
      doc.text(r.reference, currentX + 5, currentY + 8, { 
        width: colWidths.reference - 10, 
        align: 'left' 
      });
      currentX += colWidths.reference;
      
      // Product (with text wrapping)
      doc.text(r.product, currentX + 5, currentY + 8, { 
        width: colWidths.product - 10, 
        align: 'left',
        height: rowHeight - 10
      });
      currentX += colWidths.product;
      
      // Amount
      doc.text(`₱${Number(r.amount).toFixed(2)}`, currentX + 5, currentY + 8, { 
        width: colWidths.amount - 10, 
        align: 'right' 
      });
      currentX += colWidths.amount;
      
      // Store
      doc.text(r.store_name || 'N/A', currentX + 5, currentY + 8, { 
        width: colWidths.store - 10, 
        align: 'left' 
      });
      
      currentY += rowHeight;
    });
    
    // Draw total row
    if (currentY > 720) {
      doc.addPage();
      currentY = 40;
    }
    
    doc.rect(tableLeft, currentY, 515, 25).fillAndStroke('#d0d0d0', '#000');
    doc.fillColor('#000').fontSize(10).font('Helvetica-Bold');
    
    currentX = tableLeft + colWidths.date + colWidths.reference + colWidths.product;
    doc.text('Total:', currentX - 50, currentY + 8, { width: 50, align: 'right' });
    doc.text(`₱${totalAmount.toFixed(2)}`, currentX + 5, currentY + 8, { 
      width: colWidths.amount - 10, 
      align: 'right' 
    });
    
    // Footer with generation date
    doc.font('Helvetica').fontSize(8).fillColor('#666');
    doc.text(
      `Generated on ${new Date().toLocaleString()}`,
      40,
      doc.page.height - 30,
      { align: 'center', width: 515 }
    );
    
    console.log("🧩 Filtered store IDs:", targetStoreIds);
    console.log("🚀 Exporting transactions:", data.map(t => t.store_id));

    doc.end();
  } catch (err) {
    console.error('exportSalesPdf error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
