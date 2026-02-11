
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../src/user/user.model";
import { Hospital } from "../src/master/hospital.model";
import { Pharmacy } from "../src/master/pharmacy.model";
import { Distributor } from "../src/master/distributor.model";
import { Template } from "../src/template/template.model";
import { Appointment } from "../src/appointment/appointment.model";
import { Prescription } from "../src/prescription/prescription.model";
import { InventoryItem } from "../src/inventory/inventory.model";
import { Order } from "../src/order/order.model";
import { FinanceEntry } from "../src/finance/finance.model";

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://d:123@cluster0.qv3mrd1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function seedDummyData() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Clear existing data (optional - comment out if you want to keep existing data)
    // await User.deleteMany({});
    // await Hospital.deleteMany({});
    // await Pharmacy.deleteMany({});
    // await Distributor.deleteMany({});
    // await Template.deleteMany({});

    console.log("🌱 Seeding dummy data...\n");

    // 1. Create Super Admin
    const adminPassword = await bcrypt.hash("admin123", 10);
    let superAdmin = await User.findOne({ email: "admin@hospital.com" });
    if (!superAdmin) {
      superAdmin = await User.create({
        name: "Super Admin",
        email: "admin@hospital.com",
        passwordHash: adminPassword,
        role: "SUPER_ADMIN",
        isActive: true,
      });
      console.log("✅ Created Super Admin");
    }

    // 2. Create Hospitals
    const hospitals = await Promise.all([
      Hospital.findOneAndUpdate(
        { name: "City General Hospital" },
        {
          name: "City General Hospital",
          address: "123 Medical Avenue, Downtown, City 12345",
          phone: "+1 (555) 100-2000",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
      Hospital.findOneAndUpdate(
        { name: "Regional Medical Center" },
        {
          name: "Regional Medical Center",
          address: "456 Health Boulevard, Suburb, City 12346",
          phone: "+1 (555) 200-3000",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
    ]);
    console.log(`✅ Created/Updated ${hospitals.length} Hospitals`);

    // 3. Create Pharmacies
    const pharmacies = await Promise.all([
      Pharmacy.findOneAndUpdate(
        { name: "City General Pharmacy" },
        {
          hospitalId: hospitals[0]._id.toString(),
          name: "City General Pharmacy",
          address: "123 Medical Avenue, Ground Floor, City 12345",
          phone: "+1 (555) 100-2001",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
      Pharmacy.findOneAndUpdate(
        { name: "Regional Medical Pharmacy" },
        {
          hospitalId: hospitals[1]._id.toString(),
          name: "Regional Medical Pharmacy",
          address: "456 Health Boulevard, Wing B, City 12346",
          phone: "+1 (555) 200-3001",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
    ]);
    console.log(`✅ Created/Updated ${pharmacies.length} Pharmacies`);

    // 4. Create Distributors
    const distributors = await Promise.all([
      Distributor.findOneAndUpdate(
        { name: "MedSupply Distributors" },
        {
          name: "MedSupply Distributors",
          address: "789 Supply Chain Road, Industrial Area, City 12347",
          phone: "+1 (555) 300-4000",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
      Distributor.findOneAndUpdate(
        { name: "PharmaLink Solutions" },
        {
          name: "PharmaLink Solutions",
          address: "321 Distribution Center, Warehouse District, City 12348",
          phone: "+1 (555) 400-5000",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
    ]);
    console.log(`✅ Created/Updated ${distributors.length} Distributors`);

    // 5. Create Doctors
    const doctorPassword = await bcrypt.hash("doctor123", 10);
    const doctors = await Promise.all([
      User.findOneAndUpdate(
        { email: "dr.smith@hospital.com" },
        {
          name: "Dr. Sarah Smith",
          email: "dr.smith@hospital.com",
          passwordHash: doctorPassword,
          role: "DOCTOR",
          hospitalId: hospitals[0]._id.toString(),
          phone: "+1 (555) 111-2222",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
      User.findOneAndUpdate(
        { email: "dr.johnson@hospital.com" },
        {
          name: "Dr. Michael Johnson",
          email: "dr.johnson@hospital.com",
          passwordHash: doctorPassword,
          role: "DOCTOR",
          hospitalId: hospitals[0]._id.toString(),
          phone: "+1 (555) 111-2223",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
      User.findOneAndUpdate(
        { email: "dr.williams@hospital.com" },
        {
          name: "Dr. Emily Williams",
          email: "dr.williams@hospital.com",
          passwordHash: doctorPassword,
          role: "DOCTOR",
          hospitalId: hospitals[1]._id.toString(),
          phone: "+1 (555) 111-2224",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
    ]);
    console.log(`✅ Created/Updated ${doctors.length} Doctors`);

    // 6. Create Pharmacy Staff
    const pharmacyPassword = await bcrypt.hash("pharmacy123", 10);
    const pharmacyStaff = await Promise.all([
      User.findOneAndUpdate(
        { email: "pharmacy1@hospital.com" },
        {
          name: "Pharmacy Staff 1",
          email: "pharmacy1@hospital.com",
          passwordHash: pharmacyPassword,
          role: "PHARMACY_STAFF",
          pharmacyId: pharmacies[0]._id.toString(),
          phone: "+1 (555) 111-3333",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
    ]);
    console.log(`✅ Created/Updated ${pharmacyStaff.length} Pharmacy Staff`);

    // 7. Create Patients
    const patientPassword = await bcrypt.hash("patient123", 10);
    const patients = await Promise.all([
      User.findOneAndUpdate(
        { email: "patient1@example.com" },
        {
          name: "John Doe",
          email: "patient1@example.com",
          passwordHash: patientPassword,
          role: "PATIENT",
          phone: "+1 (555) 999-0001",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
      User.findOneAndUpdate(
        { email: "patient2@example.com" },
        {
          name: "Jane Smith",
          email: "patient2@example.com",
          passwordHash: patientPassword,
          role: "PATIENT",
          phone: "+1 (555) 999-0002",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
      User.findOneAndUpdate(
        { email: "patient3@example.com" },
        {
          name: "Robert Johnson",
          email: "patient3@example.com",
          passwordHash: patientPassword,
          role: "PATIENT",
          phone: "+1 (555) 999-0003",
          isActive: true,
        },
        { upsert: true, new: true }
      ),
    ]);
    console.log(`✅ Created/Updated ${patients.length} Patients`);

    // 8. Create Prescription Templates
    const prescriptionTemplate = {
      name: "Standard Prescription Template",
      type: "PRESCRIPTION" as const,
      hospitalId: null, // Global template
      content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Arial', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #ffffff;
      color: #000000;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #10b981;
      padding-bottom: 20px;
    }
    .hospital-name {
      font-size: 28px;
      font-weight: bold;
      color: #10b981;
      margin-bottom: 10px;
    }
    .prescription-title {
      font-size: 20px;
      color: #374151;
      margin-top: 10px;
    }
    .patient-info {
      background: #f3f4f6;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .patient-info p {
      margin: 5px 0;
      font-size: 14px;
    }
    .medicines {
      margin-top: 20px;
    }
    .medicines h3 {
      color: #10b981;
      margin-bottom: 15px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      background: white;
    }
    th {
      background: #10b981;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: bold;
    }
    td {
      padding: 10px;
      border: 1px solid #e5e7eb;
    }
    tr:nth-child(even) {
      background: #f9fafb;
    }
    .notes {
      margin-top: 20px;
      padding: 15px;
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      border-radius: 4px;
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
      padding-top: 15px;
    }
    .doctor-signature {
      margin-top: 30px;
      text-align: right;
    }
    .doctor-signature p {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="hospital-name">{{hospitalName}}</div>
    <div style="font-size: 14px; color: #6b7280;">{{hospitalAddress}}</div>
    <div style="font-size: 14px; color: #6b7280; margin-top: 5px;">Phone: {{hospitalPhone}}</div>
    <div class="prescription-title">PRESCRIPTION</div>
  </div>
  
  <div class="patient-info">
    <p><strong>Patient Name:</strong> {{patientName}}</p>
    <p><strong>Patient ID:</strong> {{patientId}}</p>
    <p><strong>Date:</strong> {{date}} | <strong>Time:</strong> {{time}}</p>
    <p><strong>Doctor:</strong> {{doctorName}}</p>
    <p><strong>Appointment ID:</strong> {{appointmentId}}</p>
  </div>
  
  <div class="medicines">
    <h3>Prescribed Medicines:</h3>
    {{medicines}}
  </div>
  
  {{#if notes}}
  <div class="notes">
    <strong>Additional Notes:</strong><br>
    {{notes}}
  </div>
  {{/if}}
  
  <div class="doctor-signature">
    <p><strong>{{doctorName}}</strong></p>
    <p style="font-size: 12px; color: #6b7280;">Licensed Medical Practitioner</p>
  </div>
  
  <div class="footer">
    {{footerText}}
    <br>
    <strong>Prescription ID:</strong> {{prescriptionId}}
  </div>
</body>
</html>`,
      variables: [
        { key: "hospitalName", label: "Hospital Name", defaultValue: "General Hospital", required: true },
        { key: "hospitalAddress", label: "Hospital Address", defaultValue: "", required: false },
        { key: "hospitalPhone", label: "Hospital Phone", defaultValue: "", required: false },
        { key: "patientName", label: "Patient Name", defaultValue: "Patient Name", required: true },
        { key: "patientId", label: "Patient ID", defaultValue: "", required: false },
        { key: "doctorName", label: "Doctor Name", defaultValue: "Dr. Name", required: true },
        { key: "date", label: "Date", defaultValue: "", required: true },
        { key: "time", label: "Time", defaultValue: "", required: false },
        { key: "appointmentId", label: "Appointment ID", defaultValue: "", required: false },
        { key: "prescriptionId", label: "Prescription ID", defaultValue: "", required: false },
        { key: "medicines", label: "Medicines Table", defaultValue: "", required: true },
        { key: "notes", label: "Notes", defaultValue: "", required: false },
        { key: "footerText", label: "Footer Text", defaultValue: "This is a computer-generated prescription. Please follow doctor's instructions.", required: false },
      ],
      footerText: "This is a computer-generated prescription. Please follow doctor's instructions carefully.",
      isActive: true,
      isDefault: true,
    };

    let template = await Template.findOne({ name: prescriptionTemplate.name });
    if (!template) {
      template = await Template.create(prescriptionTemplate);
      console.log("✅ Created Prescription Template");
    } else {
      console.log("✅ Prescription Template already exists");
    }

    // 9. Create Sample Appointments
    const appointments = await Promise.all([
      Appointment.findOneAndUpdate(
        { patientId: patients[0]._id.toString(), doctorId: doctors[0]._id.toString() },
        {
          hospitalId: hospitals[0]._id.toString(),
          doctorId: doctors[0]._id.toString(),
          patientId: patients[0]._id.toString(),
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
          status: "CONFIRMED",
          channel: "OFFLINE",
        },
        { upsert: true, new: true }
      ),
      Appointment.findOneAndUpdate(
        { patientId: patients[1]._id.toString(), doctorId: doctors[1]._id.toString() },
        {
          hospitalId: hospitals[0]._id.toString(),
          doctorId: doctors[1]._id.toString(),
          patientId: patients[1]._id.toString(),
          scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Day after tomorrow
          status: "CONFIRMED",
          channel: "OFFLINE",
        },
        { upsert: true, new: true }
      ),
    ]);
    console.log(`✅ Created/Updated ${appointments.length} Appointments`);

    // 10. Create Sample Prescriptions
    const prescriptions = await Promise.all([
      Prescription.findOneAndUpdate(
        { appointmentId: appointments[0]._id.toString() },
        {
          appointmentId: appointments[0]._id.toString(),
          doctorId: doctors[0]._id.toString(),
          patientId: patients[0]._id.toString(),
          pharmacyId: pharmacies[0]._id.toString(),
          items: [
            {
              medicineName: "Paracetamol 500mg",
              dosage: "1 tablet",
              frequency: "Twice daily",
              duration: "5 days",
              notes: "After meals",
            },
            {
              medicineName: "Amoxicillin 250mg",
              dosage: "1 capsule",
              frequency: "Three times daily",
              duration: "7 days",
              notes: "With water",
            },
            {
              medicineName: "Cough Syrup",
              dosage: "10ml",
              frequency: "Twice daily",
              duration: "5 days",
              notes: "Before sleep",
            },
          ],
          notes: "Take all medicines as prescribed. Complete the full course of antibiotics.",
        },
        { upsert: true, new: true }
      ),
      Prescription.findOneAndUpdate(
        { appointmentId: appointments[1]._id.toString() },
        {
          appointmentId: appointments[1]._id.toString(),
          doctorId: doctors[1]._id.toString(),
          patientId: patients[1]._id.toString(),
          pharmacyId: pharmacies[0]._id.toString(),
          items: [
            {
              medicineName: "Ibuprofen 400mg",
              dosage: "1 tablet",
              frequency: "As needed",
              duration: "3 days",
              notes: "For pain relief",
            },
            {
              medicineName: "Antacid",
              dosage: "1 tablet",
              frequency: "After meals",
              duration: "7 days",
              notes: "If stomach upset",
            },
          ],
          notes: "Follow up if symptoms persist.",
        },
        { upsert: true, new: true }
      ),
    ]);
    console.log(`✅ Created/Updated ${prescriptions.length} Prescriptions`);

    // 11. Create Sample Inventory Items
    const inventoryItems = await Promise.all([
      InventoryItem.findOneAndUpdate(
        { pharmacyId: pharmacies[0]._id.toString(), medicineName: "Paracetamol 500mg", batchNumber: "BATCH-001" },
        {
          pharmacyId: pharmacies[0]._id.toString(),
          medicineName: "Paracetamol 500mg",
          batchNumber: "BATCH-001",
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          quantity: 500,
          threshold: 50,
          distributorId: distributors[0]._id.toString(),
        },
        { upsert: true, new: true }
      ),
      InventoryItem.findOneAndUpdate(
        { pharmacyId: pharmacies[0]._id.toString(), medicineName: "Amoxicillin 250mg", batchNumber: "BATCH-002" },
        {
          pharmacyId: pharmacies[0]._id.toString(),
          medicineName: "Amoxicillin 250mg",
          batchNumber: "BATCH-002",
          expiryDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000), // ~10 months
          quantity: 300,
          threshold: 30,
          distributorId: distributors[0]._id.toString(),
        },
        { upsert: true, new: true }
      ),
      InventoryItem.findOneAndUpdate(
        { pharmacyId: pharmacies[0]._id.toString(), medicineName: "Ibuprofen 400mg", batchNumber: "BATCH-003" },
        {
          pharmacyId: pharmacies[0]._id.toString(),
          medicineName: "Ibuprofen 400mg",
          batchNumber: "BATCH-003",
          expiryDate: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000), // ~13 months
          quantity: 200,
          threshold: 20,
          distributorId: distributors[1]._id.toString(),
        },
        { upsert: true, new: true }
      ),
    ]);
    console.log(`✅ Created/Updated ${inventoryItems.length} Inventory Items`);

    // 12. Create Sample Orders
    const orders = await Promise.all([
      Order.findOneAndUpdate(
        { patientId: patients[0]._id.toString(), prescriptionId: prescriptions[0]._id.toString() },
        {
          patientId: patients[0]._id.toString(),
          pharmacyId: pharmacies[0]._id.toString(),
          prescriptionId: prescriptions[0]._id.toString(),
          items: [
            { medicineName: "Paracetamol 500mg", quantity: 10, price: 50 },
            { medicineName: "Amoxicillin 250mg", quantity: 21, price: 150 },
            { medicineName: "Cough Syrup", quantity: 1, price: 120 },
          ],
          totalAmount: 320,
          deliveryType: "DELIVERY",
          status: "PENDING",
        },
        { upsert: true, new: true }
      ),
    ]);
    console.log(`✅ Created/Updated ${orders.length} Orders`);

    // 13. Create Sample Finance Entries
    const financeEntries = await Promise.all([
      FinanceEntry.create({
        type: "CONSULTATION_FEE",
        amount: 500,
        hospitalId: hospitals[0]._id.toString(),
        doctorId: doctors[0]._id.toString(),
        patientId: patients[0]._id.toString(),
        occurredAt: new Date(),
      }),
      FinanceEntry.create({
        type: "MEDICINE_SALE",
        amount: 320,
        hospitalId: hospitals[0]._id.toString(),
        pharmacyId: pharmacies[0]._id.toString(),
        patientId: patients[0]._id.toString(),
        occurredAt: new Date(),
      }),
      FinanceEntry.create({
        type: "DELIVERY_CHARGE",
        amount: 50,
        hospitalId: hospitals[0]._id.toString(),
        pharmacyId: pharmacies[0]._id.toString(),
        patientId: patients[0]._id.toString(),
        occurredAt: new Date(),
      }),
    ]);
    console.log(`✅ Created ${financeEntries.length} Finance Entries`);

    console.log("\n✅ Dummy data seeding completed!");
    console.log("\n📋 Login Credentials:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Super Admin:");
    console.log("  Email: admin@hospital.com");
    console.log("  Password: admin123");
    console.log("\nDoctor:");
    console.log("  Email: dr.smith@hospital.com");
    console.log("  Password: doctor123");
    console.log("\nPatient:");
    console.log("  Email: patient1@example.com");
    console.log("  Password: patient123");
    console.log("\nPharmacy Staff:");
    console.log("  Email: pharmacy1@hospital.com");
    console.log("  Password: pharmacy123");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
  } catch (error: any) {
    console.error("❌ Error seeding data:", error.message);
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seedDummyData();

