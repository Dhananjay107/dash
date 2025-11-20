import { Router } from "express";
import { Hospital } from "./hospital.model";
import { Pharmacy } from "./pharmacy.model";
import { Distributor } from "./distributor.model";
import { requireAuth, requireRole } from "../shared/middleware/auth";

export const router = Router();

// Hospitals
router.post(
  "/hospitals",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  async (req, res) => {
    const hospital = await Hospital.create(req.body);
    res.status(201).json(hospital);
  }
);

router.get(
  "/hospitals",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  async (_req, res) => {
    const hospitals = await Hospital.find().sort({ createdAt: -1 });
    res.json(hospitals);
  }
);

// Pharmacies
router.post(
  "/pharmacies",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req, res) => {
    const pharmacy = await Pharmacy.create(req.body);
    res.status(201).json(pharmacy);
  }
);

router.get(
  "/pharmacies",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (_req, res) => {
    const pharmacies = await Pharmacy.find().sort({ createdAt: -1 });
    res.json(pharmacies);
  }
);

// Distributors
router.post(
  "/distributors",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  async (req, res) => {
    const distributor = await Distributor.create(req.body);
    res.status(201).json(distributor);
  }
);

router.get(
  "/distributors",
  requireAuth,
  requireRole(["SUPER_ADMIN"]),
  async (_req, res) => {
    const distributors = await Distributor.find().sort({ createdAt: -1 });
    res.json(distributors);
  }
);


