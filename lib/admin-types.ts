export type DemoRow = Record<string, unknown>;
export type AdminData = Record<string, DemoRow[]>;
export type Point = [number, number];

export const ORDER_STATUSES = ['جديد', 'قيد التأكيد', 'قيد التحضير', 'جاهز للاستلام', 'قيد التوصيل', 'مكتمل', 'ملغي'];
export const PAYMENT_STATUSES = ['بانتظار الدفع', 'مدفوع', 'فشل الدفع', 'مسترد', 'مسترد جزئيًا', 'قيد المراجعة'];
export const PROMO_STATUSES = ['نشط', 'مجدول', 'منتهي', 'ملغي'];

export const EMPTY_DATA: AdminData = {
  orders: [], restaurants: [], drivers: [], customers: [], payments: [], promotions: [], zones: [], support: [],
  settings: [],
};

export const DEFAULT_SETTINGS = {
  id: 'platform', country: 'جمهورية مصر العربية', currency: 'جنيه مصري (EGP)', timezone: 'Africa/Cairo',
  language: 'العربية (مصر)', deliveryPhone: '', commissionRate: 15,
};

/** اسم مجموعة Firestore لكل قسم في اللوحة */
export const SECTION_COLLECTION: Record<string, string> = {
  orders: 'orders', restaurants: 'restaurants', drivers: 'drivers', customers: 'customers',
  promotions: 'promotions', zones: 'zones', support: 'supportTickets', settings: 'settings',
};
