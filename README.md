# H&D Vision - Catálogo Profesional de Gafas

App móvil PWA para organizar productos de gafas, generar catálogos automáticamente y exportarlos.

## 🚀 Despliegue en Vercel

1. Crear repositorio en GitHub
2. Conectar a Vercel
3. Agregar variables de entorno en Vercel:

### Variables de entorno necesarias:
```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
CLOUDINARY_CLOUD_NAME=tu-cloud-name
CLOUDINARY_API_KEY=tu-api-key
CLOUDINARY_API_SECRET=tu-api-secret
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=tu-cloud-name
```

## 📱 Características

- Subir fotos de gafas desde la galería
- Formulario de producto (descripción, género, estilo, estado, código)
- Catálogos automáticos agrupados por categoría
- Marca de agua "AGOTADO" en productos sin stock
- Editar y eliminar productos
- Exportar catálogos como PNG, PDF o WhatsApp
- Sincronización automática con Supabase
- Imágenes guardadas en Cloudinary
- PWA instalable en Android/iOS

## 🛠️ Tech Stack

- Next.js 16
- React 19
- Supabase (base de datos)
- Cloudinary (almacenamiento de imágenes)
- html2canvas + jsPDF (exportación)
- PWA (Service Worker)
