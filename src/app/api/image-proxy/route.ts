import { NextRequest, NextResponse } from 'next/server';

// Proxy para servir imágenes de Cloudinary con CORS headers
// Esto permite que html2canvas capture las imágenes correctamente
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
