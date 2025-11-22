import { Router, Request, Response } from "express";
import { Appointment } from "../appointment/appointment.model";
import { Order } from "../order/order.model";
import { FinanceEntry } from "../finance/finance.model";
import { InventoryItem } from "../inventory/inventory.model";
import { Prescription } from "../prescription/prescription.model";
import { User } from "../user/user.model";
import { Hospital } from "../master/hospital.model";
import { Pharmacy } from "../master/pharmacy.model";
import { AggregationService } from "../shared/services/aggregation.service";

export const router = Router();

/**
 * PUBLIC API ROUTES
 * These endpoints are accessible without authentication
 * Rate limiting and validation should be applied in production
 */

// Health check
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Government Medical Platform API",
    version: "1.0.0",
  });
});

// Get public hospitals list
router.get("/hospitals", async (_req: Request, res: Response) => {
  try {
    const hospitals = await Hospital.find({ isActive: true })
      .select("name address phone")
      .limit(100)
      .lean();
    res.json({
      success: true,
      data: hospitals,
      count: hospitals.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch hospitals",
      error: error.message,
    });
  }
});

// Get public pharmacies list
router.get("/pharmacies", async (_req: Request, res: Response) => {
  try {
    const pharmacies = await Pharmacy.find({ isActive: true })
      .select("name address phone")
      .limit(100)
      .lean();
    res.json({
      success: true,
      data: pharmacies,
      count: pharmacies.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch pharmacies",
      error: error.message,
    });
  }
});

// Search doctors (public)
router.get("/doctors", async (req: Request, res: Response) => {
  try {
    const { search, hospitalId, limit = 20 } = req.query;
    
    const filter: any = {
      role: "DOCTOR",
      isActive: true,
    };
    
    if (hospitalId) {
      filter.hospitalId = hospitalId;
    }
    
    if (search) {
      filter.$text = { $search: search as string };
    }
    
    const doctors = await User.find(filter)
      .select("name email phone hospitalId")
      .limit(Number(limit))
      .lean();
    
    res.json({
      success: true,
      data: doctors,
      count: doctors.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to search doctors",
      error: error.message,
    });
  }
});

// Search medicines (public - inventory search)
router.get("/medicines", async (req: Request, res: Response) => {
  try {
    const { search, pharmacyId, limit = 50 } = req.query;
    
    const filter: any = {};
    
    if (pharmacyId) {
      filter.pharmacyId = pharmacyId;
    }
    
    if (search) {
      filter.$text = { $search: search as string };
    }
    
    const medicines = await InventoryItem.find(filter)
      .select("medicineName batchNumber quantity expiryDate pharmacyId")
      .limit(Number(limit))
      .lean();
    
    res.json({
      success: true,
      data: medicines,
      count: medicines.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to search medicines",
      error: error.message,
    });
  }
});

// Get appointments with details using aggregation (public - with filters)
router.get("/appointments", async (req: Request, res: Response) => {
  try {
    const filters = {
      patientId: req.query.patientId as string,
      doctorId: req.query.doctorId as string,
      hospitalId: req.query.hospitalId as string,
      status: req.query.status as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    };
    
    const pipeline = AggregationService.getAppointmentsWithDetails(filters);
    const appointments = await Appointment.aggregate(pipeline as any[]);
    
    res.json({
      success: true,
      data: appointments,
      count: appointments.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch appointments",
      error: error.message,
    });
  }
});

// Get orders with details using aggregation (public - with filters)
router.get("/orders", async (req: Request, res: Response) => {
  try {
    const filters = {
      patientId: req.query.patientId as string,
      pharmacyId: req.query.pharmacyId as string,
      status: req.query.status as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    };
    
    const pipeline = AggregationService.getOrdersWithDetails(filters);
    const orders = await Order.aggregate(pipeline as any[]);
    
    res.json({
      success: true,
      data: orders,
      count: orders.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
      error: error.message,
    });
  }
});

// Get finance summary using aggregation (public - aggregated data)
router.get("/finance/summary", async (req: Request, res: Response) => {
  try {
    const filters = {
      hospitalId: req.query.hospitalId as string,
      pharmacyId: req.query.pharmacyId as string,
      type: req.query.type as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    };
    
    const pipeline = AggregationService.getFinanceAggregated(filters);
    const financeData = await FinanceEntry.aggregate(pipeline as any[]);
    
    res.json({
      success: true,
      data: financeData,
      count: financeData.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch finance summary",
      error: error.message,
    });
  }
});

// Get inventory with alerts using aggregation (public)
router.get("/inventory", async (req: Request, res: Response) => {
  try {
    const filters = {
      pharmacyId: req.query.pharmacyId as string,
      medicineName: req.query.medicineName as string,
      lowStockOnly: req.query.lowStockOnly === "true",
    };
    
    const pipeline = AggregationService.getInventoryWithAlerts(filters);
    const inventory = await InventoryItem.aggregate(pipeline as any[]);
    
    res.json({
      success: true,
      data: inventory,
      count: inventory.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch inventory",
      error: error.message,
    });
  }
});

// Get prescriptions with details (public - with filters)
router.get("/prescriptions", async (req: Request, res: Response) => {
  try {
    const filters = {
      patientId: req.query.patientId as string,
      doctorId: req.query.doctorId as string,
      prescriptionId: req.query.prescriptionId as string,
    };
    
    const pipeline = AggregationService.getPrescriptionsWithDetails(filters);
    const prescriptions = await Prescription.aggregate(pipeline as any[]);
    
    res.json({
      success: true,
      data: prescriptions,
      count: prescriptions.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch prescriptions",
      error: error.message,
    });
  }
});

// Statistics endpoint (public aggregated stats)
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [
      totalHospitals,
      totalPharmacies,
      totalDoctors,
      totalPatients,
      activeAppointments,
      pendingOrders,
    ] = await Promise.all([
      Hospital.countDocuments({ isActive: true }),
      Pharmacy.countDocuments({ isActive: true }),
      User.countDocuments({ role: "DOCTOR", isActive: true }),
      User.countDocuments({ role: "PATIENT", isActive: true }),
      Appointment.countDocuments({ status: "CONFIRMED" }),
      Order.countDocuments({ status: "PENDING" }),
    ]);
    
    res.json({
      success: true,
      data: {
        hospitals: totalHospitals,
        pharmacies: totalPharmacies,
        doctors: totalDoctors,
        patients: totalPatients,
        activeAppointments,
        pendingOrders,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
});
