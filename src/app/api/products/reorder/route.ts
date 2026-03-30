import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(request: NextRequest) {
  try {
    const { updates } = await request.json();
    // updates is an array of { id, order }
    
    const operations = updates.map(({ id, order }: { id: string; order: number }) =>
      db.product.update({ where: { id }, data: { order } })
    );

    await Promise.all(operations);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reorder error:', error);
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
  }
}
