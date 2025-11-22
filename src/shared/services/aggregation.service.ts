export class AggregationService {
  private static createLookup(from: string, localField: string, as: string) {
    return {
      $lookup: {
        from,
        localField,
        foreignField: "_id",
        as,
      },
    };
  }

  private static createUnwind(path: string) {
    return {
      $unwind: {
        path,
        preserveNullAndEmptyArrays: true,
      },
    };
  }

  private static createDateRangeFilter(field: string, fromDate?: string, toDate?: string) {
    const filter: any = {};
    if (fromDate) filter[field] = { $gte: new Date(fromDate) };
    if (toDate) {
      if (filter[field]) {
        filter[field].$lte = new Date(toDate);
      } else {
        filter[field] = { $lte: new Date(toDate) };
      }
    }
    return Object.keys(filter).length > 0 ? filter : null;
  }

  static getAppointmentsWithDetails(filters: any = {}) {
    const dateFilter = this.createDateRangeFilter("scheduledAt", filters.fromDate, filters.toDate);
    
    return [
      {
        $match: {
          ...(filters.patientId && { patientId: filters.patientId }),
          ...(filters.doctorId && { doctorId: filters.doctorId }),
          ...(filters.hospitalId && { hospitalId: filters.hospitalId }),
          ...(filters.status && { status: filters.status }),
          ...dateFilter,
        },
      },
      this.createLookup("users", "patientId", "patient"),
      this.createLookup("users", "doctorId", "doctor"),
      this.createLookup("hospitals", "hospitalId", "hospital"),
      this.createUnwind("$patient"),
      this.createUnwind("$doctor"),
      this.createUnwind("$hospital"),
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
      { $sort: { scheduledAt: -1 } },
    ];
  }

  static getOrdersWithDetails(filters: any = {}) {
    const dateFilter = this.createDateRangeFilter("createdAt", filters.fromDate, filters.toDate);
    
    return [
      {
        $match: {
          ...(filters.patientId && { patientId: filters.patientId }),
          ...(filters.pharmacyId && { pharmacyId: filters.pharmacyId }),
          ...(filters.status && { status: filters.status }),
          ...dateFilter,
        },
      },
      this.createLookup("users", "patientId", "patient"),
      this.createLookup("pharmacies", "pharmacyId", "pharmacy"),
      this.createLookup("prescriptions", "prescriptionId", "prescription"),
      this.createUnwind("$patient"),
      this.createUnwind("$pharmacy"),
      this.createUnwind("$prescription"),
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
      { $sort: { createdAt: -1 } },
    ];
  }

  static getFinanceAggregated(filters: any = {}) {
    const dateFilter = this.createDateRangeFilter("occurredAt", filters.fromDate, filters.toDate);
    
    return [
      {
        $match: {
          ...(filters.hospitalId && { hospitalId: filters.hospitalId }),
          ...(filters.pharmacyId && { pharmacyId: filters.pharmacyId }),
          ...(filters.type && { type: filters.type }),
          ...dateFilter,
        },
      },
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
      this.createLookup("hospitals", "_id.hospitalId", "hospital"),
      this.createUnwind("$hospital"),
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
      { $sort: { month: -1, totalAmount: -1 } },
    ];
  }

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
      {
        $addFields: {
          isLowStock: { $lte: ["$quantity", "$threshold"] },
          stockPercentage: {
            $multiply: [
              { $divide: ["$quantity", { $add: ["$threshold", 1] }] },
              100,
            ],
          },
        },
      },
      this.createLookup("distributors", "distributorId", "distributor"),
      this.createLookup("pharmacies", "pharmacyId", "pharmacy"),
      this.createUnwind("$distributor"),
      this.createUnwind("$pharmacy"),
    ];

    if (filters.lowStockOnly) {
      pipeline.push({ $match: { isLowStock: true } });
    }

    pipeline.push(
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
      { $sort: { isLowStock: -1, stockPercentage: 1 } }
    );

    return pipeline;
  }

  static getUsersWithDetails(filters: any = {}) {
    return [
      {
        $match: {
          ...(filters.role && { role: filters.role }),
          ...(filters.hospitalId && { hospitalId: filters.hospitalId }),
          ...(filters.pharmacyId && { pharmacyId: filters.pharmacyId }),
          ...(filters.isActive !== undefined && { isActive: filters.isActive }),
        },
      },
      this.createLookup("hospitals", "hospitalId", "hospital"),
      this.createLookup("pharmacies", "pharmacyId", "pharmacy"),
      this.createLookup("distributors", "distributorId", "distributor"),
      this.createUnwind("$hospital"),
      this.createUnwind("$pharmacy"),
      this.createUnwind("$distributor"),
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
      { $sort: { createdAt: -1 } },
    ];
  }

  static getPrescriptionsWithDetails(filters: any = {}) {
    return [
      {
        $match: {
          ...(filters.patientId && { patientId: filters.patientId }),
          ...(filters.doctorId && { doctorId: filters.doctorId }),
          ...(filters.prescriptionId && { _id: filters.prescriptionId }),
        },
      },
      this.createLookup("users", "patientId", "patient"),
      this.createLookup("users", "doctorId", "doctor"),
      this.createLookup("conversations", "conversationId", "conversation"),
      this.createUnwind("$patient"),
      this.createUnwind("$doctor"),
      this.createUnwind("$conversation"),
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
      { $sort: { createdAt: -1 } },
    ];
  }
}
