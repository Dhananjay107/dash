import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "./user.model";
import { JWT_SECRET } from "../config";
import { requireAuth, requireRole } from "../shared/middleware/auth";
import { createActivity } from "../activity/activity.service";

export const router = Router();

// Basic signup for initial testing (Super Admin can later create all users)
router.post("/signup", async (req, res) => {
  const { name, email, password, role } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(400).json({ message: "Email already in use" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    passwordHash,
    role,
  });

  // Emit activity for user creation
  await createActivity(
    "USER_CREATED",
    "New User Created",
    `New ${role} user created: ${name} (${email})`,
    {
      userId: user.id,
      metadata: { role, email },
    }
  );

  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

// Public endpoint to check if email is admin/super admin (for login page)
router.get("/check-role/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ email }).select("role isActive").lean();
    if (!user) {
      return res.json({ isAdmin: false, role: null, exists: false });
    }
    const isAdmin = user.role === "SUPER_ADMIN" || user.role === "HOSPITAL_ADMIN";
    res.json({ 
      isAdmin, 
      role: user.role, 
      exists: true,
      isActive: user.isActive 
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Public endpoint to get users by role (for doctor listing, etc.)
router.get("/by-role/:role", async (req, res) => {
  const { role } = req.params;
  const users = await User.find({ role })
    .limit(100)
    .select("_id name email role hospitalId pharmacyId")
    .sort({ name: 1 })
    .lean();
  // Ensure _id is included as string
  const formattedUsers = users.map((user: any) => ({
    _id: user._id.toString(),
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    hospitalId: user.hospitalId || undefined,
    pharmacyId: user.pharmacyId || undefined,
  }));
  res.json(formattedUsers);
});

// Admin endpoint to get all users
router.get(
  "/",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (_req, res) => {
    const users = await User.find().limit(50).sort({ createdAt: -1 });
    res.json(users);
  }
);

// Get single user by ID
router.get(
  "/:id",
  requireAuth,
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthenticated" });
      }

      // Check if the route matches a special endpoint first (route order matters)
      if (req.params.id === "check-role" || req.params.id === "by-role") {
        return res.status(404).json({ message: "Invalid endpoint" });
      }

      // Select fields based on user role
      const userRole = req.user.role;
      const isAdmin = userRole === "SUPER_ADMIN" || userRole === "HOSPITAL_ADMIN";
      
      // All authenticated users can view basic user info (passwordHash is always excluded)
      const user = await User.findById(req.params.id).select("-passwordHash");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return user data for all authenticated users
      // Password hash is already excluded, so it's safe
      return res.json(user);
    } catch (error: any) {
      console.error("Error fetching user:", error);
      res.status(400).json({ message: error.message || "Failed to fetch user" });
    }
  }
);

// Update User
router.patch(
  "/:id",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req, res) => {
    try {
      const { name, email, phone, role, hospitalId, pharmacyId, distributorId, isActive } = req.body;
      const update: any = {};
      
      if (name !== undefined) update.name = name;
      if (email !== undefined) update.email = email;
      if (phone !== undefined) update.phone = phone;
      if (role !== undefined) update.role = role;
      if (hospitalId !== undefined) update.hospitalId = hospitalId;
      if (pharmacyId !== undefined) update.pharmacyId = pharmacyId;
      if (distributorId !== undefined) update.distributorId = distributorId;
      if (isActive !== undefined) update.isActive = isActive;

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: update },
        { new: true, runValidators: true }
      );
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await createActivity(
        "USER_UPDATED",
        "User Updated",
        `User ${user.name} (${user.email}) was updated`,
        {
          userId: user.id,
          metadata: { role: user.role },
        }
      );

      res.json(user);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }
);

// Delete User
router.delete(
  "/:id",
  requireAuth,
  requireRole(["SUPER_ADMIN", "HOSPITAL_ADMIN"]),
  async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Prevent deleting SUPER_ADMIN users
      if (user.role === "SUPER_ADMIN" && req.user?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Only SUPER_ADMIN can delete SUPER_ADMIN users" });
      }

      // Store user info before deletion
      const userInfo = {
        name: user.name,
        email: user.email,
        role: user.role,
        userId: user._id.toString(),
      };

      // Delete the user and verify deletion
      const deleteResult = await User.deleteOne({ _id: userId });
      
      if (deleteResult.deletedCount === 0) {
        return res.status(500).json({ message: "Failed to delete user" });
      }

      // Verify deletion
      const verifyDelete = await User.findById(userId);
      if (verifyDelete) {
        // Try force delete using collection
        await User.collection.deleteOne({ _id: user._id });
        const verifyAgain = await User.findById(userId);
        if (verifyAgain) {
          return res.status(500).json({ message: "Failed to delete user from database" });
        }
      }

      await createActivity(
        "USER_DELETED",
        "User Deleted",
        `User ${userInfo.name} (${userInfo.email}) was deleted`,
        {
          userId: userInfo.userId,
          metadata: { role: userInfo.role },
        }
      );

      res.json({ message: "User deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to delete user" });
    }
  }
);
