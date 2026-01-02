import { Router, Request, Response } from "express";
import { InventoryItem } from "../inventory/inventory.model";
import { Prescription } from "../prescription/prescription.model";

export const router = Router();


router.get("/search", async (req: Request, res: Response) => {
  try {
    const { query, composition, brandName, latitude, longitude, radius = 10 } = req.query;

    if (!query && !composition && !brandName) {
      return res.status(400).json({ message: "query, composition, or brandName is required" });
    }

    const filter: any = {
      quantity: { $gt: 0 }, // Only available stock
    };

    // Search by medicine name, composition, or brand name
    if (query) {
      filter.$or = [
        { medicineName: { $regex: query, $options: "i" } },
        { composition: { $regex: query, $options: "i" } },
        { brandName: { $regex: query, $options: "i" } },
      ];
    } else if (composition) {
      filter.composition = { $regex: composition, $options: "i" };
    } else if (brandName) {
      filter.brandName = { $regex: brandName, $options: "i" };
    }

    // Find matching inventory items
    const items = await InventoryItem.find(filter)
      .sort({ expiryDate: 1 }) // FIFO: earliest expiry first
      .limit(500);

    // Group by composition and pharmacy
    const groupedResults: any = {};

    items.forEach((item) => {
      const key = item.composition + "||" + String(item.pharmacyId);
      if (!groupedResults[key]) {
        groupedResults[key] = {
          composition: item.composition,
          medicineName: item.medicineName,
          pharmacyId: item.pharmacyId,
          brands: [],
        };
      }

      const expiryDate = new Date(item.expiryDate);
      const today = new Date();
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = daysUntilExpiry < 0;
      const isExpiringSoon = daysUntilExpiry <= 30 && daysUntilExpiry >= 0;

      // Skip expired items
      if (isExpired) {
        return;
      }

      const mrpValue = item.mrp || item.sellingPrice;
      groupedResults[key].brands.push({
        brandName: item.brandName || "Generic",
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        daysUntilExpiry: daysUntilExpiry,
        isExpiringSoon: isExpiringSoon,
        availableQuantity: item.quantity,
        sellingPrice: item.sellingPrice,
        mrp: mrpValue,
        rackNumber: item.rackNumber,
        rowNumber: item.rowNumber,
      });
    });

    // Get pharmacy details if location provided
    const pharmaciesMap: Record<string, any> = {};
    if (latitude && longitude) {
      const { Pharmacy } = await import("../master/pharmacy.model");
      const pharmacyIds = [...new Set(items.map((item) => item.pharmacyId).filter(Boolean))];
      const pharmacies = await Pharmacy.find({ _id: { $in: pharmacyIds }, isActive: true });

      pharmacies.forEach((pharmacy) => {
        pharmaciesMap[String(pharmacy._id)] = {
          pharmacyId: String(pharmacy._id),
          name: pharmacy.name,
          address: pharmacy.address,
          phone: pharmacy.phone,
          latitude: pharmacy.latitude,
          longitude: pharmacy.longitude,
        };

        // Calculate distance if coordinates available
        if (pharmacy.latitude && pharmacy.longitude) {
          const distance = calculateDistance(
            Number(latitude),
            Number(longitude),
            pharmacy.latitude,
            pharmacy.longitude
          );
          pharmaciesMap[String(pharmacy._id)].distance = distance;
        }
      });
    }

    // Convert to array and add pharmacy info
    const results = Object.values(groupedResults).map((group: any) => ({
      ...group,
      pharmacy: pharmaciesMap[group.pharmacyId] || null,
      brands: group.brands.sort((a: any, b: any) => {
        // Sort by expiry (earliest first), then by price (lowest first)
        if (a.daysUntilExpiry !== b.daysUntilExpiry) {
          return a.daysUntilExpiry - b.daysUntilExpiry;
        }
        return a.sellingPrice - b.sellingPrice;
      }),
    }));

    // Filter by radius if location provided
    let filteredResults = results;
    if (latitude && longitude) {
      filteredResults = results.filter((result: any) => {
        return !result.pharmacy || !result.pharmacy.distance || result.pharmacy.distance <= Number(radius);
      });

      // Sort by distance
      filteredResults.sort((a: any, b: any) => {
        const distA = a.pharmacy?.distance || Infinity;
        const distB = b.pharmacy?.distance || Infinity;
        return distA - distB;
      });
    }

    res.json({
      query: query || composition || brandName,
      results: filteredResults,
      totalCompositions: filteredResults.length,
      totalBrands: items.length,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Get brands for a composition with prescription restrictions
 */
router.get("/brands-by-composition", async (req: Request, res: Response) => {
  try {
    const { composition, prescriptionId, latitude, longitude, radius = 10 } = req.query;

    if (!composition) {
      return res.status(400).json({ message: "composition is required" });
    }

    // Check if prescription exists and has brand restrictions
    let prescriptionRestrictions: any = null;
    if (prescriptionId) {
      const prescription = await Prescription.findById(prescriptionId);
      if (prescription) {
        // Check if any prescription item specifies a brand for this composition
        const matchingItem = prescription.items.find((item) =>
          item.medicineName.toLowerCase().includes((composition as string).toLowerCase())
        );
        if (matchingItem && matchingItem.notes) {
          // Assuming notes field may contain brand restrictions
          prescriptionRestrictions = {
            brandName: matchingItem.notes,
          };
        }
      }
    }

    // Build filter
    const filter: any = {
      composition: { $regex: composition, $options: "i" },
      quantity: { $gt: 0 },
    };

    // If prescription mandates a specific brand, filter by it
    if (prescriptionRestrictions?.brandName) {
      filter.brandName = { $regex: prescriptionRestrictions.brandName, $options: "i" };
    }

    const items = await InventoryItem.find(filter)
      .sort({ expiryDate: 1 })
      .limit(100);

    // Group by pharmacy
    const byPharmacy: any = {};

    items.forEach((item) => {
      if (!item.pharmacyId) return;

      const pharmacyId = String(item.pharmacyId);
      if (!byPharmacy[pharmacyId]) {
        byPharmacy[pharmacyId] = {
          pharmacyId,
          brands: [],
        };
      }

      const expiryDate = new Date(item.expiryDate);
      const today = new Date();
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isExpired = daysUntilExpiry < 0;

      if (isExpired) return;

      byPharmacy[pharmacyId].brands.push({
        brandName: item.brandName || "Generic",
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        daysUntilExpiry,
        availableQuantity: item.quantity,
        sellingPrice: item.sellingPrice,
        mrp: item.mrp || item.sellingPrice,
      });
    });

    // Get pharmacy details
    if (latitude && longitude) {
      const { Pharmacy } = await import("../master/pharmacy.model");
      const pharmacyIds = Object.keys(byPharmacy);
      const pharmacies = await Pharmacy.find({ _id: { $in: pharmacyIds }, isActive: true });

      pharmacies.forEach((pharmacy) => {
        const pharmacyId = String(pharmacy._id);
        if (byPharmacy[pharmacyId]) {
          byPharmacy[pharmacyId].pharmacy = {
            name: pharmacy.name,
            address: pharmacy.address,
            phone: pharmacy.phone,
          };

          if (pharmacy.latitude && pharmacy.longitude) {
            const distance = calculateDistance(
              Number(latitude),
              Number(longitude),
              pharmacy.latitude,
              pharmacy.longitude
            );
            byPharmacy[pharmacyId].pharmacy.distance = distance;
          }
        }
      });
    }

    // Convert to array
    const results = Object.values(byPharmacy);

    // Filter by radius and sort
    let filteredResults = results;
    if (latitude && longitude) {
      filteredResults = results.filter((result: any) => {
        return !result.pharmacy || !result.pharmacy.distance || result.pharmacy.distance <= Number(radius);
      });

      filteredResults.sort((a: any, b: any) => {
        const distA = a.pharmacy?.distance || Infinity;
        const distB = b.pharmacy?.distance || Infinity;
        return distA - distB;
      });
    }

    res.json({
      composition,
      prescriptionRestricted: !!prescriptionRestrictions,
      pharmacies: filteredResults,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

