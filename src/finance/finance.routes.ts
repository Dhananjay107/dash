import { Router } from "express";
import { FinanceEntry } from "./finance.model";

export const router = Router();

// Create finance entry from other services (e.g., medicine sale, consultation)
router.post("/", async (req, res) => {
  const entry = await FinanceEntry.create(req.body);
  res.status(201).json(entry);
});

// General reports endpoint (alias for summary with more options)
router.get("/reports", async (req, res) => {
  const { from, to, hospitalId, pharmacyId, type } = req.query;
  const filter: any = {};
  if (from || to) {
    filter.occurredAt = {};
    if (from) filter.occurredAt.$gte = new Date(from as string);
    if (to) filter.occurredAt.$lte = new Date(to as string);
  }
  if (hospitalId) filter.hospitalId = hospitalId;
  if (pharmacyId) filter.pharmacyId = pharmacyId;
  if (type) filter.type = type;

  const entries = await FinanceEntry.find(filter).limit(1000);
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const revenue = entries.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const expenses = entries.filter((e) => e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0);

  res.json({
    total,
    revenue,
    expenses,
    netProfit: revenue - expenses,
    count: entries.length,
    entries,
  });
});

// Basic aggregated view
router.get("/summary", async (req, res) => {
  const { from, to, hospitalId, pharmacyId } = req.query;
  const filter: any = {};
  if (from || to) {
    filter.occurredAt = {};
    if (from) filter.occurredAt.$gte = new Date(from as string);
    if (to) filter.occurredAt.$lte = new Date(to as string);
  }
  if (hospitalId) filter.hospitalId = hospitalId;
  if (pharmacyId) filter.pharmacyId = pharmacyId;

  const entries = await FinanceEntry.find(filter).limit(1000);
  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  res.json({ total, count: entries.length, entries });
});

// Hospital-wise reports
router.get("/reports/hospital/:id", async (req, res) => {
  const { from, to } = req.query;
  const filter: any = { hospitalId: req.params.id };
  if (from || to) {
    filter.occurredAt = {};
    if (from) filter.occurredAt.$gte = new Date(from as string);
    if (to) filter.occurredAt.$lte = new Date(to as string);
  }

  const entries = await FinanceEntry.find(filter).sort({ occurredAt: -1 });
  const revenue = entries.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const expenses = entries.filter((e) => e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0);

  res.json({
    hospitalId: req.params.id,
    totalRevenue: revenue,
    totalExpenses: expenses,
    netProfit: revenue - expenses,
    count: entries.length,
    entries,
  });
});

// Unit-wise reports (Doctors, Pharmacy, Distributors)
router.get("/reports/unit/:type", async (req, res) => {
  const { from, to, id } = req.query;
  const filter: any = {};
  if (from || to) {
    filter.occurredAt = {};
    if (from) filter.occurredAt.$gte = new Date(from as string);
    if (to) filter.occurredAt.$lte = new Date(to as string);
  }

  if (req.params.type === "DOCTOR" && id) {
    filter.doctorId = id;
  } else if (req.params.type === "PHARMACY" && id) {
    filter.pharmacyId = id;
  } else if (req.params.type === "DISTRIBUTOR" && id) {
    filter.distributorId = id;
  }

  const entries = await FinanceEntry.find(filter).sort({ occurredAt: -1 });
  const revenue = entries.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const expenses = entries.filter((e) => e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0);

  res.json({
    unitType: req.params.type,
    unitId: id,
    totalRevenue: revenue,
    totalExpenses: expenses,
    netProfit: revenue - expenses,
    count: entries.length,
    entries,
  });
});

// Time-wise reports (Daily, Monthly, Yearly)
router.get("/reports/time", async (req, res) => {
  const { period = "MONTHLY", from, to } = req.query;
  const filter: any = {};
  if (from || to) {
    filter.occurredAt = {};
    if (from) filter.occurredAt.$gte = new Date(from as string);
    if (to) filter.occurredAt.$lte = new Date(to as string);
  }

  const entries = await FinanceEntry.find(filter).sort({ occurredAt: -1 });
  
  // Group by time period
  const grouped: Record<string, { revenue: number; expenses: number; count: number }> = {};
  
  entries.forEach((entry) => {
    let key = "";
    const date = new Date(entry.occurredAt);
    if (period === "DAILY") {
      key = date.toISOString().split("T")[0];
    } else if (period === "MONTHLY") {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    } else if (period === "YEARLY") {
      key = String(date.getFullYear());
    }

    if (!grouped[key]) {
      grouped[key] = { revenue: 0, expenses: 0, count: 0 };
    }
    if (entry.amount > 0) {
      grouped[key].revenue += entry.amount;
    } else {
      grouped[key].expenses += Math.abs(entry.amount);
    }
    grouped[key].count += 1;
  });

  res.json({
    period,
    summary: Object.entries(grouped).map(([period, data]) => ({
      period,
      revenue: data.revenue,
      expenses: data.expenses,
      netProfit: data.revenue - data.expenses,
      count: data.count,
    })),
    totalRevenue: entries.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0),
    totalExpenses: entries.filter((e) => e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0),
  });
});


