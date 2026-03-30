import { NextResponse } from 'next/server';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const cloudKey = process.env.CLOUDINARY_API_KEY;

  let supabaseStatus = 'not configured';
  let supabaseError = '';
  let tableExists = false;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase.from('products').select('id').limit(1);
      if (error) {
        supabaseError = `${error.code}: ${error.message}`;
      } else {
        supabaseStatus = 'connected';
        tableExists = true;
      }
    } catch (err: any) {
      supabaseError = err.message;
    }
  }

  return NextResponse.json({
    supabase: {
      url: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT SET',
      key: supabaseKey ? `length: ${supabaseKey.length}, starts: ${supabaseKey.substring(0, 20)}...` : 'NOT SET',
      status: supabaseStatus,
      error: supabaseError,
      tableExists,
    },
    cloudinary: {
      cloudName: cloudName || 'NOT SET',
      apiKey: cloudKey || 'NOT SET',
    },
  });
}
