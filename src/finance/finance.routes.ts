import { Router } from "express";
import { FinanceEntry } from "./finance.model";

export const router = Router();

// Create finance entry from other services (e.g., medicine sale, consultation)
router.post("/", async (req, res) => {
  const entry = await FinanceEntry.create(req.body);
  res.status(201).json(entry);
});

// Basic aggregated view (can be expanded later with MongoDB aggregation pipelines)
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


