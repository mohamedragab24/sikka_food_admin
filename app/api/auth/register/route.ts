import { NextRequest } from 'next/server';
import { AccountError, createAccount, STATUS_ACTIVE, STATUS_PENDING, validateAccountInput, type AccountRole } from '@/lib/accounts';
import { CORS_HEADERS, rateLimited } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * تسجيل ذاتي من التطبيقات. العميل يُفعَّل فورًا،
 * أما المطعم والسائق فيبقيان "بانتظار الموافقة" حتى يفعّلهما المدير من لوحة التحكم.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) return Response.json({ error: 'محاولات كثيرة. حاول لاحقًا.' }, { status: 429, headers: CORS_HEADERS });
  try {
    const body = await request.json() as Record<string, string>;
    const role = body.role as AccountRole;
    if (!['customer', 'restaurant', 'driver'].includes(role)) return Response.json({ error: 'نوع الحساب غير صالح' }, { status: 400, headers: CORS_HEADERS });
    const input = { role, name: body.name, email: body.email, phone: body.phone, password: body.password, address: body.address, vehicle: body.vehicle, owner: body.owner };
    const problem = validateAccountInput(input);
    if (problem) return Response.json({ error: problem }, { status: 400, headers: CORS_HEADERS });
    const result = await createAccount({ ...input, accountStatus: role === 'customer' ? STATUS_ACTIVE : STATUS_PENDING, createdBy: 'self' } as Parameters<typeof createAccount>[0]);
    return Response.json({ success: true, ...result }, { status: 201, headers: CORS_HEADERS });
  } catch (error) {
    if (error instanceof AccountError) return Response.json({ error: error.message }, { status: error.status, headers: CORS_HEADERS });
    console.error('Register failed:', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'تعذر إنشاء الحساب حاليًا' }, { status: 500, headers: CORS_HEADERS });
  }
}
