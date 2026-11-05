import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, hasPermission } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(session.role, 'audit.view')) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
  try {
    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const [logs, total] = await Promise.all([
      db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit, include: { actor: { select: { id: true, name: true, username: true } } } }),
      db.auditLog.count(),
    ]);
    return NextResponse.json({ logs: logs.map(l => ({ id: l.id, action: l.action, actor: l.actor, entity: l.entity, entityId: l.entityId, metadata: l.metadata, createdAt: l.createdAt.toISOString() })), total, page, totalPages: Math.ceil(total/limit) });
  } catch (error) {
    return NextResponse.json({ error: 'Kan audit logs niet laden', details: String(error) }, { status: 500 });
  }
}
