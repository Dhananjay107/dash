import { Router } from "express";
import { DistributorOrder } from "./distributorOrder.model";
import { createActivity } from "../activity/activity.service";

export const router = Router();

// Distributor views orders assigned to them
router.get("/", async (req, res) => {
  const { distributorId, status } = req.query;
  const filter: any = {};
  if (distributorId) filter.distributorId = distributorId;
  if (status) filter.status = status;

  const orders = await DistributorOrder.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json(orders);
});

// Update order status and capture delivery proof
router.patch("/:id", async (req, res) => {
  const { status, deliveryOtp, deliveryProofImageUrl } = req.body;

  const order = await DistributorOrder.findByIdAndUpdate(
    req.params.id,
    { status, deliveryOtp, deliveryProofImageUrl },
    { new: true }
  );

  if (order && status === "DELIVERED") {
    await createActivity(
      "DISTRIBUTOR_ORDER_DELIVERED",
      "Distributor Order Delivered",
      `Order for ${order.medicineName} delivered to Pharmacy ${order.pharmacyId}`,
      {
        pharmacyId: order.pharmacyId,
        distributorId: order.distributorId,
        metadata: { orderId: order._id.toString(), medicineName: order.medicineName },
      }
    );
  } else if (order && status === "DISPATCHED") {
    await createActivity(
      "DISTRIBUTOR_ORDER_CREATED",
      "Distributor Order Dispatched",
      `Order for ${order.medicineName} dispatched to Pharmacy ${order.pharmacyId}`,
      {
        pharmacyId: order.pharmacyId,
        distributorId: order.distributorId,
        metadata: { orderId: order._id.toString(), medicineName: order.medicineName },
      }
    );
  }

  res.json(order);
});


