# Public API Documentation

## Hospital Ecosystem Public API

This document describes the public API endpoints available for the Hospital Ecosystem platform. These endpoints are accessible without authentication and are suitable for public-facing applications, integrations, and third-party services.

**Base URL:** `http://localhost:4000/api/public`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Response Format](#response-format)
3. [Endpoints](#endpoints)
   - [Hospitals](#hospitals)
   - [Pharmacies](#pharmacies)
   - [Doctors](#doctors)
   - [Medicines Search](#medicines-search)
   - [Appointments](#appointments)
   - [Orders](#orders)
   - [Finance Aggregated](#finance-aggregated)
   - [Inventory Alerts](#inventory-alerts)
   - [Health Check](#health-check)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)
6. [Examples](#examples)

---

## Authentication

**Public API endpoints do not require authentication.** However, for production use, consider implementing API keys or rate limiting.

---

## Response Format

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "data": [...],
  "count": 10,
  "message": "Optional message"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error information"
}
```

---

## Endpoints

### Hospitals

#### Get All Active Hospitals
```http
GET /api/public/hospitals
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "City General Hospital",
      "address": "123 Main St",
      "phone": "+1234567890"
    }
  ],
  "count": 1
}
```

#### Get Hospital by ID
```http
GET /api/public/hospitals/:id
```

**Parameters:**
- `id` (path, required): Hospital ObjectId

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "City General Hospital",
    "address": "123 Main St",
    "phone": "+1234567890",
    "isActive": true
  }
}
```

---

### Pharmacies

#### Get All Active Pharmacies
```http
GET /api/public/pharmacies
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "City Pharmacy",
      "address": "456 Oak Ave",
      "phone": "+1234567891"
    }
  ],
  "count": 1
}
```

#### Get Pharmacy by ID
```http
GET /api/public/pharmacies/:id
```

**Parameters:**
- `id` (path, required): Pharmacy ObjectId

---

### Doctors

#### Get Doctors
```http
GET /api/public/doctors
```

**Query Parameters:**
- `hospitalId` (optional): Filter by hospital ID
- `search` (optional): Full-text search in doctor names

**Example:**
```http
GET /api/public/doctors?hospitalId=507f1f77bcf86cd799439011&search=John
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "name": "Dr. John Smith",
      "email": "john.smith@hospital.com",
      "role": "DOCTOR",
      "hospitalId": "507f1f77bcf86cd799439011"
    }
  ],
  "count": 1
}
```

---

### Medicines Search

#### Search Medicines in Inventory
```http
GET /api/public/medicines/search
```

**Query Parameters:**
- `q` (required): Search query (medicine name)
- `pharmacyId` (optional): Filter by pharmacy ID

**Example:**
```http
GET /api/public/medicines/search?q=paracetamol&pharmacyId=507f1f77bcf86cd799439012
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "medicineName": "Paracetamol 500mg",
      "batchNumber": "BATCH001",
      "quantity": 100,
      "expiryDate": "2025-12-31T00:00:00.000Z",
      "pharmacyId": "507f1f77bcf86cd799439012"
    }
  ],
  "count": 1,
  "query": "paracetamol"
}
```

---

### Appointments

#### Get Appointments with Details (Aggregation)
```http
GET /api/public/appointments
```

**Query Parameters:**
- `status` (optional): Filter by status (PENDING, CONFIRMED, COMPLETED, CANCELLED)
- `doctorId` (optional): Filter by doctor ID
- `patientId` (optional): Filter by patient ID
- `hospitalId` (optional): Filter by hospital ID
- `dateFrom` (optional): Start date (ISO format)
- `dateTo` (optional): End date (ISO format)

**Example:**
```http
GET /api/public/appointments?status=CONFIRMED&hospitalId=507f1f77bcf86cd799439011&dateFrom=2024-01-01&dateTo=2024-12-31
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439015",
      "status": "CONFIRMED",
      "scheduledAt": "2024-06-15T10:00:00.000Z",
      "type": "ONLINE",
      "doctor": {
        "_id": "507f1f77bcf86cd799439013",
        "name": "Dr. John Smith",
        "email": "john.smith@hospital.com"
      },
      "patient": {
        "_id": "507f1f77bcf86cd799439016",
        "name": "Jane Doe",
        "email": "jane.doe@email.com"
      },
      "hospital": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "City General Hospital"
      }
    }
  ],
  "count": 1
}
```

---

### Orders

#### Get Orders with Details (Aggregation)
```http
GET /api/public/orders
```

**Query Parameters:**
- `status` (optional): Filter by status
- `patientId` (optional): Filter by patient ID
- `pharmacyId` (optional): Filter by pharmacy ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439017",
      "status": "DELIVERED",
      "deliveryType": "DELIVERY",
      "items": [...],
      "prescription": {
        "_id": "507f1f77bcf86cd799439018",
        "diagnosis": "Common Cold"
      },
      "patient": {
        "_id": "507f1f77bcf86cd799439016",
        "name": "Jane Doe"
      },
      "pharmacy": {
        "_id": "507f1f77bcf86cd799439012",
        "name": "City Pharmacy"
      }
    }
  ],
  "count": 1
}
```

---

### Finance Aggregated

#### Get Aggregated Finance Data
```http
GET /api/public/finance/aggregated
```

**Query Parameters:**
- `hospitalId` (optional): Filter by hospital ID
- `type` (optional): Filter by finance type
- `year` (optional): Filter by year

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "hospitalId": "507f1f77bcf86cd799439011",
      "hospitalName": "City General Hospital",
      "type": "CONSULTATION_REVENUE",
      "month": 6,
      "year": 2024,
      "totalAmount": 50000,
      "count": 100
    }
  ],
  "count": 1
}
```

---

### Inventory Alerts

#### Get Inventory with Alerts (Aggregation)
```http
GET /api/public/inventory/alerts
```

**Query Parameters:**
- `pharmacyId` (optional): Filter by pharmacy ID
- `lowStockOnly` (optional): Show only low stock items (true/false)
- `expiringSoon` (optional): Show items expiring within 30 days (true/false)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "medicineName": "Paracetamol 500mg",
      "quantity": 5,
      "threshold": 10,
      "isLowStock": true,
      "daysUntilExpiry": 45,
      "pharmacy": {
        "_id": "507f1f77bcf86cd799439012",
        "name": "City Pharmacy"
      }
    }
  ],
  "count": 1
}
```

---

### Health Check

#### API Health Status
```http
GET /api/public/health
```

**Response:**
```json
{
  "success": true,
  "message": "API is healthy",
  "timestamp": "2024-06-15T10:00:00.000Z",
  "version": "1.0.0"
}
```

---

## Error Handling

### HTTP Status Codes

- `200 OK`: Request successful
- `400 Bad Request`: Invalid request parameters
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

### Error Response Format
```json
{
  "success": false,
  "message": "Human-readable error message",
  "error": "Detailed error information"
}
```

---

## Rate Limiting

**Note:** Rate limiting should be implemented in production. Recommended limits:
- 100 requests per minute per IP
- 1000 requests per hour per IP

---

## Examples

### cURL Examples

#### Get All Hospitals
```bash
curl -X GET http://localhost:4000/api/public/hospitals
```

#### Search Medicines
```bash
curl -X GET "http://localhost:4000/api/public/medicines/search?q=paracetamol"
```

#### Get Appointments with Filters
```bash
curl -X GET "http://localhost:4000/api/public/appointments?status=CONFIRMED&dateFrom=2024-01-01"
```

### JavaScript/TypeScript Example

```typescript
const API_BASE = 'http://localhost:4000/api/public';

// Get hospitals
const hospitals = await fetch(`${API_BASE}/hospitals`)
  .then(res => res.json());

// Search medicines
const medicines = await fetch(`${API_BASE}/medicines/search?q=paracetamol`)
  .then(res => res.json());

// Get appointments
const appointments = await fetch(
  `${API_BASE}/appointments?status=CONFIRMED&hospitalId=507f1f77bcf86cd799439011`
).then(res => res.json());
```

### Python Example

```python
import requests

API_BASE = 'http://localhost:4000/api/public'

# Get hospitals
response = requests.get(f'{API_BASE}/hospitals')
hospitals = response.json()

# Search medicines
response = requests.get(f'{API_BASE}/medicines/search', params={'q': 'paracetamol'})
medicines = response.json()
```

---

## Advanced Features

### Aggregation Pipelines

The API uses MongoDB aggregation pipelines with `$lookup` for efficient joins:
- Appointments include joined doctor, patient, and hospital data
- Orders include joined prescription, patient, and pharmacy data
- Finance data is aggregated by hospital, type, and time period
- Inventory includes calculated fields (low stock, days until expiry)

### Full-Text Search

Text search is enabled on:
- User names and emails
- Medicine names and batch numbers
- Prescription notes

Use the `search` parameter in relevant endpoints for full-text search.

---

## Support

For issues or questions, please contact the development team.

**Version:** 1.0.0  
**Last Updated:** 2024-06-15

