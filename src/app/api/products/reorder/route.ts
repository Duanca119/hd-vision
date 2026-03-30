import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { updates } = await request.json();
    // updates is an array of { id, order }
    
    const operations = updates.map(({ id, order }: { id: string; order: number }) =>
      supabase.from('products').update({ order }).eq('id', id)
    );

    await Promise.all(operations);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reorder error:', error);
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
  }
}
