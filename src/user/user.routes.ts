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

// Public endpoint to get users by role (for doctor listing, etc.)
router.get("/by-role/:role", async (req, res) => {
  const { role } = req.params;
  const users = await User.find({ role })
    .limit(100)
    .select("_id name email role")
    .sort({ name: 1 })
    .lean();
  // Ensure _id is included as string
  const formattedUsers = users.map((user: any) => ({
    _id: user._id.toString(),
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
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


