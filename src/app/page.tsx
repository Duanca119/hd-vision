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

interface CatalogGroup {
  key: string;
  label: string;
  products: Product[];
}

// ========== CONSTANTS ==========
const GENDERS = ['Hombre', 'Mujer', 'Niño'];
const STYLES = ['Redonda', 'Cuadrada', 'Aviador', 'Rectangular', 'Cat-Eye', 'Ovalada', 'Wayfarer', 'Clubmaster', 'Media Luna', 'Otro'];
const DESCRIPTIONS = ['Acetato', 'Acerada', 'Tres Piezas', 'Titanio', 'Aluminio', 'Mixta', 'Inyección'];
const STATUSES = ['Disponible', 'Agotado'];

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
  const catalogRef = useRef<HTMLDivElement>(null);

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

  // Auto-refresh: poll every 3 seconds when not on upload screen
  useEffect(() => {
    if (screen === 'upload') return;
    const interval = setInterval(() => { fetchProducts(); }, 3000);
    return () => clearInterval(interval);
  }, [screen, fetchProducts]);

  // Register SW
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // Catalog grouping
  const getCatalogs = (): CatalogGroup[] => {
    const map: Record<string, CatalogGroup> = {};
    for (const p of products) {
      const k = `${p.gender}|${p.description}|${p.style}|${p.status}`;
      if (!map[k]) {
        map[k] = { key: k, label: `${p.gender} - ${p.description} - ${p.style} - ${p.status}`, products: [] };
      }
      map[k].products.push(p);
    }
    return Object.values(map).sort((a, b) => b.products.length - a.products.length);
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
      const fd = new FormData(); fd.append('file', imgFile);
      const ur = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!ur.ok) throw new Error('upload');
      const { url } = await ur.json();
      const pr = await fetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: url, description: form.description, gender: form.gender, style: form.style, status: form.status, code: form.code })
      });
      if (!pr.ok) throw new Error('create');
      showToast('¡Producto guardado!');
      await fetchProducts();
      resetUpload(); setScreen('catalogs');
    } catch (_) { showToast('Error al guardar'); }
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

  // Export
  const exportPNG = async () => {
    if (!catalogRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas-pro' as any);
      const c = await html2canvas(catalogRef.current, { backgroundColor: '#000', scale: 2 });
      const a = document.createElement('a');
      a.download = 'HD-Vision-catalogo.png';
      a.href = c.toDataURL('image/png');
      a.click();
      showToast('PNG descargado');
    } catch (_) { showToast('Error al exportar PNG'); }
  };

  const exportPDF = async () => {
    if (!catalogRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas-pro' as any);
      const { jsPDF } = await import('jspdf' as any);
      const c = await html2canvas(catalogRef.current, { backgroundColor: '#000', scale: 2 });
      const img = c.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const w = 210; const h = (c.height * w) / c.width;
      pdf.addImage(img, 'PNG', 0, 0, w, h);
      pdf.save('HD-Vision-catalogo.pdf');
      showToast('PDF descargado');
    } catch (_) { showToast('Error al exportar PDF'); }
  };

  const shareWhatsApp = () => {
    const catalogs = getCatalogs();
    const sel = catalogs.find(c => c.key === selectedKey);
    if (!sel) return;
    const text = `👓 *H&D Vision*\n\n📊 ${sel.label}\n\n${sel.products.map(p => `• ${p.code ? '[' + p.code + '] ' : ''}${p.description} - ${p.gender} - ${p.style} (${p.status})`).join('\n')}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const selectedCatalog = getCatalogs().find(c => c.key === selectedKey);

  // ========== RENDER ==========
  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#FFF', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(0,0,0,0.95)', borderBottom: '1px solid rgba(212,175,55,0.2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div style={{ maxWidth: '32rem', margin: '0 auto', padding: '0 1rem', height: '3.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {screen !== 'home' && (
              <button onClick={() => { setEditMode(false); setEditingId(null); setScreen(screen === 'detail' ? 'catalogs' : 'home'); }} style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: '#1A1A1A', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4AF37', fontSize: '1rem', cursor: 'pointer' }}>←</button>
            )}
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              <span style={{ color: '#D4AF37', textShadow: '0 0 10px rgba(212,175,55,0.5)' }}>H&amp;D</span>
              <span style={{ color: '#FFF', marginLeft: '0.25rem' }}>Vision</span>
            </span>
          </div>
          {/* Refresh button - always visible */}
          <button onClick={syncFromCloud} disabled={syncing} style={{ fontSize: '0.6rem', color: syncing ? '#D4AF37' : '#666', letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: '1px solid ' + (syncing ? '#D4AF37' : '#333'), borderRadius: '1rem', padding: '0.25rem 0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {syncing ? '⏳' : '🔄'} {lastRefresh || 'Actualizar'}
          </button>
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ width: '2.5rem', height: '2.5rem', border: '2px solid #D4AF37', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: '#D4AF37', fontSize: '0.8rem' }}>CARGANDO DESDE LA NUBE...</span>
          </div>
        ) : screen === 'home' ? (
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
        ) : screen === 'upload' ? (
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
        ) : screen === 'catalogs' ? (
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
                {getCatalogs().map(cat => (
                  <button key={cat.key} onClick={() => { setSelectedKey(cat.key); setEditMode(false); setScreen('detail'); }} style={{ width: '100%', padding: '1rem', borderRadius: '1rem', background: '#0A0A0A', border: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '0.75rem', overflow: 'hidden', background: '#111', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', flexShrink: 0 }}>
                      {cat.products.slice(0, 4).map((p, i) => <div key={i} style={{ aspectRatio: '1', overflow: 'hidden', background: '#111', position: 'relative' }}>
                        <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {p.status === 'Agotado' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(185,28,28,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.4rem', color: '#FFF', fontWeight: 700 }}>AGOTADO</div>}
                      </div>)}
                      {Array.from({ length: Math.max(0, 4 - cat.products.length) }).map((_, i) => <div key={`e${i}`} style={{ aspectRatio: '1', background: '#111' }} />)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '1rem', background: cat.products[0]?.status === 'Disponible' ? '#065F46' : '#7F1D1D', color: '#D1FAE5' }}>{cat.products[0]?.status}</span>
                        <span style={{ fontSize: '0.65rem', color: '#888' }}>{cat.products.length} gafa{cat.products.length > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <span style={{ color: '#555', fontSize: '1rem' }}>›</span>
                  </button>
                ))}
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
                  <p style={{ fontSize: '0.65rem', color: '#888' }}>{selectedCatalog.products.length} productos</p>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => setEditMode(!editMode)} style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: editMode ? '#D4AF37' : '#1A1A1A', border: editMode ? 'none' : '1px solid #333', color: editMode ? '#000' : '#D4AF37', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏️</button>
                  <button onClick={exportPNG} style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: '#1A1A1A', border: '1px solid #333', color: '#D4AF37', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🖼</button>
                  <button onClick={exportPDF} style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: '#1A1A1A', border: '1px solid #333', color: '#D4AF37', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📄</button>
                  <button onClick={shareWhatsApp} style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: '#059669', border: 'none', color: '#FFF', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>💬</button>
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

              {/* Product Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                {selectedCatalog.products.map(p => (
                  <div key={p.id} style={{ borderRadius: '1rem', overflow: 'hidden', border: '1px solid #1A1A1A', background: '#0A0A0A', position: 'relative' }}>
                    {/* Action buttons on each card - always visible */}
                    {editMode && (
                      <div style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', zIndex: 5, display: 'flex', gap: '0.25rem' }}>
                        <button onClick={() => startEdit(p)} style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: '#D4AF37', border: 'none', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>✏️</button>
                        <button onClick={() => deleteProduct(p.id)} style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: '#B91C1C', border: 'none', cursor: 'pointer', fontSize: '0.65rem', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>🗑️</button>
                      </div>
                    )}

                    {/* Image with watermark */}
                    <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#111', position: 'relative' }}>
                      <img src={p.image_url} alt={p.code || p.description} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: p.status === 'Agotado' ? 'grayscale(60%)' : 'none' }} />
                      {/* AGOTADO watermark */}
                      {p.status === 'Agotado' && (
                        <div style={{
                          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(0,0,0,0.45)', pointerEvents: 'none'
                        }}>
                          <div style={{
                            transform: 'rotate(-30deg)', padding: '0.4rem 1.5rem', borderRadius: '0.5rem',
                            background: 'rgba(185,28,28,0.85)', color: '#FFF', fontWeight: 800, fontSize: '0.85rem',
                            letterSpacing: '0.15em', textTransform: 'uppercase', border: '2px solid rgba(255,255,255,0.3)',
                            boxShadow: '0 2px 10px rgba(185,28,28,0.5)'
                          }}>AGOTADO</div>
                        </div>
                      )}
                      {/* Quick agotado toggle button */}
                      <button onClick={() => toggleStatus(p)} style={{
                        position: 'absolute', bottom: '0.4rem', left: '0.4rem', zIndex: 3,
                        padding: '0.25rem 0.5rem', borderRadius: '0.5rem', fontSize: '0.55rem', fontWeight: 700,
                        border: 'none', cursor: 'pointer', letterSpacing: '0.05em',
                        background: p.status === 'Agotado' ? 'rgba(5,150,105,0.9)' : 'rgba(185,28,28,0.85)',
                        color: '#FFF', display: 'flex', alignItems: 'center', gap: '0.25rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                      }}>
                        {p.status === 'Agotado' ? '🟢 DISPONIBLE' : '🔴 AGOTADO'}
                      </button>
                    </div>

                    {/* Info */}
                    <div style={{ padding: '0.6rem' }}>
                      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: p.status === 'Agotado' ? '#888' : '#FFF', textTransform: 'capitalize', textDecoration: p.status === 'Agotado' ? 'line-through' : 'none' }}>
                        {p.code && <span style={{ color: '#D4AF37' }}>[{p.code}] </span>}{p.description}
                      </p>
                      <p style={{ fontSize: '0.6rem', color: '#888', marginTop: '0.15rem', textTransform: 'capitalize' }}>{p.gender} • {p.style}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ textAlign: 'center', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #1A1A1A' }}>
                <p style={{ fontSize: '0.75rem', color: '#D4AF37', letterSpacing: '0.2em', textShadow: '0 0 10px rgba(212,175,55,0.3)' }}>H&amp;D Vision</p>
                <p style={{ fontSize: '0.6rem', color: '#555', marginTop: '0.25rem' }}>Catálogo de Gafas Profesional</p>
              </div>
            </div>

            {/* Floating buttons */}
            <div style={{ position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 30, display: 'flex', gap: '0.5rem' }}>
              <button onClick={exportPNG} style={{ padding: '0.7rem 1rem', borderRadius: '2rem', background: 'linear-gradient(135deg, #D4AF37, #B8960F)', color: '#000', fontWeight: 600, fontSize: '0.75rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(212,175,55,0.3)' }}>📥 PNG</button>
              <button onClick={exportPDF} style={{ padding: '0.7rem 1rem', borderRadius: '2rem', background: '#1A1A1A', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>📥 PDF</button>
              <button onClick={shareWhatsApp} style={{ padding: '0.7rem 1rem', borderRadius: '2rem', background: '#059669', color: '#FFF', fontWeight: 600, fontSize: '0.75rem', border: 'none', cursor: 'pointer' }}>💬 WhatsApp</button>
            </div>

            {/* Edit Modal - Full product editor */}
            {editingId && (
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
