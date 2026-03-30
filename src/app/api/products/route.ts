import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const body = await request.json();
    const { image_url, description, gender, style, status, code, order } = body;

    if (!image_url || !description || !gender || !style || !status) {
      return NextResponse.json({ error: 'Campos requeridos faltantes' }, { status: 400 });
    }

    // Try insert with code column first, fallback without it
    const insertData: Record<string, any> = {
      image_url,
      description,
      gender,
      style,
      status,
    };
    if (code) insertData.code = code;
    if (order !== undefined) insertData.order = order;

    let { data, error } = await supabase
      .from('products')
      .insert(insertData)
      .select()
      .single();

    // If code column doesn't exist, retry without it
    if (error && error.message?.includes('code')) {
      const { code: _c, ...rest } = insertData;
      const retry = await supabase
        .from('products')
        .insert(rest)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Create error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
