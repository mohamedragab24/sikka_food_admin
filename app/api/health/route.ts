export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ ok: true, service: 'maa-admin', timestamp: new Date().toISOString() });
}
