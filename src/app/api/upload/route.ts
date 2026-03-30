import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

async function uploadToCloudinary(file: File): Promise<string | null> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  console.log('Cloudinary config:', { cloudName: !!cloudName, apiKey: !!apiKey, apiSecret: !!apiSecret });

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('❌ Faltan variables de Cloudinary');
    return null;
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const sigStr = `folder=hd-vision/products&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(sigStr).digest('hex');

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Build multipart form manually
    const boundary = '----HDVisionBoundary' + Math.random().toString(36).substring(2);
    const parts: Buffer[] = [];

    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="folder"\r\n\r\nhd-vision/products\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="timestamp"\r\n\r\n${timestamp}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="api_key"\r\n\r\n${apiKey}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="signature"\r\n\r\n${signature}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name || 'image.jpg'}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    parts.push(Buffer.from(uint8Array));
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body: body,
      }
    );

    const data = await res.json();
    console.log('Cloudinary response status:', res.status);

    if (res.ok && data.secure_url) {
      console.log('✅ Imagen subida:', data.secure_url);
      return data.secure_url;
    }

    console.error('❌ Cloudinary error:', JSON.stringify(data));
    return null;
  } catch (err: any) {
    console.error('❌ Cloudinary exception:', err.message);
    return null;
  }
}

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No hay archivo' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Solo imágenes' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Max 10MB' }, { status: 400 });
    }

    // Intentar subir a Cloudinary
    const cloudinaryUrl = await uploadToCloudinary(file);

    if (cloudinaryUrl) {
      return NextResponse.json({ url: cloudinaryUrl, storedIn: 'cloudinary' });
    }

    // Fallback: base64
    console.log('⚠️ Usando fallback base64');
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString('base64')}`;
    return NextResponse.json({ url: base64, storedIn: 'base64' });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message || 'Error al subir' }, { status: 500 });
  }
}
