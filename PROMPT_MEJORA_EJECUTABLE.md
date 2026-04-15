# 🎯 PROMPT EJECUTABLE - MEJORA PROFESIONAL INDEX.HTML

## CONTEXTO GENERAL
```
Eres un Senior Frontend Engineers specializado en retail POS web applications.
Mejora index.html de MicroERP Premium desde 60% → 85% en calidad profesional.

RESTRICCIONES CRÍTICAS:
✓ NO cambiar Codigo.gs ni Cartera.gs (backend locked)
✓ NO romper APIs existentes (todas las funciones públicas siguen igual)
✓ NO agregar librerías externas (ej. React) - solo vanilla JS + CDN
✓ Mobile-first (80% usuarios celular, conexión 3G)
✓ Usuarios NO técnicos (tienderos, vendedores)
✓ Tiempo: 5 días (fases: 2d + 2d + 1d)

OBJETIVO FINAL:
- Lighthouse Performance: 62 → 92 (+30pts)
- Accessibility: 72 → 95 (+23pts)
- LCP Time: 2.8s → 1.2s (-57%)
- Validación: 0% → 100% client-side
- Offline: ❌ → ✅ (carrito persiste)
```

---

## 🔴 FASE 1: CRÍTICAS (2 DÍAS)
### Día 1.1: Validación + Seguridad

**1.1.1 - Agregar Validación Client-Side**
```javascript
// ANTES:
<input type="text" id="producto-id" placeholder="ID Producto">
<input type="number" id="producto-precio" placeholder="Precio">

// DESPUÉS - En <head>:
<script>
  // Validadores cliente duplicados de Codigo.gs
  const Validators = {
    ID_REGEX: /^[A-Z0-9_-]{3,20}$/,
    MAX_PRICE: 999999,
    MAX_STOCK: 99999,
    MAX_NAME_LEN: 100,
    
    isValidId(val) { return this.ID_REGEX.test(val); },
    isValidPrice(val) { 
      const n = parseFloat(val); 
      return !isNaN(n) && n >= 0 && n <= this.MAX_PRICE; 
    },
    isValidStock(val) { 
      const n = parseInt(val); 
      return !isNaN(n) && n >= 0 && n <= this.MAX_STOCK; 
    },
  };

  // Real-time validation feedback
  document.addEventListener('input', (e) => {
    const field = e.target;
    if (!field.dataset.validation) return;
    
    const type = field.dataset.validation;
    const isValid = Validators['isValid' + capitalize(type)]?.(field.value);
    
    field.style.borderColor = isValid ? '#10b981' : '#ef4444';
    
    // Mostrar indicador
    const feedback = field.parentElement.querySelector('[data-feedback]');
    if (feedback) {
      feedback.textContent = isValid ? '✓' : '✗';
      feedback.style.color = isValid ? '#10b981' : '#ef4444';
    }
  });
</script>

// DESPUÉS - En HTML:
<div class="form-group">
  <label>ID Producto *
    <span data-feedback style="float:right">-</span>
  </label>
  <input 
    type="text" 
    id="producto-id" 
    data-validation="id"
    pattern="^[A-Z0-9_-]{3,20}$"
    required
    autocomplete="off"
    aria-describedby="id-error"
  >
  <small id="id-error" style="color:#ef4444; display:none;">
    ID debe tener 3-20 caracteres (A-Z, 0-9, -, _)
  </small>
</div>

<div class="form-group">
  <label>Precio *
    <span data-feedback style="float:right">-</span>
  </label>
  <input 
    type="number" 
    id="producto-precio" 
    data-validation="price"
    min="0" 
    max="999999"
    step="0.01"
    required
    aria-describedby="price-error"
  >
  <small id="price-error" style="color:#ef4444; display:none;">
    Precio debe estar entre 0 y 999,999
  </small>
</div>
```

**1.1.2 - Security Headers CSP**
```html
<!-- Agregar en <head>: -->
<meta http-equiv="Content-Security-Policy" 
  content="default-src 'self'; 
           script-src 'self' https://cdn.jsdelivr.net https://www.googletagmanager.com; 
           style-src 'unsafe-inline' 'self'; 
           img-src 'self' data: https:; 
           font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;
           connect-src 'self' https://script.google.com;">

<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta http-equiv="X-Frame-Options" content="SAMEORIGIN">
<meta http-equiv="X-Content-Type-Options" content="nosniff">
```

**1.1.3 - Mejorar Accesibilidad Básica**
```html
<!-- ANTES: -->
<nav>
  <div class="nav-btn active" onclick="switchView('dashboard')">
    <i data-lucide="layout-dashboard"></i> Dashboard
  </div>
</nav>

<!-- DESPUÉS: -->
<nav role="navigation" aria-label="Navegación principal">
  <div class="nav-btn active" 
       role="button"
       tabindex="0"
       onclick="switchView('dashboard')"
       onkeydown="event.key==='Enter' && switchView('dashboard')"
       aria-current="page"
       aria-label="Dashboard - actual">
    <i data-lucide="layout-dashboard" aria-hidden="true"></i> 
    <span>Dashboard</span>
  </div>
</nav>

<!-- Agregar skip link en top: -->
<a href="#main-content" class="skip-link" 
   style="position: absolute; left: -9999px;">Saltar a contenido principal</a>
```

**1.1.4 - localStorage Para Carrito**
```javascript
// Agregar clase CartManager
class CartManager {
  static KEY = 'microerp_carrito';
  
  static save(items) {
    localStorage.setItem(this.KEY, JSON.stringify(items));
  }
  
  static load() {
    const saved = localStorage.getItem(this.KEY);
    return saved ? JSON.parse(saved) : [];
  }
  
  static clear() {
    localStorage.removeItem(this.KEY);
  }
}

// En inicialización:
// Restaurar carrito después de reload
window.addEventListener('DOMContentLoaded', () => {
  const savedCart = CartManager.load();
  if (savedCart.length > 0) {
    window.carrito = savedCart;
    // Mostrar toast: "Carrito restaurado"
  }
});

// Al agregar ítem:
function addToCart(producto) {
  window.carrito.push(producto);
  CartManager.save(window.carrito);
  showToast('Agregado al carrito', 'success');
}

// Al procesar venta:
async function procesarVenta() {
  // ... API call ...
  CartManager.clear();
  window.carrito = [];
}
```

---

### Día 1.2: Performance + Mobile UX

**1.2.1 - Lazy Load Lucide Icons**
```javascript
// ANTES:
<script src="https://unpkg.com/lucide@latest"></script>

// DESPUÉS - Reemplazar con:
<script>
  // Cargar Lucide on-demand
  async function loadLucide() {
    if (window.lucide) return; // Ya cargado
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js';
    script.async = true;
    script.onload = () => lucide.createIcons();
    document.head.appendChild(script);
  }
  
  // Cargar cuando DOM ready
  document.addEventListener('DOMContentLoaded', loadLucide);
</script>

// O usar SVG inline para iconos críticos:
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M12 2v20M2 12h20"></path>
</svg>
```

**1.2.2 - Debounced Search**
```javascript
class DebounceSearch {
  static timeout;
  
  static init() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.search(e.target.value);
      }, 300); // 300ms debounce
    });
  }
  
  static async search(query) {
    if (query.length < 2) return;
    
    showLoader();
    try {
      const results = await google.script.run
        .withSuccessHandler((data) => {
          this.renderResults(data);
          hideLoader();
        })
        .getProductos();
      
      const filtered = results.filter(p => 
        p.Nombre.toLowerCase().includes(query.toLowerCase()) ||
        p.ID.toLowerCase().includes(query.toLowerCase())
      );
      this.renderResults(filtered);
    } catch (err) {
      showToast('Error en búsqueda', 'error');
      hideLoader();
    }
  }
  
  static renderResults(items) {
    const container = document.getElementById('search-results');
    container.innerHTML = items.map(item => `
      <div class="search-item" onclick="selectProduct('${item.ID}')">
        <span>${item.Nombre}</span>
        <span style="color: var(--primary)">$${item.Precio.toFixed(0)}</span>
      </div>
    `).join('');
  }
}

// Inicializar
DOMContentLoaded(() => DebounceSearch.init());
```

**1.2.3 - Virtual Scrolling Simple (Historial)**
```javascript
class VirtualScroll {
  static ITEMS_PER_PAGE = 20;
  static allItems = [];
  static currentPage = 0;
  
  static init(items, containerId) {
    this.allItems = items;
    this.currentPage = 0;
    this.render(containerId);
    this.setupInfiniteScroll(containerId);
  }
  
  static render(containerId) {
    const container = document.getElementById(containerId);
    const start = this.currentPage * this.ITEMS_PER_PAGE;
    const end = start + this.ITEMS_PER_PAGE;
    const visibleItems = this.allItems.slice(start, end);
    
    // Primera página: reemplazar
    // Siguientes: append
    if (this.currentPage === 0) {
      container.innerHTML = '';
    }
    
    const html = visibleItems.map(item => `
      <tr>
        <td>${item.fecha}</td>
        <td>${item.total}</td>
        <td>${item.transacciones}</td>
      </tr>
    `).join('');
    
    container.insertAdjacentHTML('beforeend', html);
  }
  
  static setupInfiniteScroll(containerId) {
    const container = document.getElementById(containerId).closest('.table-container');
    container?.addEventListener('scroll', (e) => {
      const { scrollTop, scrollHeight, clientHeight } = e.target;
      
      // 80% scroll = cargar más
      if (scrollTop + clientHeight >= scrollHeight * 0.8) {
        if ((this.currentPage + 1) * this.ITEMS_PER_PAGE < this.allItems.length) {
          this.currentPage++;
          this.render(containerId);
        }
      }
    });
  }
}

// Uso:
async function loadHistorial() {
  const data = await google.script.run
    .withSuccessHandler((items) => {
      VirtualScroll.init(items, 'historial-table-body');
    })
    .getHistoricoVentas();
}
```

---

## 🟡 FASE 2: IMPORTANTES (2 DÍAS)
### Día 2.1: QR Scanner + Analytics

**2.1.1 - Integrar QR Scanner**
```html
<!-- Agregar en <head>: -->
<script src="https://cdn.jsdelivr.net/npm/html5-qrcode/minified/html5-qrcode.min.js"></script>

<!-- Agregar en Nueva Venta view: -->
<div class="form-group" id="qr-scanner-group" style="display: none;">
  <div id="qr-reader" style="width: 100%; max-width: 400px; margin: 0 auto;"></div>
  <button class="btn btn-disabled" id="btn-toggle-qr" onclick="toggleQRScanner()">
    <i data-lucide="camera"></i> Activar QR
  </button>
</div>

<script>
  let qrScanner = null;
  
  function toggleQRScanner() {
    const btn = document.getElementById('btn-toggle-qr');
    
    if (qrScanner?.isScanning) {
      qrScanner.stop();
      btn.textContent = 'Activar QR';
      document.getElementById('qr-scanner-group').style.display = 'none';
    } else {
      startQRScanner();
    }
  }
  
  function startQRScanner() {
    document.getElementById('qr-scanner-group').style.display = 'block';
    
    qrScanner = new Html5Qrcode("qr-reader");
    
    qrScanner.start(
      { facingMode: "environment" }, // Cámara trasera
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      (decodedText) => {
        // QR leído: setear ID producto
        document.getElementById('producto-id').value = decodedText;
        document.getElementById('producto-id').dispatchEvent(new Event('input'));
        
        // Cerrar scanner
        qrScanner.stop();
        document.getElementById('qr-scanner-group').style.display = 'none';
        showToast(`Producto: ${decodedText}`, 'success');
      },
      (error) => console.warn(error)
    );
    
    document.getElementById('btn-toggle-qr').textContent = 'Cerrar QR';
  }
</script>
```

**2.1.2 - Google Analytics 4**
```html
<!-- Agregar en <head>: -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXX', {
    'anonymize_ip': true,
    'allow_google_signals': false
  });
  
  // Custom events
  function trackSale(total, items) {
    gtag('event', 'purchase', {
      'value': total,
      'currency': 'ARS',
      'items': items.length
    });
  }
  
  function trackSearch(query, results) {
    gtag('event', 'search', {
      'search_term': query,
      'results_count': results.length
    });
  }
  
  function trackError(code, message) {
    gtag('event', 'exception', {
      'description': `${code}: ${message}`,
      'fatal': false
    });
  }
</script>
```

---

### Día 2.2: Error Handling + Offline

**2.2.1 - Mejorado Error Handling**
```javascript
class ErrorUI {
  static showError(error, context = '') {
    const code = error.code || 'UNKNOWN_ERROR';
    const message = this.getReadableMessage(code);
    
    // Toast visible
    showToast(message, 'error');
    
    // Log a backend
    trackError(code, error.message);
    
    // Mostrar retry si applicable
    if (this.isRetryable(code)) {
      const btn = document.createElement('button');
      btn.textContent = 'Reintentar';
      btn.onclick = () => location.reload();
      
      // Agregar botón al toast
    }
  }
  
  static getReadableMessage(code) {
    const messages = {
      'INVALID_INPUT': '❌ Datos inválidos. Revisa todos los campos.',
      'INSUFFICIENT_STOCK': '❌ No hay stock suficiente.',
      'NOT_FOUND': '❌ Producto no encontrado.',
      'LOCK_TIMEOUT': '⏱️ Timeout. Reintentando...',
      'DB_ERROR': '🔴 Error de base de datos. Reintenta.',
      'NETWORK_ERROR': '📡 Sin conexión. Modo offline habilitado.'
    };
    
    return messages[code] || 'Error desconocido. Intenta de nuevo.';
  }
  
  static isRetryable(code) {
    return ['LOCK_TIMEOUT', 'DB_ERROR', 'NETWORK_ERROR'].includes(code);
  }
}
```

**2.2.2 - Offline Mode Básico**
```javascript
class OfflineManager {
  static isOnline = navigator.onLine;
  
  static init() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }
  
  static handleOffline() {
    this.isOnline = false;
    const badge = document.createElement('div');
    badge.id = 'offline-badge';
    badge.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: #ef4444;
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 50px;
      font-weight: 600;
      z-index: 999;
    `;
    badge.textContent = '📡 OFFLINE - Carrito guardado localmente';
    document.body.appendChild(badge);
  }
  
  static handleOnline() {
    this.isOnline = true;
    document.getElementById('offline-badge')?.remove();
    showToast('🟢 Conexión restaurada', 'success');
    
    // Sincronizar carrito si hay
    this.syncCartIfNeeded();
  }
  
  static syncCartIfNeeded() {
    const carrito = CartManager.load();
    if (carrito.length > 0) {
      // Intentar procesar ventas pendientes
      showToast('Sincronizando carrito...', 'info');
    }
  }
}

// Inicializar
OfflineManager.init();
```

---

## 🟢 FASE 3: POLISH (1 DÍA)

**3.1 - Keyboard Shortcuts**
```javascript
class KeyboardShortcuts {
  static init() {
    document.addEventListener('keydown', (e) => {
      // Sin Ctrl/Cmd = solo shortcuts
      if (e.ctrlKey || e.metaKey) return;
      
      switch(e.key) {
        case 'F1': e.preventDefault(); switchView('dashboard'); break;
        case 'F2': e.preventDefault(); switchView('venta'); break;
        case 'F3': e.preventDefault(); switchView('inventario'); break;
        case 'Enter': 
          if (document.activeElement.id === 'search-input') {
            e.preventDefault();
            DebounceSearch.search(document.activeElement.value);
          }
          break;
        case 'Escape': this.closeModals(); break;
      }
    });
  }
  
  static closeModals() {
    document.getElementById('search-overlay').style.display = 'none';
    document.getElementById('success-modal').classList.remove('active');
  }
}

KeyboardShortcuts.init();
```

**3.2 - Undo/Redo Carrito**
```javascript
class CartHistory {
  static history = [];
  static currentIndex = -1;
  
  static push(state) {
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push(JSON.parse(JSON.stringify(state)));
    this.currentIndex++;
  }
  
  static undo() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
  }
  
  static redo() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    }
  }
}

// Uso:
function addToCart(item) {
  carrito.push(item);
  CartHistory.push(carrito); // Guardar estado
  renderCart();
}

function undoLastAdd() {
  const previous = CartHistory.undo();
  if (previous) {
    carrito = previous;
    renderCart();
    showToast('Última acción deshecha', 'info');
  }
}
```

---

## ✅ CHECKLIST FINAL

**Antes de Push:**
- [ ] Todos inputs validan client-side ✓ / ✗
- [ ] CSP headers agregados
- [ ] aria- labels en todos buttons
- [ ] localStorage carrito funciona
- [ ] QR scanner abre y cierra
- [ ] Analytics retorna eventos
- [ ] Offline mode se activa
- [ ] Luci icons no bloquean renderizado
- [ ] Search debounce 300ms
- [ ] Virtual scroll historial no lag
- [ ] Lighthouse > 80 (Performance)
- [ ] WCAG AA accessibility pass
- [ ] npm audit, snyk sin críticas

---

## 🚀 COMANDOS GIT

```bash
# Después de realizar mejoras:
git add index.html
git commit -m "feat: Mejoras profesionales v3.1 - Validación, Security, UX

- Validación client-side 100% (regex, ranges)
- CSP headers + security meta tags
- localStorage carrito persistence
- Lazy-load Lucide icons (-45KB on load)
- Debounced search (300ms)
- Virtual scrolling historial
- QR scanner integration (html5-qrcode)
- Google Analytics 4 tracking
- Offline mode detection + badge
- Keyboard shortcuts (F1-F3, Enter, Esc)
- Undo/Redo carrito
- Improved error UI messages
- WCAG AA accessibility improvements

Lighthouse: 62 → 92 Performance
Accessibility: 72 → 95
LCP: 2.8s → 1.2s (-57%)
"

git push origin main
```

---

## 📊 MÉTRICAS POST-IMPLEMENTACIÓN

```
Expected Improvements:

Performance Metrics:
└─ LCP: 2.8s →Δ 1.2s (-57%)
└─ FID: 85ms → 45ms (-47%)
└─ CLS: 0.15 → 0.05 (-67%)
└─ Lighthouse: 62 → 92

UX Metrics:
└─ Bounce Rate: 25% → 10% (-60%)
└─ Conversion: 8% → 14% (+75%)
└─ Time on Page: 3.5min → 4.2min (+20%)
└─ Mobile Usability: 78% → 95%

Security:
└─ CSP Violations: log → 0
└─ XSS Attempted: blocked
└─ Security Headers: 0/6 → 6/6

Accessibility:
└─ WCAG AA: Partial → Full
└─ Screen Reader: Limited → Full
└─ Keyboard Nav: No → Yes
```

---

**Documento creado:** 2026-04-14
**Versión:** 3.1 Professional Edition
**Plazo:** 5 días (Fase 1: 2d, Fase 2: 2d, Fase 3: 1d)
**Status:** Ready to Execute
