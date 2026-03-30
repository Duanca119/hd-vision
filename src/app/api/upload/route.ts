import { NextRequest, NextResponse } from 'next/server';

// Cloudinary upload via REST API (no SDK needed on edge)
async function uploadToCloudinary(file: File): Promise<string | null> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'hd-vision/products');
    formData.append('upload_preset', 'hd-vision_unsigned');

    // Intentar primero con upload preset (no necesita firma)
    const res1 = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );
    if (res1.ok) {
      const data = await res1.json();
      return data.secure_url;
    }

    // Si no hay upload preset, usar firmado
    const crypto = await import('crypto');
    const timestamp = Math.floor(Date.now() / 1000);
    const sigStr = `folder=hd-vision/products&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(sigStr).digest('hex');

    const signedForm = new FormData();
    signedForm.append('file', file);
    signedForm.append('folder', 'hd-vision/products');
    signedForm.append('timestamp', timestamp.toString());
    signedForm.append('api_key', apiKey);
    signedForm.append('signature', signature);

    const res2 = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: signedForm }
    );
    if (res2.ok) {
      const data = await res2.json();
      return data.secure_url;
    }

    return null;
  } catch {
    return null;
  }
}

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
    console.log('📤 Subiendo imagen a Cloudinary...');
    const cloudinaryUrl = await uploadToCloudinary(file);

    if (cloudinaryUrl) {
      console.log('✅ Imagen subida a Cloudinary:', cloudinaryUrl);
      return NextResponse.json({ url: cloudinaryUrl, storedIn: 'cloudinary' });
    }

    // Fallback: base64
    console.log('⚠️ Cloudinary no disponible, usando base64');
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString('base64')}`;
    return NextResponse.json({ url: base64, storedIn: 'base64' });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
