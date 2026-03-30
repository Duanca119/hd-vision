import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const results: string[] = [];

    // 1. Verificar tabla products
    const { error: tableError } = await supabase.from('products').select('id').limit(1);
    if (tableError) {
      if (tableError.code === '42P01') {
        results.push('❌ La tabla "products" no existe. Creala en el SQL Editor de Supabase');
      } else {
        results.push('⚠️ Error en tabla products: ' + tableError.message);
      }
    } else {
      results.push('✅ Tabla "products" existe');
    }

    // 2. Verificar bucket product-images
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) {
      results.push('⚠️ No se pueden listar buckets: ' + bucketsError.message);
    } else {
      const bucketExists = buckets?.find(b => b.id === 'product-images');
      if (bucketExists) {
        results.push('✅ Bucket "product-images" existe y está listo');
      } else {
        results.push('❌ Bucket "product-images" no existe. Crealo en el dashboard de Supabase');
      }
    }

    // 3. Verificar que se puede escribir en el bucket (si existe)
    if (results.some(r => r.includes('Bucket "product-images" existe'))) {
      const testBuffer = Buffer.from('test');
      const { error: uploadTest } = await supabase.storage
        .from('product-images')
        .upload('test-connection.txt', testBuffer, { upsert: true });

      if (uploadTest) {
        results.push('⚠️ No se puede subir al bucket: ' + uploadTest.message);
        results.push('💡 Configura políticas de Storage para permitir INSERT a anon');
      } else {
        results.push('✅ Upload al bucket funciona correctamente');
        // Limpiar archivo de prueba
        await supabase.storage.from('product-images').remove(['test-connection.txt']);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
