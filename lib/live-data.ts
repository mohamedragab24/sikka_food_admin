'use client';

import { collection, onSnapshot, type Firestore, type DocumentData } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, EMPTY_DATA, SECTION_COLLECTION, type AdminData, type DemoRow } from './admin-types';

function plain(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const v = value as { toDate?: () => Date };
    if (typeof v.toDate === 'function') return v.toDate().toLocaleString('sv-SE').slice(0, 16);
    if (Array.isArray(value)) return value.map(plain);
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, plain(x)]));
  }
  return value;
}

function toRow(id: string, data: DocumentData): DemoRow {
  const row = plain(data) as DemoRow;
  return { ...row, _ref: id, id: row.id ?? id };
}

const millis = (data: DocumentData) => (typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0);

/** اشتراك حي في جميع مجموعات Firestore التي تعرضها اللوحة */
export function useLiveData(db: Firestore) {
  const [raw, setRaw] = useState<Record<string, DemoRow[]>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsubs = Object.entries(SECTION_COLLECTION).map(([key, name]) =>
      onSnapshot(collection(db, name), (snap) => {
        const docs = snap.docs.map((d) => ({ row: toRow(d.id, d.data()), at: millis(d.data()) }));
        docs.sort((a, b) => b.at - a.at);
        setRaw((current) => ({ ...current, [key]: docs.map((d) => d.row) }));
        setLoaded((current) => ({ ...current, [key]: true }));
      }, (error) => {
        setErrors((current) => [...current, `${name}: ${error.code}`]);
        setLoaded((current) => ({ ...current, [key]: true }));
      }));
    return () => unsubs.forEach((u) => u());
  }, [db]);

  const data = useMemo<AdminData>(() => {
    const merged: AdminData = { ...EMPTY_DATA, ...raw };
    const settings = (merged.settings.find((row) => row._ref === 'platform') ?? { ...DEFAULT_SETTINGS }) as DemoRow;
    const rate = Number(settings.commissionRate ?? 15) / 100;
    merged.settings = [settings];
    merged.payments = merged.orders.map((order) => {
      const subtotal = Number(order.subtotal ?? Number(order.total ?? 0) - Number(order.deliveryFee ?? 0));
      const commission = Math.round(subtotal * rate * 100) / 100;
      const status = String(order.paymentStatus ?? 'بانتظار الدفع');
      return {
        _ref: order._ref, _derived: true,
        id: `PAY-${String(order.id ?? '').replace('ORD-', '')}`, order: order.order, customer: order.customer, customerId: order.customerId,
        restaurant: order.restaurant, restaurantId: order.restaurantId, total: order.total, deliveryFee: order.deliveryFee,
        commission, restaurantNet: Math.round((subtotal - commission) * 100) / 100, driverDue: order.deliveryFee,
        method: order.paymentMethod, status, date: order.date, refund: status === 'مسترد' ? order.total : 0,
      };
    });
    // إحصاءات حقيقية تُحسب من الطلبات وتربط العميل والمطعم والسائق ببعضهم
    const stats = (key: 'customerId' | 'restaurantId' | 'driverId', id: unknown) => {
      const mine = merged.orders.filter((o) => o[key] && o[key] === id);
      const completed = mine.filter((o) => o.status === 'مكتمل');
      return {
        mine, completed,
        orders: mine.length, completedCount: completed.length,
        cancelled: mine.filter((o) => o.status === 'ملغي').length,
        current: mine.filter((o) => ['جديد', 'قيد التأكيد', 'قيد التحضير', 'جاهز للاستلام', 'قيد التوصيل'].includes(String(o.status))).length,
        last: mine[0] ? `${mine[0].order} — ${mine[0].date}` : '',
      };
    };
    merged.restaurants = merged.restaurants.map((r) => {
      const st = stats('restaurantId', r.id);
      const sales = st.completed.reduce((n, o) => n + Number(o.subtotal ?? 0), 0);
      return { ...r, orders: st.orders, completed: st.completedCount, cancelled: st.cancelled, current: st.current, sales, payable: Math.round(sales * (1 - rate) * 100) / 100 };
    });
    merged.drivers = merged.drivers.map((d) => {
      const st = stats('driverId', d.id);
      return { ...d, orders: st.orders, completed: st.completedCount, cancelled: st.cancelled, current: st.current, earnings: st.completed.reduce((n, o) => n + Number(o.deliveryFee ?? 0), 0) };
    });
    merged.customers = merged.customers.map((c) => {
      const st = stats('customerId', c.id);
      return { ...c, orders: st.orders, completed: st.completedCount, cancelled: st.cancelled, current: st.current, lastOrder: st.last, spent: st.completed.reduce((n, o) => n + Number(o.total ?? 0), 0) };
    });
    return merged;
  }, [raw]);

  const ready = Object.keys(SECTION_COLLECTION).every((key) => loaded[key]);
  return { data, ready, errors };
}
