# Government Medical Platform - Public API Documentation

## Base URL
```
http://localhost:4000/api/public
```

## Authentication
Public API endpoints do not require authentication. However, rate limiting is recommended in production.

---

## Endpoints

### 1. Health Check

**GET** `/health`

Check API health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "Government Medical Platform API",
  "version": "1.0.0"
}
```

---

### 2. Get Hospitals

**GET** `/hospitals`

Get list of active hospitals.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "hospital_id",
      "name": "City Hospital",
      "address": "123 Main St",
      "phone": "+1234567890"
    }
  ],
  "count": 1
}
```

---

### 3. Get Pharmacies

**GET** `/pharmacies`

Get list of active pharmacies.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "pharmacy_id",
      "name": "City Pharmacy",
      "address": "456 Oak Ave",
      "phone": "+1234567891"
    }
  ],
  "count": 1
}
```

---

### 4. Search Doctors

**GET** `/doctors`

Search for doctors. Supports text search.

**Query Parameters:**
- `search` (string, optional): Search term for doctor name/email
- `hospitalId` (string, optional): Filter by hospital
- `limit` (number, optional): Limit results (default: 20)

**Example:**
```
GET /api/public/doctors?search=Dr. Smith&hospitalId=hospital123&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "doctor_id",
      "name": "Dr. John Smith",
      "email": "john.smith@hospital.com",
      "phone": "+1234567892",
      "hospitalId": "hospital123"
    }
  ],
  "count": 1
}
```

---

### 5. Search Medicines

**GET** `/medicines`

Search for medicines in inventory. Supports text search.

**Query Parameters:**
- `search` (string, optional): Search term for medicine name
- `pharmacyId` (string, optional): Filter by pharmacy
- `limit` (number, optional): Limit results (default: 50)

**Example:**
```
GET /api/public/medicines?search=Paracetamol&pharmacyId=pharmacy123
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "inventory_id",
      "medicineName": "Paracetamol 500mg",
      "batchNumber": "BATCH001",
      "quantity": 100,
      "expiryDate": "2025-12-31",
      "pharmacyId": "pharmacy123"
    }
  ],
  "count": 1
}
```

---

### 6. Get Appointments (with Details)

**GET** `/appointments`

Get appointments with patient, doctor, and hospital details using aggregation pipeline.

**Query Parameters:**
- `patientId` (string, optional): Filter by patient
- `doctorId` (string, optional): Filter by doctor
- `hospitalId` (string, optional): Filter by hospital
- `status` (string, optional): Filter by status (PENDING, CONFIRMED, COMPLETED, CANCELLED)
- `fromDate` (ISO date, optional): Filter from date
- `toDate` (ISO date, optional): Filter to date

**Example:**
```
GET /api/public/appointments?patientId=patient123&status=CONFIRMED&fromDate=2024-01-01
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "appointment_id",
      "patientId": "patient123",
      "doctorId": "doctor123",
      "hospitalId": "hospital123",
      "scheduledAt": "2024-01-20T10:00:00.000Z",
      "status": "CONFIRMED",
      "type": "ONLINE",
      "patient": {
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "+1234567893"
      },
      "doctor": {
        "name": "Dr. Jane Smith",
        "email": "jane@hospital.com",
        "role": "DOCTOR"
      },
      "hospital": {
        "name": "City Hospital",
        "address": "123 Main St"
      }
    }
  ],
  "count": 1
}
```

---

### 7. Get Orders (with Details)

**GET** `/orders`

Get orders with patient, pharmacy, and prescription details using aggregation pipeline.

**Query Parameters:**
- `patientId` (string, optional): Filter by patient
- `pharmacyId` (string, optional): Filter by pharmacy
- `status` (string, optional): Filter by status
- `fromDate` (ISO date, optional): Filter from date
- `toDate` (ISO date, optional): Filter to date

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "order_id",
      "patientId": "patient123",
      "pharmacyId": "pharmacy123",
      "prescriptionId": "prescription123",
      "items": [
        {
          "medicineName": "Paracetamol",
          "quantity": 10
        }
      ],
      "status": "DELIVERED",
      "patient": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "pharmacy": {
        "name": "City Pharmacy",
        "address": "456 Oak Ave"
      }
    }
  ],
  "count": 1
}
```

---

### 8. Get Finance Summary

**GET** `/finance/summary`

Get aggregated finance data by type, hospital, and time period.

**Query Parameters:**
- `hospitalId` (string, optional): Filter by hospital
- `pharmacyId` (string, optional): Filter by pharmacy
- `type` (string, optional): Filter by type
- `fromDate` (ISO date, optional): Filter from date
- `toDate` (ISO date, optional): Filter to date

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "type": "CONSULTATION_REVENUE",
      "hospitalId": "hospital123",
      "month": "2024-01",
      "totalAmount": 50000,
      "count": 100,
      "hospital": {
        "name": "City Hospital"
      }
    }
  ],
  "count": 1
}
```

---

### 9. Get Inventory (with Alerts)

**GET** `/inventory`

Get inventory items with low stock alerts and distributor details.

**Query Parameters:**
- `pharmacyId` (string, optional): Filter by pharmacy
- `medicineName` (string, optional): Filter by medicine name
- `lowStockOnly` (boolean, optional): Show only low stock items

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "inventory_id",
      "medicineName": "Paracetamol",
      "quantity": 5,
      "threshold": 10,
      "isLowStock": true,
      "stockPercentage": 45.45,
      "distributor": {
        "name": "Med Distributors",
        "address": "789 Supply St"
      },
      "pharmacy": {
        "name": "City Pharmacy"
      }
    }
  ],
  "count": 1
}
```

---

### 10. Get Prescriptions (with Details)

**GET** `/prescriptions`

Get prescriptions with patient, doctor, and conversation details.

**Query Parameters:**
- `patientId` (string, optional): Filter by patient
- `doctorId` (string, optional): Filter by doctor
- `prescriptionId` (string, optional): Get specific prescription

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "prescription_id",
      "patientId": "patient123",
      "doctorId": "doctor123",
      "items": [
        {
          "medicineName": "Paracetamol",
          "dosage": "500mg",
          "frequency": "Twice daily",
          "duration": "5 days"
        }
      ],
      "notes": "Take with food",
      "patient": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "doctor": {
        "name": "Dr. Jane Smith",
        "email": "jane@hospital.com"
      },
      "conversation": {
        "summary": "Patient consultation summary",
        "messages": []
      }
    }
  ],
  "count": 1
}
```

---

### 11. Get Statistics

**GET** `/stats`

Get aggregated platform statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "hospitals": 10,
    "pharmacies": 25,
    "doctors": 150,
    "patients": 5000,
    "activeAppointments": 200,
    "pendingOrders": 50
  }
}
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

**HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

**Note:** In production, implement rate limiting:
- Recommended: 100 requests per minute per IP
- Use middleware like `express-rate-limit`

---

## Advanced Features

### Aggregation Pipelines
All endpoints use MongoDB aggregation pipelines with `$lookup` for efficient joins and data enrichment.

### Text Search
Doctor and medicine search endpoints support full-text search using MongoDB text indexes.

### Filtering
Most endpoints support multiple filter parameters for flexible data retrieval.

---

## Security Considerations

1. **Rate Limiting**: Implement rate limiting in production
2. **Input Validation**: Validate all query parameters
3. **CORS**: Configure CORS appropriately
4. **Data Sanitization**: Sanitize all user inputs
5. **Monitoring**: Monitor API usage and errors

---

## Support

For issues or questions, contact the development team.

**Last Updated:** January 2024

