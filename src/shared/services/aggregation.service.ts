/**
 * Advanced Aggregation Pipeline Service
 * Provides reusable aggregation pipelines with lookup and filtering
 */

export class AggregationService {
  /**
   * Get appointments with patient and doctor details using $lookup
   */
  static getAppointmentsWithDetails(filters: any = {}) {
    const pipeline: any[] = [
      // Match stage - filter appointments
      {
        $match: {
          ...(filters.patientId && { patientId: filters.patientId }),
          ...(filters.doctorId && { doctorId: filters.doctorId }),
          ...(filters.hospitalId && { hospitalId: filters.hospitalId }),
          ...(filters.status && { status: filters.status }),
          ...(filters.fromDate && {
            scheduledAt: { $gte: new Date(filters.fromDate) },
          }),
          ...(filters.toDate && {
            scheduledAt: { $lte: new Date(filters.toDate) },
          }),
        },
      },
      // Lookup patient details
      {
        $lookup: {
          from: "users",
          localField: "patientId",
          foreignField: "_id",
          as: "patient",
        },
      },
      // Lookup doctor details
      {
        $lookup: {
          from: "users",
          localField: "doctorId",
          foreignField: "_id",
          as: "doctor",
        },
      },
      // Lookup hospital details
      {
        $lookup: {
          from: "hospitals",
          localField: "hospitalId",
          foreignField: "_id",
          as: "hospital",
        },
      },
      // Unwind arrays (convert to objects)
      {
        $unwind: {
          path: "$patient",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$doctor",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$hospital",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Project only needed fields
      {
        $project: {
          _id: 1,
          patientId: 1,
          doctorId: 1,
          hospitalId: 1,
          scheduledAt: 1,
          status: 1,
          type: 1,
          notes: 1,
          createdAt: 1,
          "patient.name": 1,
          "patient.email": 1,
          "patient.phone": 1,
          "doctor.name": 1,
          "doctor.email": 1,
          "doctor.role": 1,
          "hospital.name": 1,
          "hospital.address": 1,
        },
      },
      // Sort by scheduled date
      {
        $sort: { scheduledAt: -1 },
      },
    ];

    return pipeline;
  }

  /**
   * Get orders with prescription, patient, and pharmacy details
   */
  static getOrdersWithDetails(filters: any = {}) {
    const pipeline: any[] = [
      {
        $match: {
          ...(filters.patientId && { patientId: filters.patientId }),
          ...(filters.pharmacyId && { pharmacyId: filters.pharmacyId }),
          ...(filters.status && { status: filters.status }),
          ...(filters.fromDate && {
            createdAt: { $gte: new Date(filters.fromDate) },
          }),
          ...(filters.toDate && {
            createdAt: { $lte: new Date(filters.toDate) },
          }),
        },
      },
      // Lookup patient
      {
        $lookup: {
          from: "users",
          localField: "patientId",
          foreignField: "_id",
          as: "patient",
        },
      },
      // Lookup pharmacy
      {
        $lookup: {
          from: "pharmacies",
          localField: "pharmacyId",
          foreignField: "_id",
          as: "pharmacy",
        },
      },
      // Lookup prescription
      {
        $lookup: {
          from: "prescriptions",
          localField: "prescriptionId",
          foreignField: "_id",
          as: "prescription",
        },
      },
      // Unwind
      {
        $unwind: {
          path: "$patient",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$pharmacy",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$prescription",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Project
      {
        $project: {
          _id: 1,
          patientId: 1,
          pharmacyId: 1,
          prescriptionId: 1,
          items: 1,
          status: 1,
          deliveryType: 1,
          address: 1,
          deliveryCharge: 1,
          createdAt: 1,
          updatedAt: 1,
          "patient.name": 1,
          "patient.email": 1,
          "pharmacy.name": 1,
          "pharmacy.address": 1,
          "prescription.notes": 1,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ];

    return pipeline;
  }

  /**
   * Get finance data aggregated by type, hospital, and time period
   */
  static getFinanceAggregated(filters: any = {}) {
    const pipeline: any[] = [
      {
        $match: {
          ...(filters.hospitalId && { hospitalId: filters.hospitalId }),
          ...(filters.pharmacyId && { pharmacyId: filters.pharmacyId }),
          ...(filters.type && { type: filters.type }),
          ...(filters.fromDate && {
            occurredAt: { $gte: new Date(filters.fromDate) },
          }),
          ...(filters.toDate && {
            occurredAt: { $lte: new Date(filters.toDate) },
          }),
        },
      },
      // Group by type and calculate totals
      {
        $group: {
          _id: {
            type: "$type",
            hospitalId: "$hospitalId",
            month: { $dateToString: { format: "%Y-%m", date: "$occurredAt" } },
          },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          entries: { $push: "$$ROOT" },
        },
      },
      // Lookup hospital details
      {
        $lookup: {
          from: "hospitals",
          localField: "_id.hospitalId",
          foreignField: "_id",
          as: "hospital",
        },
      },
      {
        $unwind: {
          path: "$hospital",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Project
      {
        $project: {
          _id: 0,
          type: "$_id.type",
          hospitalId: "$_id.hospitalId",
          month: "$_id.month",
          totalAmount: 1,
          count: 1,
          "hospital.name": 1,
          entries: 1,
        },
      },
      {
        $sort: { month: -1, totalAmount: -1 },
      },
    ];

    return pipeline;
  }

  /**
   * Get inventory with low stock alerts and distributor details
   */
  static getInventoryWithAlerts(filters: any = {}) {
    const pipeline: any[] = [
      {
        $match: {
          ...(filters.pharmacyId && { pharmacyId: filters.pharmacyId }),
          ...(filters.medicineName && {
            medicineName: { $regex: filters.medicineName, $options: "i" },
          }),
        },
      },
      // Add computed field for low stock
      {
        $addFields: {
          isLowStock: {
            $lte: ["$quantity", "$threshold"],
          },
          stockPercentage: {
            $multiply: [
              { $divide: ["$quantity", { $add: ["$threshold", 1] }] },
              100,
            ],
          },
        },
      },
      // Lookup distributor
      {
        $lookup: {
          from: "distributors",
          localField: "distributorId",
          foreignField: "_id",
          as: "distributor",
        },
      },
      // Lookup pharmacy
      {
        $lookup: {
          from: "pharmacies",
          localField: "pharmacyId",
          foreignField: "_id",
          as: "pharmacy",
        },
      },
      // Unwind
      {
        $unwind: {
          path: "$distributor",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$pharmacy",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Filter low stock if requested
      ...(filters.lowStockOnly
        ? [
            {
              $match: {
                isLowStock: true,
              },
            },
          ]
        : []),
      // Project
      {
        $project: {
          _id: 1,
          pharmacyId: 1,
          medicineName: 1,
          batchNumber: 1,
          expiryDate: 1,
          quantity: 1,
          threshold: 1,
          distributorId: 1,
          isLowStock: 1,
          stockPercentage: 1,
          "distributor.name": 1,
          "distributor.address": 1,
          "pharmacy.name": 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
      {
        $sort: { isLowStock: -1, stockPercentage: 1 },
      },
    ];

    return pipeline;
  }

  /**
   * Get users with their associated hospital/pharmacy/distributor details
   */
  static getUsersWithDetails(filters: any = {}) {
    const pipeline: any[] = [
      {
        $match: {
          ...(filters.role && { role: filters.role }),
          ...(filters.hospitalId && { hospitalId: filters.hospitalId }),
          ...(filters.pharmacyId && { pharmacyId: filters.pharmacyId }),
          ...(filters.isActive !== undefined && { isActive: filters.isActive }),
        },
      },
      // Lookup hospital
      {
        $lookup: {
          from: "hospitals",
          localField: "hospitalId",
          foreignField: "_id",
          as: "hospital",
        },
      },
      // Lookup pharmacy
      {
        $lookup: {
          from: "pharmacies",
          localField: "pharmacyId",
          foreignField: "_id",
          as: "pharmacy",
        },
      },
      // Lookup distributor
      {
        $lookup: {
          from: "distributors",
          localField: "distributorId",
          foreignField: "_id",
          as: "distributor",
        },
      },
      // Unwind
      {
        $unwind: {
          path: "$hospital",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$pharmacy",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$distributor",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Project
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          phone: 1,
          role: 1,
          hospitalId: 1,
          pharmacyId: 1,
          distributorId: 1,
          isActive: 1,
          createdAt: 1,
          "hospital.name": 1,
          "hospital.address": 1,
          "pharmacy.name": 1,
          "pharmacy.address": 1,
          "distributor.name": 1,
          "distributor.address": 1,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ];

    return pipeline;
  }

  /**
   * Get prescriptions with patient, doctor, and conversation details
   */
  static getPrescriptionsWithDetails(filters: any = {}) {
    const pipeline: any[] = [
      {
        $match: {
          ...(filters.patientId && { patientId: filters.patientId }),
          ...(filters.doctorId && { doctorId: filters.doctorId }),
          ...(filters.prescriptionId && { _id: filters.prescriptionId }),
        },
      },
      // Lookup patient
      {
        $lookup: {
          from: "users",
          localField: "patientId",
          foreignField: "_id",
          as: "patient",
        },
      },
      // Lookup doctor
      {
        $lookup: {
          from: "users",
          localField: "doctorId",
          foreignField: "_id",
          as: "doctor",
        },
      },
      // Lookup conversation
      {
        $lookup: {
          from: "conversations",
          localField: "conversationId",
          foreignField: "_id",
          as: "conversation",
        },
      },
      // Unwind
      {
        $unwind: {
          path: "$patient",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$doctor",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$conversation",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Project
      {
        $project: {
          _id: 1,
          patientId: 1,
          doctorId: 1,
          conversationId: 1,
          items: 1,
          notes: 1,
          createdAt: 1,
          "patient.name": 1,
          "patient.email": 1,
          "doctor.name": 1,
          "doctor.email": 1,
          "conversation.summary": 1,
          "conversation.messages": 1,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ];

    return pipeline;
  }
}
