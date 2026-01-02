/**
 * Pharmacy Role Types
 * Support for role-based permissions within pharmacy branches
 */
export type PharmacyRole = "PHARMACY_MANAGER" | "PHARMACY_CASHIER" | "PHARMACY_STAFF";

export interface IPharmacyUserRole {
  userId: string;
  pharmacyId: string;
  role: PharmacyRole;
  permissions: string[];
  isActive: boolean;
}

/**
 * Permission definitions for pharmacy roles
 */
export const PHARMACY_PERMISSIONS = {
  // Inventory permissions
  VIEW_INVENTORY: "view_inventory",
  EDIT_INVENTORY: "edit_inventory",
  ADD_STOCK: "add_stock",
  REMOVE_STOCK: "remove_stock",
  
  // Billing permissions
  CREATE_INVOICE: "create_invoice",
  VIEW_INVOICE: "view_invoice",
  CANCEL_INVOICE: "cancel_invoice",
  PROCESS_PAYMENT: "process_payment",
  
  // Audit permissions
  VIEW_AUDIT: "view_audit",
  CREATE_AUDIT: "create_audit",
  COMPLETE_AUDIT: "complete_audit",
  REVIEW_AUDIT: "review_audit",
  
  // Override permissions
  OVERRIDE_EXPIRY_WARNING: "override_expiry_warning",
  OVERRIDE_PRICE: "override_price",
  OVERRIDE_DISCOUNT: "override_discount",
  
  // Reports
  VIEW_REPORTS: "view_reports",
  EXPORT_REPORTS: "export_reports",
};

/**
 * Default permissions for each pharmacy role
 */
export const ROLE_PERMISSIONS: Record<PharmacyRole, string[]> = {
  PHARMACY_MANAGER: [
    PHARMACY_PERMISSIONS.VIEW_INVENTORY,
    PHARMACY_PERMISSIONS.EDIT_INVENTORY,
    PHARMACY_PERMISSIONS.ADD_STOCK,
    PHARMACY_PERMISSIONS.REMOVE_STOCK,
    PHARMACY_PERMISSIONS.CREATE_INVOICE,
    PHARMACY_PERMISSIONS.VIEW_INVOICE,
    PHARMACY_PERMISSIONS.CANCEL_INVOICE,
    PHARMACY_PERMISSIONS.PROCESS_PAYMENT,
    PHARMACY_PERMISSIONS.VIEW_AUDIT,
    PHARMACY_PERMISSIONS.CREATE_AUDIT,
    PHARMACY_PERMISSIONS.COMPLETE_AUDIT,
    PHARMACY_PERMISSIONS.REVIEW_AUDIT,
    PHARMACY_PERMISSIONS.OVERRIDE_EXPIRY_WARNING,
    PHARMACY_PERMISSIONS.OVERRIDE_PRICE,
    PHARMACY_PERMISSIONS.OVERRIDE_DISCOUNT,
    PHARMACY_PERMISSIONS.VIEW_REPORTS,
    PHARMACY_PERMISSIONS.EXPORT_REPORTS,
  ],
  PHARMACY_CASHIER: [
    PHARMACY_PERMISSIONS.VIEW_INVENTORY,
    PHARMACY_PERMISSIONS.CREATE_INVOICE,
    PHARMACY_PERMISSIONS.VIEW_INVOICE,
    PHARMACY_PERMISSIONS.PROCESS_PAYMENT,
    PHARMACY_PERMISSIONS.VIEW_AUDIT,
  ],
  PHARMACY_STAFF: [
    PHARMACY_PERMISSIONS.VIEW_INVENTORY,
    PHARMACY_PERMISSIONS.VIEW_INVOICE,
    PHARMACY_PERMISSIONS.VIEW_AUDIT,
  ],
};

/**
 * Check if user has permission
 */
export function hasPermission(userPermissions: string[], permission: string): boolean {
  return userPermissions.includes(permission);
}

