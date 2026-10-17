import { notFound } from 'next/navigation';
import AdminWorkspace from '../../../components/admin-workspace';

const supportedSections = [
  'live-orders', 'orders', 'restaurants', 'drivers', 'customers', 'payments',
  'promotions', 'zones', 'support', 'notifications', 'app-updates', 'reports', 'settings',
];

export function generateStaticParams() {
  return supportedSections.map((section) => ({ section }));
}

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!supportedSections.includes(section)) notFound();
  return <AdminWorkspace section={section} />;
}
