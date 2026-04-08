'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ========== TYPES ==========
interface Product {
  id: string;
  image_url: string;
  description: string;
  gender: string;
  style: string;
  status: string;
  code: string;
  order: number;
}

interface CatalogSection {
  title: string;
  products: Product[];
}

interface CatalogGroup {
  key: string;
  label: string;
  sections: CatalogSection[];
}

// ========== CONSTANTS ==========
const GENDERS = ['Mujer', 'Hombre', 'Niño', 'Unisex', 'Gafas de Sol'];
const STYLES = ['Ovalada', 'Cat-Eye', 'Redonda', 'Cuadrada', 'Aviador', 'Rectangular', 'Wayfarer', 'Clubmaster', 'Media Luna', 'Otro'];
const DESCRIPTIONS = ['Acetato', 'Acerada', 'Mixta', 'Tres Piezas'];
const STATUSES = ['Disponible', 'Agotado'];

// Orden de estilos para la jerarquía de catálogos
const STYLE_ORDER = STYLES;
// Orden de descripciones dentro de cada catálogo primario
const DESC_ORDER = ['Acerada', 'Acetato', 'Mixta'];
// Orden de catálogos primarios
const GENDER_ORDER = ['Mujer', 'Hombre', 'Niño', 'Unisex', 'Gafas de Sol'];

const sortByStyle = (a: Product, b: Product) => STYLE_ORDER.indexOf(a.style) - STYLE_ORDER.indexOf(b.style);

type Screen = 'home' | 'upload' | 'catalogs' | 'detail';

// ========== MAIN APP ==========
export default function Home() {
  const [screen, setScreen] = useState<Screen>('home');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [isReadOnly, setIsReadOnly] = useState(false);
  const catalogRef = useRef<HTMLDivElement>(null);

  // Detect read-only mode from URL params
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('share') === 'true' || params.get('readonly') === 'true') {
        setIsReadOnly(true);
        // Auto-navigate to catalog if specified in URL
        const catParam = params.get('catalog');
        if (catParam) {
          setSelectedKey(catParam);
        }
      }
    }
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchProducts = useCallback(async (showMsg?: boolean) => {
    try {
      const r = await fetch('/api/products');
      if (r.ok) {
        const d = await r.json();
        setProducts(d);
        setLastRefresh(new Date().toLocaleTimeString());
        if (showMsg) showToast(`✅ ${d.length} productos cargados`);
      }
    } catch (_) { /* silent */ }
    setLoading(false);
  }, []);

  // Sync from Supabase (cloud) - force reload
  const syncFromCloud = useCallback(async () => {
    setSyncing(true);
    showToast('🔄 Sincronizando con la nube...');
    try {
      const r = await fetch('/api/sync');
      if (r.ok) {
        const d = await r.json();
        setProducts(d);
        setLastRefresh(new Date().toLocaleTimeString());
        showToast(`✅ Sincronizado: ${d.length} productos`);
      } else {
        showToast('❌ Error al sincronizar');
      }
    } catch (_) { showToast('❌ Error de conexión'); }
    setSyncing(false);
  }, []);

  // Initial load from Supabase
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Auto-navigate to catalog detail when in read-only mode and catalog is set
  useEffect(() => {
    if (isReadOnly && selectedKey && products.length > 0 && screen === 'home') {
      setScreen('detail');
    }
  }, [isReadOnly, selectedKey, products.length, screen]);

  // Auto-refresh: poll every 3 seconds when not on upload screen
  useEffect(() => {
    if (screen === 'upload') return;
    const interval = setInterval(() => { fetchProducts(); }, 3000);
    return () => clearInterval(interval);
  }, [screen, fetchProducts]);

  // Register SW and listen for reload messages
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
        // Check for updates immediately every time app opens
        reg.update();
      }).catch(() => {});
      // Listen for force reload from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'RELOAD') {
          window.location.reload();
        }
      });
    }
  }, []);

  // Force full app update: clear cache + reload fresh
  const forceUpdate = useCallback(async () => {
    setSyncing(true);
    showToast('🔄 Actualizando app al último deploy...');
    try {
      // 1. Unregister service worker to clear its control
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          // Tell SW to clear caches
          reg.active?.postMessage({ type: 'FORCE_UPDATE' });
          // Also unregister it
          await reg.unregister();
        }
      }
      // 2. Clear all caches manually (backup)
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // 3. Reload with cache-busting to get the latest version
      setTimeout(() => {
        window.location.href = window.location.origin + '?t=' + Date.now();
      }, 500);
    } catch (_) {
      // If something fails, just do a hard reload
      window.location.reload();
    }
  }, []);

  // Catalog grouping - jerarquía: catálogo primario por género → secciones por descripción → orden por estilo
  const getCatalogs = (): CatalogGroup[] => {
    const catalogs: CatalogGroup[] = [];

    // 1. Catálogos primarios por género (Acerada, Acetato, Mixta)
    for (const gender of GENDER_ORDER) {
      const genderProducts = products.filter(p => p.gender === gender && p.description !== 'Tres Piezas');
      if (genderProducts.length === 0) continue;

      const sections: CatalogSection[] = [];
      const usedDescs = new Set<string>();

      for (const desc of DESC_ORDER) {
        const descProducts = genderProducts.filter(p => p.description === desc);
        if (descProducts.length > 0) {
          descProducts.sort(sortByStyle);
          sections.push({ title: desc + 's', products: descProducts });
          usedDescs.add(desc);
        }
      }

      // Fallback: productos con descripciones antiguas (Titanio, Aluminio, etc.)
      const others = genderProducts.filter(p => !usedDescs.has(p.description));
      if (others.length > 0) {
        others.sort(sortByStyle);
        sections.push({ title: 'Otros', products: others });
      }

      if (sections.length > 0) {
        catalogs.push({ key: gender.toLowerCase().replace(/\s+/g, '-'), label: gender, sections });
      }
    }

    // 2. Catálogo Tres Piezas aparte (secciones por género)
    const tresPiezas = products.filter(p => p.description === 'Tres Piezas');
    if (tresPiezas.length > 0) {
      const sections: CatalogSection[] = [];
      for (const gender of GENDER_ORDER) {
        const genderTP = tresPiezas.filter(p => p.gender === gender);
        if (genderTP.length > 0) {
          genderTP.sort(sortByStyle);
          sections.push({ title: gender, products: genderTP });
        }
      }
      if (sections.length > 0) {
        catalogs.push({ key: 'tres-piezas', label: 'Tres Piezas', sections });
      }
    }

    return catalogs;
  };

  // Upload logic
  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [form, setForm] = useState({ description: '', gender: '', style: '', status: 'Disponible', code: '' });
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { showToast('Imagen muy grande (max 10MB)'); return; }
    setImgFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => { setImgPreview(ev.target?.result as string); setStep('form'); };
    reader.readAsDataURL(f);
  };

  const resetUpload = () => {
    setImgPreview(null); setImgFile(null); setStep('pick');
    setForm({ description: '', gender: '', style: '', status: 'Disponible', code: '' });
  };

  const handleSubmit = async () => {
    if (!imgFile || !form.description || !form.gender || !form.style || !form.status) {
      showToast('Completa los campos requeridos'); return;
    }
    setSubmitting(true);
    try {
      // Paso 1: subir imagen
      const fd = new FormData(); fd.append('file', imgFile);
      const ur = await fetch('/api/upload', { method: 'POST', body: fd });
      const uploadData = await ur.json();
      if (!ur.ok || !uploadData.url) {
        showToast('❌ Error al subir imagen: ' + (uploadData.error || 'intenta de nuevo'));
        setSubmitting(false); return;
      }
      console.log('Imagen subida:', uploadData.storedIn);

      // Paso 2: guardar producto
      const pr = await fetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: uploadData.url, description: form.description, gender: form.gender, style: form.style, status: form.status, code: form.code })
      });
      if (!pr.ok) {
        const errData = await pr.json().catch(() => ({ error: 'Error desconocido' }));
        showToast('❌ Error al guardar: ' + (errData.error || 'intenta de nuevo'));
        setSubmitting(false); return;
      }
      showToast('✅ ¡Producto guardado!');
      await fetchProducts();
      resetUpload(); setScreen('catalogs');
    } catch (err: any) { showToast('❌ Error: ' + (err.message || 'intenta de nuevo')); }
    setSubmitting(false);
  };

  // Edit logic
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [editImgPreview, setEditImgPreview] = useState<string>('');

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setEditImgPreview(p.image_url);
    setEditForm({ description: p.description, gender: p.gender, style: p.style, status: p.status, code: p.code, image_url: p.image_url });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const r = await fetch(`/api/products/${editingId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm)
      });
      if (r.ok) { showToast('✅ Producto actualizado'); await fetchProducts(); setEditingId(null); }
    } catch (_) { showToast('Error al actualizar'); }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('¿Eliminar este producto permanentemente?')) return;
    try {
      const r = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (r.ok) { showToast('🗑️ Producto eliminado'); await fetchProducts(); if (editingId === id) setEditingId(null); }
    } catch (_) { showToast('Error al eliminar'); }
  };

  // Toggle agotado/disponible rapido
  const toggleStatus = async (p: Product) => {
    const newStatus = p.status === 'Disponible' ? 'Agotado' : 'Disponible';
    try {
      const r = await fetch(`/api/products/${p.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...p, status: newStatus })
      });
      if (r.ok) {
        showToast(newStatus === 'Agotado' ? '🔴 Marcada como agotada' : '🟢 Marcada como disponible');
        await fetchProducts();
      }
    } catch (_) { showToast('Error al cambiar estado'); }
  };

  // Helper: convert image URL to same-origin blob URL via proxy (no CORS issues)
  const imageToBlobUrl = async (url: string): Promise<string> => {
    if (!url || url.startsWith('data:')) return url;
    try {
      const proxyUrl = '/api/image-proxy?url=' + encodeURIComponent(url);
      const res = await fetch(proxyUrl);
      if (!res.ok) return url;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch {
      return url;
    }
  };

  // Export helper: hide buttons + convert images to blob URLs for clean capture
  const captureCatalog = async (): Promise<HTMLCanvasElement | null> => {
    if (!catalogRef.current) return null;

    // 1. Hide all no-export elements on DOM
    const hiddenEls: { el: HTMLElement; orig: string }[] = [];
    catalogRef.current.querySelectorAll('.no-export').forEach(el => {
      const htmlEl = el as HTMLElement;
      hiddenEls.push({ el: htmlEl, orig: htmlEl.style.display });
      htmlEl.style.display = 'none';
    });

    // 2. Convert all external images to blob URLs (same-origin, no CORS needed)
    const imgs = catalogRef.current.querySelectorAll('img');
    const originalSrcs: { img: HTMLImageElement; orig: string; blobUrl?: string }[] = [];
    const blobPromises: Promise<void>[] = [];

    imgs.forEach(img => {
      const htmlImg = img as HTMLImageElement;
      const origSrc = htmlImg.src;
      const entry: { img: HTMLImageElement; orig: string; blobUrl?: string } = { img: htmlImg, orig: origSrc };
      originalSrcs.push(entry);

      if (origSrc && !origSrc.startsWith('data:')) {
        const p = imageToBlobUrl(origSrc).then(blobUrl => {
          if (blobUrl !== origSrc) {
            entry.blobUrl = blobUrl;
            htmlImg.src = blobUrl;
          }
        });
        blobPromises.push(p);
      }
    });

    // Wait for all images to be converted and repainted
    await Promise.all(blobPromises);
    await new Promise(r => setTimeout(r, 500));

    // 3. Capture (blob URLs are same-origin, so no CORS issues at all)
    const { default: html2canvas } = await import('html2canvas-pro' as any);
    const c = await html2canvas(catalogRef.current, {
      backgroundColor: '#000',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      imageTimeout: 15000,
    });

    // 4. Restore original srcs and free blob URLs
    originalSrcs.forEach(({ img, orig, blobUrl }) => {
      img.src = orig;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    });
    hiddenEls.forEach(({ el, orig }) => { el.style.display = orig; });

    return c;
  };

  const exportPNG = async () => {
    try {
      const c = await captureCatalog();
      if (!c) return;
      const a = document.createElement('a');
      a.download = 'HD-Vision-catalogo.png';
      a.href = c.toDataURL('image/png');
      a.click();
      showToast('PNG descargado');
    } catch (_) { showToast('Error al exportar PNG'); }
  };

  const exportPDF = async () => {
    try {
      const sel = getCatalogs().find(c => c.key === selectedKey);
      if (!sel) { showToast('No hay catálogo seleccionado'); return; }
      showToast('📄 Generando PDF completo...');

      // 1. Preload all images as blob URLs
      const allProducts = sel.sections.flatMap(s => s.products);
      const blobMap: Record<string, string> = {};
      await Promise.all(allProducts.map(async p => {
        if (!p.image_url || p.image_url.startsWith('data:')) return;
        try {
          const res = await fetch('/api/image-proxy?url=' + encodeURIComponent(p.image_url));
          if (res.ok) {
            const blob = await res.blob();
            blobMap[p.id] = URL.createObjectURL(blob);
          }
        } catch {}
      }));

      // 2. Build page data: each page = 4 products (2x2)
      type PageItem = { product: Product; blobUrl: string; sectionTitle: string };
      const pages: { items: PageItem[]; isFirst: boolean; sectionTitle: string }[] = [];
      let currentPage: PageItem[] = [];
      let currentSection = '';
      let firstPage = true;

      for (const section of sel.sections) {
        for (const p of section.products) {
          const blobUrl = blobMap[p.id] || p.image_url;
          if (currentPage.length === 4) {
            pages.push({ items: currentPage, isFirst: firstPage, sectionTitle: currentSection });
            firstPage = false;
            currentPage = [];
          }
          if (currentPage.length === 0) currentSection = section.title;
          currentPage.push({ product: p, blobUrl, sectionTitle: section.title });
        }
      }
      if (currentPage.length > 0) {
        pages.push({ items: currentPage, isFirst: firstPage, sectionTitle: currentSection });
      }

      // 3. Render each page as HTML, capture with html2canvas
      const { default: html2canvas } = await import('html2canvas-pro' as any);
      const { jsPDF } = await import('jspdf' as any);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;z-index:-1;background:#000;';
      document.body.appendChild(container);

      try {
        for (let pi = 0; pi < pages.length; pi++) {
          const page = pages[pi];
          const sectionChanged = page.items.some(i => i.sectionTitle !== page.sectionTitle);

          container.innerHTML = `
            <div style="width:794px;padding:30px 20px 20px;background:#000;color:#FFF;font-family:system-ui,sans-serif;box-sizing:border-box;">
              ${page.isFirst ? `
              <div style="text-align:center;margin-bottom:20px;">
                <h1 style="font-size:32px;font-weight:700;color:#D4AF37;margin:0;letter-spacing:2px;">H&D Vision</h1>
                <div style="width:120px;height:1px;background:linear-gradient(to right,transparent,#D4AF37,transparent);margin:8px auto;"></div>
                <p style="font-size:11px;color:#666;letter-spacing:3px;text-transform:uppercase;margin:0;">Catálogo Profesional</p>
                <p style="font-size:14px;color:#D4AF37;margin-top:10px;">${sel.label}</p>
              </div>` : ''}

              ${!page.isFirst && sectionChanged ? `
              <div style="text-align:center;margin-bottom:16px;">
                <p style="font-size:13px;color:#D4AF37;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${page.sectionTitle}</p>
                <div style="width:80px;height:1px;background:linear-gradient(to right,transparent,#D4AF37,transparent);margin:6px auto;"></div>
              </div>` : ''}

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                ${page.items.map(item => `
                <div style="border-radius:10px;overflow:hidden;border:1px solid #1A1A1A;background:#0A0A0A;">
                  <div style="aspect-ratio:1;overflow:hidden;background:#111;position:relative;">
                    <img src="${item.blobUrl}" style="width:100%;height:100%;object-fit:contain;display:block;" />
                    ${item.product.status === 'Agotado' ? `
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);pointer-events:none;">
                      <div style="transform:rotate(-30deg);padding:4px 18px;border-radius:5px;background:rgba(185,28,28,0.85);color:#FFF;font-weight:800;font-size:13px;letter-spacing:2px;text-transform:uppercase;border:2px solid rgba(255,255,255,0.3);">AGOTADO</div>
                    </div>` : ''}
                  </div>
                  <div style="padding:6px 8px;">
                    <p style="font-size:11px;font-weight:700;color:#FFF;margin:0;text-transform:capitalize;">
                      ${item.product.code ? '<span style=\"color:#D4AF37\">[' + item.product.code + ']</span> ' : ''}${item.product.description}
                    </p>
                    <p style="font-size:9px;color:#888;margin:2px 0 0;text-transform:capitalize;">${item.product.gender} · ${item.product.style}</p>
                  </div>
                </div>`).join('')}
              </div>

              <div style="text-align:center;margin-top:16px;padding-top:12px;border-top:1px solid #1A1A1A;">
                <p style="font-size:10px;color:#D4AF37;letter-spacing:2px;margin:0;">H&D Vision</p>
                <p style="font-size:8px;color:#555;margin:3px 0 0;">Catálogo de Gafas Profesional</p>
                <p style="font-size:7px;color:#333;margin:3px 0 0;">Página ${pi + 1} de ${pages.length}</p>
              </div>
            </div>`;

          // Wait for images to load
          const imgs = container.querySelectorAll('img');
          await Promise.all(Array.from(imgs).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(r => { img.onload = r; img.onerror = r; });
          }));
          await new Promise(r => setTimeout(r, 200));

          const canvas = await html2canvas(container, {
            backgroundColor: '#000', scale: 2, useCORS: true, allowTaint: true, logging: false, imageTimeout: 10000,
          });

          if (pi > 0) pdf.addPage();
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
        }

        pdf.save('HD-Vision-catalogo.pdf');
        showToast(`✅ PDF descargado (${pages.length} páginas)`);
      } finally {
        document.body.removeChild(container);
        Object.values(blobMap).forEach(u => URL.revokeObjectURL(u));
      }
    } catch (err: any) {
      console.error('PDF error:', err);
      showToast('Error al exportar PDF');
    }
  };

  const shareWhatsApp = () => {
    const catalogs = getCatalogs();
    const sel = catalogs.find(c => c.key === selectedKey);
    if (!sel) return;
    const baseUrl = window.location.origin + window.location.pathname;
    const shareLink = `${baseUrl}?share=true&catalog=${encodeURIComponent(sel.key)}`;
    const text = `👓 *H&D Vision*\n\n📊 *${sel.label}*\n\n👀 Mira nuestro catálogo completo aquí:\n${shareLink}\n\n${sel.sections.map(s => `─── ${s.title} (${s.products.length}) ───`).join('\n')}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    showToast('💬 Link enviado por WhatsApp');
  };

  const selectedCatalog = getCatalogs().find(c => c.key === selectedKey);

  // ========== RENDER ==========
  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#FFF', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(0,0,0,0.95)', borderBottom: '1px solid rgba(212,175,55,0.2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div style={{ maxWidth: '32rem', margin: '0 auto', padding: '0 1rem', height: '3.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {screen !== 'home' && !isReadOnly && (
              <button onClick={() => { setEditMode(false); setEditingId(null); setScreen(screen === 'detail' ? 'catalogs' : 'home'); }} style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: '#1A1A1A', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4AF37', fontSize: '1rem', cursor: 'pointer' }}>←</button>
            )}
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              <span style={{ color: '#D4AF37', textShadow: '0 0 10px rgba(212,175,55,0.5)' }}>H&amp;D</span>
              <span style={{ color: '#FFF', marginLeft: '0.25rem' }}>Vision</span>
            </span>
          </div>
          {/* Refresh button - hide in read-only mode */}
          {!isReadOnly && (
          <button onClick={forceUpdate} disabled={syncing} style={{ fontSize: '0.6rem', color: syncing ? '#D4AF37' : '#666', letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: '1px solid ' + (syncing ? '#D4AF37' : '#333'), borderRadius: '1rem', padding: '0.25rem 0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {syncing ? '⏳' : '🔄'} Actualizar App
          </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ width: '2.5rem', height: '2.5rem', border: '2px solid #D4AF37', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: '#D4AF37', fontSize: '0.8rem' }}>CARGANDO DESDE LA NUBE...</span>
          </div>
        ) : !isReadOnly && screen === 'home' ? (
          /* ===== HOME ===== */
          <div style={{ maxWidth: '32rem', margin: '0 auto', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 'calc(100vh - 3.5rem)', justifyContent: 'center', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '6rem', height: '6rem', borderRadius: '50%', background: 'linear-gradient(135deg, #D4AF37, #8B7023)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: '#000' }}>H&amp;D</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#D4AF37', textShadow: '0 0 10px rgba(212,175,55,0.5)', letterSpacing: '0.1em' }}>H&amp;D Vision</h2>
              <p style={{ fontSize: '0.7rem', color: '#666', letterSpacing: '0.3em', textTransform: 'uppercase' }}>Catálogo Profesional</p>
            </div>
            {products.length > 0 && (
              <div style={{ display: 'flex', gap: '1.5rem', textAlign: 'center' }}>
                <div><p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#D4AF37' }}>{products.length}</p><p style={{ fontSize: '0.65rem', color: '#666' }}>Productos</p></div>
                <div style={{ width: '1px', background: '#222' }} />
                <div><p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#D4AF37' }}>{getCatalogs().length}</p><p style={{ fontSize: '0.65rem', color: '#666' }}>Catálogos</p></div>
                <div style={{ width: '1px', background: '#222' }} />
                <div><p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#EF4444' }}>{products.filter(p => p.status === 'Agotado').length}</p><p style={{ fontSize: '0.65rem', color: '#666' }}>Agotados</p></div>
              </div>
            )}
            <div style={{ width: '100%', maxWidth: '20rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button onClick={() => { resetUpload(); setScreen('upload'); }} style={{ width: '100%', padding: '1rem', borderRadius: '1rem', background: 'linear-gradient(135deg, #D4AF37, #B8960F)', color: '#000', fontWeight: 600, fontSize: '0.9rem', border: 'none', cursor: 'pointer', letterSpacing: '0.05em', boxShadow: '0 8px 24px rgba(212,175,55,0.2)' }}>📷 Subir Imagen</button>
              <button onClick={() => { fetchProducts(true); }} style={{ width: '100%', padding: '0.75rem', borderRadius: '1rem', background: '#1A1A1A', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37', fontWeight: 500, fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '0.05em' }}>🔄 Actualizar desde la Nube</button>
              <button onClick={() => setScreen('catalogs')} style={{ width: '100%', padding: '1rem', borderRadius: '1rem', background: '#1A1A1A', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', letterSpacing: '0.05em' }}>📖 Ver Catálogos{getCatalogs().length > 0 && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', background: 'rgba(212,175,55,0.15)', padding: '0.2rem 0.5rem', borderRadius: '1rem' }}>{getCatalogs().length}</span>}</button>
            </div>
          </div>
        ) : !isReadOnly && screen === 'upload' ? (
          /* ===== UPLOAD ===== */
          <div style={{ maxWidth: '32rem', margin: '0 auto', padding: '1.5rem 1rem' }}>
            {step === 'pick' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', paddingTop: '2rem' }}>
                <h2 style={{ color: '#FFF', fontSize: '1.1rem' }}>Nueva Gafa</h2>
                <p style={{ color: '#888', fontSize: '0.8rem' }}>Selecciona una imagen de tu galería</p>
                <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
                <button onClick={() => fileRef.current?.click()} style={{ width: '100%', aspectRatio: '4/3', borderRadius: '1rem', border: '2px dashed #D4AF37', background: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', cursor: 'pointer', color: '#888' }}>
                  <span style={{ fontSize: '2.5rem' }}>🖼️</span>
                  <span style={{ fontSize: '0.85rem', color: '#FFF' }}>Seleccionar de Galería</span>
                  <span style={{ fontSize: '0.7rem' }}>JPG, PNG (max 10MB)</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {imgPreview && (
                  <div style={{ position: 'relative' }}>
                    <img src={imgPreview} alt="preview" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: '1rem', background: '#0A0A0A' }} />
                    <button onClick={resetUpload} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', width: '2rem', height: '2rem', borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: '1px solid #333', color: '#FFF', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                )}
                <h3 style={{ color: '#FFF' }}>Información del Producto</h3>

                {/* Description */}
                <div><label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Descripción *</label>
                <select value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: '#0A0A0A', border: '1px solid #333', color: '#FFF', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  <option value="">Seleccionar...</option>{DESCRIPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select></div>

                {/* Gender */}
                <div><label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Género *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.25rem' }}>
                  {GENDERS.map(g => <button key={g} onClick={() => setForm({ ...form, gender: g })} style={{ padding: '0.7rem', borderRadius: '0.75rem', border: '1px solid ' + (form.gender === g ? '#D4AF37' : '#333'), background: form.gender === g ? '#D4AF37' : '#0A0A0A', color: form.gender === g ? '#000' : '#FFF', fontWeight: 500, fontSize: '0.8rem', cursor: 'pointer' }}>{g}</button>)}
                </div></div>

                {/* Style */}
                <div><label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Estilo *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginTop: '0.25rem' }}>
                  {STYLES.map(s => <button key={s} onClick={() => setForm({ ...form, style: s })} style={{ padding: '0.5rem 0.25rem', borderRadius: '0.75rem', border: '1px solid ' + (form.style === s ? '#D4AF37' : '#333'), background: form.style === s ? '#D4AF37' : '#0A0A0A', color: form.style === s ? '#000' : '#FFF', fontWeight: 500, fontSize: '0.7rem', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</button>)}
                </div></div>

                {/* Status */}
                <div><label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Estado *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginTop: '0.25rem' }}>
                  {STATUSES.map(s => <button key={s} onClick={() => setForm({ ...form, status: s })} style={{ padding: '0.7rem', borderRadius: '0.75rem', border: form.status === s ? 'none' : '1px solid #333', background: form.status === s ? (s === 'Disponible' ? '#059669' : '#B91C1C') : '#0A0A0A', color: '#FFF', fontWeight: 500, fontSize: '0.8rem', cursor: 'pointer' }}>{s}</button>)}
                </div></div>

                {/* Code */}
                <div><label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Código <span style={{ color: '#444' }}>(opcional)</span></label>
                <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Ej: HD-001" style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: '#0A0A0A', border: '1px solid #333', color: '#FFF', fontSize: '0.85rem', marginTop: '0.25rem', boxSizing: 'border-box' }} /></div>

                <button onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: '1rem', borderRadius: '1rem', background: 'linear-gradient(135deg, #D4AF37, #B8960F)', color: '#000', fontWeight: 600, fontSize: '0.9rem', border: 'none', cursor: 'pointer', opacity: submitting ? 0.5 : 1, marginTop: '0.5rem' }}>
                  {submitting ? 'Guardando...' : '✓ Guardar Producto'}
                </button>
              </div>
            )}
          </div>
        ) : !isReadOnly && screen === 'catalogs' ? (
          /* ===== CATALOGS LIST ===== */
          <div style={{ maxWidth: '32rem', margin: '0 auto', padding: '1.5rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div><h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFF' }}>📖 Catálogos</h2>
              <p style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.25rem' }}>{getCatalogs().length} catálogo{getCatalogs().length !== 1 ? 's' : ''} generado{getCatalogs().length !== 1 ? 's' : ''}</p></div>
              <span style={{ fontSize: '0.7rem', color: '#D4AF37', background: 'rgba(212,175,55,0.1)', padding: '0.3rem 0.6rem', borderRadius: '1rem' }}>{products.length} productos</span>
            </div>
            {products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: '#555' }}>
                <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📦</p>
                <p style={{ fontWeight: 600, color: '#FFF' }}>Sin productos</p>
                <p style={{ fontSize: '0.8rem' }}>Sube tu primera gafa</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {getCatalogs().map(cat => {
                  const allProds = cat.sections.flatMap(s => s.products);
                  const totalProducts = allProds.length;
                  return (
                  <button key={cat.key} onClick={() => { setSelectedKey(cat.key); setEditMode(false); setScreen('detail'); }} style={{ width: '100%', padding: '1rem', borderRadius: '1rem', background: '#0A0A0A', border: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '0.75rem', overflow: 'hidden', background: '#111', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', flexShrink: 0 }}>
                      {allProds.slice(0, 4).map((p, i) => <div key={i} style={{ aspectRatio: '1', overflow: 'hidden', background: '#111', position: 'relative' }}>
                        <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {p.status === 'Agotado' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(185,28,28,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.4rem', color: '#FFF', fontWeight: 700 }}>AGOTADO</div>}
                      </div>)}
                      {Array.from({ length: Math.max(0, 4 - totalProducts) }).map((_, i) => <div key={`e${i}`} style={{ aspectRatio: '1', background: '#111' }} />)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '1rem', background: '#065F46', color: '#D1FAE5' }}>{cat.sections.length} {cat.sections.length === 1 ? 'sección' : 'secciones'}</span>
                        <span style={{ fontSize: '0.65rem', color: '#888' }}>{totalProducts} gafa{totalProducts > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <span style={{ color: '#555', fontSize: '1rem' }}>›</span>
                  </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : screen === 'detail' && selectedCatalog ? (
          /* ===== CATALOG DETAIL ===== */
          <div>
            {/* Toolbar */}
            <div style={{ position: 'sticky', top: '3.5rem', zIndex: 40, background: 'rgba(0,0,0,0.95)', borderBottom: '1px solid rgba(212,175,55,0.2)', padding: '0.6rem 1rem', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
              <div style={{ maxWidth: '32rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, marginRight: '0.5rem' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedCatalog.label}</p>
                  <p style={{ fontSize: '0.65rem', color: '#888' }}>{selectedCatalog.sections.reduce((sum, s) => sum + s.products.length, 0)} productos</p>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {!isReadOnly && <button onClick={() => setEditMode(!editMode)} style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: editMode ? '#D4AF37' : '#1A1A1A', border: editMode ? 'none' : '1px solid #333', color: editMode ? '#000' : '#D4AF37', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏️</button>}
                  {!isReadOnly && <button onClick={exportPNG} style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: '#1A1A1A', border: '1px solid #333', color: '#D4AF37', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🖼</button>}
                  {!isReadOnly && <button onClick={exportPDF} style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: '#1A1A1A', border: '1px solid #333', color: '#D4AF37', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📄</button>}
                  {!isReadOnly && <button onClick={shareWhatsApp} style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: '#059669', border: 'none', color: '#FFF', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>💬</button>}
                  {isReadOnly && <div style={{ fontSize: '0.55rem', color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>👁 Solo lectura</div>}
                </div>
              </div>
            </div>

            {/* Catalog content */}
            <div ref={catalogRef} style={{ background: '#000', padding: '1.5rem 1rem', paddingBottom: '5rem' }}>
              {/* Logo */}
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#D4AF37', textShadow: '0 0 15px rgba(212,175,55,0.4), 0 0 30px rgba(212,175,55,0.2)', letterSpacing: '0.15em' }}>H&amp;D Vision</h1>
                <div style={{ width: '6rem', height: '1px', background: 'linear-gradient(to right, transparent, #D4AF37, transparent)', margin: '0.5rem auto' }} />
                <p style={{ fontSize: '0.65rem', color: '#666', letterSpacing: '0.4em', textTransform: 'uppercase' }}>Catálogo Profesional</p>
                <p style={{ fontSize: '0.85rem', color: '#D4AF37', fontWeight: 500, marginTop: '0.75rem' }}>{selectedCatalog.label}</p>
              </div>

              {/* Sections with titles */}
              {selectedCatalog.sections.map((section, sIdx) => (
                <div key={section.title}>
                  {/* Section title */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: sIdx > 0 ? '2rem' : '0', marginBottom: '1rem' }}>
                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, rgba(212,175,55,0.4), transparent)' }} />
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#D4AF37', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', margin: 0 }}>{section.title}</h3>
                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, rgba(212,175,55,0.4), transparent)' }} />
                  </div>

                  {/* Product Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    {section.products.map(p => (
                  <div key={p.id} style={{ borderRadius: '1rem', overflow: 'hidden', border: '1px solid #1A1A1A', background: '#0A0A0A', position: 'relative' }}>
                    {/* Action buttons on each card - always visible */}
                    {editMode && (
                      <div className="no-export" style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', zIndex: 5, display: 'flex', gap: '0.25rem' }}>
                        <button onClick={() => startEdit(p)} style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: '#D4AF37', border: 'none', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>✏️</button>
                        <button onClick={() => deleteProduct(p.id)} style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: '#B91C1C', border: 'none', cursor: 'pointer', fontSize: '0.65rem', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>🗑️</button>
                      </div>
                    )}

                    {/* Image with watermark */}
                    <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#111', position: 'relative' }}>
                      <img src={p.image_url} alt={p.code || p.description} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      {/* AGOTADO watermark - visible in app AND exports */}
                      {p.status === 'Agotado' && (
                        <div style={{
                          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(0,0,0,0.5)', pointerEvents: 'none'
                        }}>
                          <div style={{
                            transform: 'rotate(-30deg)', padding: '0.4rem 1.5rem', borderRadius: '0.5rem',
                            background: 'rgba(185,28,28,0.85)', color: '#FFF', fontWeight: 800, fontSize: '0.85rem',
                            letterSpacing: '0.15em', textTransform: 'uppercase', border: '2px solid rgba(255,255,255,0.3)',
                            boxShadow: '0 2px 10px rgba(185,28,28,0.5)'
                          }}>AGOTADO</div>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ padding: '0.6rem' }}>
                      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#FFF', textTransform: 'capitalize' }}>
                        {p.code && <span style={{ color: '#D4AF37' }}>[{p.code}] </span>}{p.description}
                      </p>
                      <p style={{ fontSize: '0.6rem', color: '#888', marginTop: '0.15rem', textTransform: 'capitalize' }}>{p.gender} • {p.style}</p>
                    </div>

                    {/* Disponible / Agotado buttons - hidden in exports AND read-only mode */}
                    {!isReadOnly && (
                    <div className="no-export" style={{ display: 'flex', gap: '0.35rem', padding: '0 0.6rem 0.6rem' }}>
                      <button
                        onClick={() => { if (p.status !== 'Disponible') toggleStatus(p); }}
                        disabled={p.status === 'Disponible'}
                        style={{
                          flex: 1, padding: '0.45rem 0', borderRadius: '0.5rem', fontSize: '0.6rem', fontWeight: 700,
                          border: p.status === 'Disponible' ? 'none' : '1px solid #333',
                          background: p.status === 'Disponible' ? '#059669' : '#111',
                          color: '#FFF', cursor: p.status === 'Disponible' ? 'default' : 'pointer',
                          opacity: p.status === 'Disponible' ? 1 : 0.6,
                          letterSpacing: '0.05em'
                        }}
                      >✅ Disponible</button>
                      <button
                        onClick={() => { if (p.status !== 'Agotado') toggleStatus(p); }}
                        disabled={p.status === 'Agotado'}
                        style={{
                          flex: 1, padding: '0.45rem 0', borderRadius: '0.5rem', fontSize: '0.6rem', fontWeight: 700,
                          border: p.status === 'Agotado' ? 'none' : '1px solid #333',
                          background: p.status === 'Agotado' ? '#B91C1C' : '#111',
                          color: '#FFF', cursor: p.status === 'Agotado' ? 'default' : 'pointer',
                          opacity: p.status === 'Agotado' ? 1 : 0.6,
                          letterSpacing: '0.05em'
                        }}
                      >❌ Agotado</button>
                    </div>
                    )}
                  </div>
                ))}
              </div>
                </div>
              ))}

              {/* Footer */}
              <div style={{ textAlign: 'center', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #1A1A1A' }}>
                <p style={{ fontSize: '0.75rem', color: '#D4AF37', letterSpacing: '0.2em', textShadow: '0 0 10px rgba(212,175,55,0.3)' }}>H&amp;D Vision</p>
                <p style={{ fontSize: '0.6rem', color: '#555', marginTop: '0.25rem' }}>Catálogo de Gafas Profesional</p>
              </div>
            </div>

            {/* Floating buttons - hidden in read-only mode */}
            {!isReadOnly && (
            <div style={{ position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 30, display: 'flex', gap: '0.5rem' }}>
              <button onClick={exportPNG} style={{ padding: '0.7rem 1rem', borderRadius: '2rem', background: 'linear-gradient(135deg, #D4AF37, #B8960F)', color: '#000', fontWeight: 600, fontSize: '0.75rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(212,175,55,0.3)' }}>📥 PNG</button>
              <button onClick={exportPDF} style={{ padding: '0.7rem 1rem', borderRadius: '2rem', background: '#1A1A1A', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>📥 PDF</button>
              <button onClick={shareWhatsApp} style={{ padding: '0.7rem 1rem', borderRadius: '2rem', background: '#059669', color: '#FFF', fontWeight: 600, fontSize: '0.75rem', border: 'none', cursor: 'pointer' }}>💬 WhatsApp</button>
            </div>
            )}

            {/* Edit Modal - hidden in read-only mode */}
            {!isReadOnly && editingId && (
              <div onClick={() => setEditingId(null)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '32rem', background: '#0A0A0A', borderRadius: '1.5rem 1.5rem 0 0', padding: '1.5rem', maxHeight: '85vh', overflow: 'auto', borderTop: '1px solid rgba(212,175,55,0.2)' }}>
                  {/* Modal header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ color: '#FFF', fontSize: '1rem', fontWeight: 700 }}>✏️ Editar Producto</h3>
                    <button onClick={() => setEditingId(null)} style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: '#1A1A1A', border: '1px solid #333', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>

                  {/* Image preview */}
                  {editImgPreview && (
                    <div style={{ position: 'relative', marginBottom: '1rem' }}>
                      <img src={editImgPreview} alt="preview" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: '1rem', background: '#111' }} />
                      {editForm.status === 'Agotado' && (
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
                          <div style={{ transform: 'rotate(-30deg)', padding: '0.5rem 2rem', borderRadius: '0.5rem', background: 'rgba(185,28,28,0.85)', color: '#FFF', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.15em' }}>AGOTADO</div>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Description */}
                    <div><label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Descripción</label>
                    <select value={editForm.description || ''} onChange={e => setEditForm({ ...editForm, description: e.target.value })} style={{ width: '100%', padding: '0.7rem', borderRadius: '0.75rem', background: '#111', border: '1px solid #333', color: '#FFF', fontSize: '0.85rem', marginTop: '0.25rem' }}>{DESCRIPTIONS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>

                    {/* Gender */}
                    <div><label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Género</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginTop: '0.25rem' }}>{GENDERS.map(g => <button key={g} onClick={() => setEditForm({ ...editForm, gender: g })} style={{ padding: '0.6rem', borderRadius: '0.75rem', border: '1px solid ' + (editForm.gender === g ? '#D4AF37' : '#333'), background: editForm.gender === g ? '#D4AF37' : '#111', color: editForm.gender === g ? '#000' : '#FFF', fontSize: '0.8rem', cursor: 'pointer' }}>{g}</button>)}</div></div>

                    {/* Style */}
                    <div><label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Estilo</label>
                    <select value={editForm.style || ''} onChange={e => setEditForm({ ...editForm, style: e.target.value })} style={{ width: '100%', padding: '0.7rem', borderRadius: '0.75rem', background: '#111', border: '1px solid #333', color: '#FFF', fontSize: '0.85rem', marginTop: '0.25rem' }}>{STYLES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>

                    {/* Status */}
                    <div><label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Estado</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', marginTop: '0.25rem' }}>{STATUSES.map(s => <button key={s} onClick={() => setEditForm({ ...editForm, status: s })} style={{ padding: '0.6rem', borderRadius: '0.75rem', border: editForm.status === s ? 'none' : '1px solid #333', background: editForm.status === s ? (s === 'Disponible' ? '#059669' : '#B91C1C') : '#111', color: '#FFF', fontSize: '0.8rem', cursor: 'pointer' }}>{s}</button>)}</div></div>

                    {/* Code */}
                    <div><label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Código</label>
                    <input type="text" value={editForm.code || ''} onChange={e => setEditForm({ ...editForm, code: e.target.value })} style={{ width: '100%', padding: '0.7rem', borderRadius: '0.75rem', background: '#111', border: '1px solid #333', color: '#FFF', fontSize: '0.85rem', marginTop: '0.25rem', boxSizing: 'border-box' }} /></div>

                    {/* Save button */}
                    <button onClick={saveEdit} style={{ width: '100%', padding: '0.9rem', borderRadius: '1rem', background: 'linear-gradient(135deg, #D4AF37, #B8960F)', color: '#000', fontWeight: 600, fontSize: '0.9rem', border: 'none', cursor: 'pointer', marginTop: '0.5rem' }}>💾 Guardar Cambios</button>

                    {/* Delete button */}
                    <button onClick={() => { if (confirm('¿Eliminar este producto permanentemente?')) { deleteProduct(editingId); } }} style={{ width: '100%', padding: '0.7rem', borderRadius: '1rem', background: 'transparent', border: '1px solid #B91C1C', color: '#EF4444', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>🗑️ Eliminar Producto</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '4rem', left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: '#1A1A1A', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37', padding: '0.7rem 1.2rem', borderRadius: '2rem', fontSize: '0.8rem', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', animation: 'fadeIn 0.3s ease', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* Inline styles for animations */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        button { transition: opacity 0.15s; }
        button:active { opacity: 0.7; }
        select { appearance: auto; }
      `}</style>
    </div>
  );
}
