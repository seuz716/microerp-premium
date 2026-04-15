# 🔗 GUÍA DE INTEGRACIÓN - v4.0 Modular Enterprise

## 📝 Cómo Agregar los 4 Módulos a tu MicroERP

---

## ✅ PASO 1: En Google Apps Script

En tu Google Sheet, ve a **Extensions > Apps Script** y:

### Estructura de Archivos (Después de agregar módulos):

```
MicroERP v4.0 Project
├─ Codigo.gs (633 líneas) ..................... MANTENER SIN CAMBIOS ✓
├─ Cartera.gs (242 líneas) ................... MANTENER SIN CAMBIOS ✓
├─ FinanceManager.gs (NEW) ................... Copiar archivo completo
├─ PurchaseIntelligence.gs (NEW) ............ Copiar archivo completo
├─ LoyaltyManager.gs (NEW) ................... Copiar archivo completo
└─ AnalyticsManager.gs (NEW) ................. Copiar archivo completo

TOTAL: 6 archivos, ~2,425 líneas de código
```

---

## 📋 PASO 2: Crear Sheets Necesarios

### Nuevas Sheets a Crear en Google Sheets:

```
SHEET NAME              MÓDULO              DESCRIPCIÓN
─────────────────────────────────────────────────────────
Finanzas                [FinanceManager]    Movimientos financieros diarios
FiadosVencidos          [FinanceManager]    Fiados y recuperación de cartera
PedidosSugeridos        [PurchaseIntelligence] Sugerencias de compra automáticas
ControlVencimientos     [PurchaseIntelligence] Alertas de vencimientos
Loyalty                 [LoyaltyManager]    Clientes del programa de puntos
TicketsQR               [LoyaltyManager]    Tickets digitales QR
Analytics_Cache         [AnalyticsManager]  Cache 24h de análisis
Reportes                [AnalyticsManager]  Histórico de reportes ejecutivos
```

**🎯 IMPORTANTE:** Las sheets se crean automáticamente cuando llamas a los `setup()` functions.

---

## 🚀 PASO 3: Inicializar Módulos (Primera Ejecución)

En el editor Apps Script, copia y ejecuta ONCE:

```javascript
// Ejecutar UNA VEZ en console
setupFinanceManager();
setupPurchaseIntelligence();
setupLoyaltyManager();
setupAnalyticsManager();
```

O crea un script de inicialización:

```javascript
function inicializarV4() {
  Logger.log('🚀 Inicializando MicroERP v4.0...');
  
  try {
    setupFinanceManager();
    setupPurchaseIntelligence();
    setupLoyaltyManager();
    setupAnalyticsManager();
    
    Logger.log('✅ v4.0 inicializado! Sheets creadas:');
    Logger.log('- Finanzas');
    Logger.log('- FiadosVencidos');
    Logger.log('- PedidosSugeridos');
    Logger.log('- ControlVencimientos');
    Logger.log('- Loyalty');
    Logger.log('- TicketsQR');
    Logger.log('- Analytics_Cache');
    Logger.log('- Reportes');
    Logger.log('🎉 Listo! Los 4 módulos están activos');
  } catch (err) {
    Logger.log('❌ Error: ' + err.message);
  }
}
```

---

## 🔌 PASO 4: Configurar APIs Externas (Opcional)

### **WhatsApp Fiados (Twilio)**

1. Crear cuenta en https://www.twilio.com
2. Obtener `ACCOUNT_SID` y `AUTH_TOKEN`
3. En Apps Script, guardar en PropertiesService:

```javascript
function guardarTwilioCredentials() {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  scriptProperties.setProperty('TWILIO_ACCOUNT_SID', 'tu_account_sid_aqui');
  scriptProperties.setProperty('TWILIO_AUTH_TOKEN', 'tu_auth_token_aqui');
  scriptProperties.setProperty('TWILIO_NUMERO_SANDBOX', '+15017250902');
  
  Logger.log('✅ Credentials Twilio guardadas');
}
```

Luego, actualizar en `FinanceManager.gs`:

```javascript
static getTwilioCredentials() {
  const props = PropertiesService.getScriptProperties();
  return {
    accountSid: props.getProperty('TWILIO_ACCOUNT_SID'),
    authToken: props.getProperty('TWILIO_AUTH_TOKEN'),
    numeroSandbox: props.getProperty('TWILIO_NUMERO_SANDBOX')
  };
}
```

### **Google Analytics 4 (En index.html)**

```html
<!-- Agregar en <head> de index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXX');
  
  // Custom event: Venta realizada
  function trackVenta(monto, items) {
    gtag('event', 'purchase', {
      'value': monto,
      'currency': 'PEN',
      'items': items
    });
  }
</script>
```

---

## 🎨 PASO 5: Actualizar Frontend (index.html)

### Agregar Vistas Nuevas en Navigation:

```html
<!-- Agregar al sidebar nav: -->
<div class="nav-btn" onclick="switchView('finanzas')">
  <i data-lucide="trending-up"></i> Finanzas
</div>

<div class="nav-btn" onclick="switchView('compras')">
  <i data-lucide="package-check"></i> Compras Inteligentes
</div>

<div class="nav-btn" onclick="switchView('loyalty')">
  <i data-lucide="gift"></i> Lealtad
</div>

<div class="nav-btn" onclick="switchView('analytics')">
  <i data-lucide="bar-chart-3"></i> Reportes
</div>

<!-- Mobile nav: -->
<div class="mobile-nav-btn" id="m-btn-finanzas" onclick="switchView('finanzas')">
  <i data-lucide="trending-up"></i>
  <span>Finanzas</span>
</div>
<!-- ... etc -->
```

### Agregar Secciones en main-content:

```html
<!-- VISTA FINANZAS -->
<section id="view-finanzas" class="view">
  <h1>Flujo de Caja</h1>
  <div class="stats-grid">
    <div class="card stat-card">
      <div class="label">Ingresos (30 días)</div>
      <div class="value" id="finanzas-ingresos">$0</div>
    </div>
    <div class="card stat-card">
      <div class="label">Egresos</div>
      <div class="value" id="finanzas-egresos">$0</div>
    </div>
    <div class="card stat-card">
      <div class="label">Neto</div>
      <div class="value" id="finanzas-neto" style="color: var(--primary)">$0</div>
    </div>
  </div>
  <div id="semaforo" style="text-align: center; font-size: 3rem;"></div>
  <div class="card">
    <h3>Fiados Próximos a Vencer</h3>
    <div id="fiados-list"></div>
  </div>
</section>

<!-- VISTA COMPRAS -->
<section id="view-compras" class="view">
  <h1>Compras Inteligentes</h1>
  <div class="card">
    <h3>Sugerencias de Pedidos</h3>
    <div id="pedidos-sugeridos"></div>
  </div>
  <div class="card">
    <h3>Productos Próximos a Expirar</h3>
    <div id="vencimientos-alerta"></div>
  </div>
</section>

<!-- VISTA LOYALTY -->
<section id="view-loyalty" class="view">
  <h1>Programa de Lealtad</h1>
  <div class="card">
    <h3>Top Clientes</h3>
    <div id="loyalty-ranking"></div>
  </div>
</section>

<!-- VISTA ANALYTICS -->
<section id="view-analytics" class="view">
  <h1>Reportes y Análisis</h1>
  <div class="card">
    <h3>Productos Estrella</h3>
    <div id="analytics-stars"></div>
  </div>
  <div class="card">
    <h3>Horarios Pico</h3>
    <div id="analytics-hours"></div>
  </div>
</section>
```

### JavaScript para Cargar Datos:

```javascript
// En index.html, agregar función de load:
async function loadFinanzas() {
  const flujo = await google.script.run
    .withSuccessHandler((data) => {
      document.getElementById('finanzas-ingresos').textContent = '$' + data.totalIngresos.toFixed(0);
      document.getElementById('finanzas-egresos').textContent = '$' + data.totalEgresos.toFixed(0);
      document.getElementById('finanzas-neto').textContent = '$' + data.neto.toFixed(0);
      
      // Semáforo
      const emoji = {
        'verde': '🟢',
        'amarillo': '🟡',
        'rojo': '🔴'
      };
      document.getElementById('semaforo').textContent = emoji[data.semaforo];
    })
    .getFlujoCaja(30);
}

async function loadCompras() {
  const sugerencias = await google.script.run
    .withSuccessHandler((data) => {
      const html = data.sugerencias.map(s => `
        <div class="card" style="margin-bottom: 1rem;">
          <strong>${s.nombre}</strong>: Sugerir comprar <strong>${s.cantidadSugerida}</strong> unidades
          <span style="color: var(--${s.urgencia === 'CRÍTICA' ? 'danger' : 'warning'});">${s.urgencia}</span>
        </div>
      `).join('');
      document.getElementById('pedidos-sugeridos').innerHTML = html;
    })
    .sugerirPedidos();
}

async function loadLoyalty() {
  const ranking = await google.script.run
    .withSuccessHandler((data) => {
      const html = data.ranking.map(c => `
        <div style="display: flex; justify-content: space-between; padding: 0.5rem;">
          <span>#${c.posicion} ${c.nombre}</span>
          <span>${c.puntos} ptosł ${c.nivel}</span>
        </div>
      `).join('');
      document.getElementById('loyalty-ranking').innerHTML = html;
    })
    .getRankingClientesTop(10);
}

async function loadAnalytics() {
  const stars = await google.script.run
    .withSuccessHandler((data) => {
      const html = data.productos.map(p => `
        <div style="margin-bottom: 1rem;">
          <div><strong>${p.nombre}</strong> - Ganancia: $${p.gananciaNeta}</div>
          <progress value="${p.porcentajeDelTotal}" max="100"></progress>
        </div>
      `).join('');
      document.getElementById('analytics-stars').innerHTML = html;
    })
    .getProductosEstrella(10);
}
```

---

## 📊 PASO 6: Usar en Procesos Existentes

### En VENTA (integrar Loyalty):

```javascript
async function procesarVenta() {
  // ... código existente ...
  
  const resultado = await google.script.run
    .withSuccessHandler((data) => {
      // Acumular puntos si cliente en loyalty
      if (data.idCliente) {
        google.script.run.acumularPuntos(data.idCliente, data.total);
      }
      
      // Generar ticket QR
      google.script.run.generarTicketQR(data.idVenta, {
        monto: data.total,
        items: data.items
      });
      
      // Track analytics
      gtag('event', 'purchase', { 'value': data.total });
      
      showToast('Venta registrada + puntos acumulados', 'success');
    })
    .procesarVenta(carrito);
}
```

### En INVENTARIO (integrar Compras Inteligentes):

```javascript
async function cargarInventario() {
  const productos = await google.script.run
    .withSuccessHandler((data) => {
      renderProductos(data);
      
      // Mostrar alertas de compras sugeridas
      google.script.run.sugerirPedidos();
      google.script.run.detectarProximasAExpirar();
    })
    .getProductos();
}
```

---

## 🧪 PASO 7: Testing

### Test FinanceManager:

```javascript
// En console Apps Script
google.script.run.registrarMovimiento('Ingreso', 10000, 'Test venta', 'Efectivo');
google.script.run.getFlujoCaja(30);
```

### Test LoyaltyManager:

```javascript
google.script.run.crearClienteLoyalty('Juan Pérez', 'juan@example.com', '987654321');
google.script.run.acumularPuntos('LOYALTY_xxx', 5000);
google.script.run.getRankingClientesTop(10);
```

### Test AnalyticsManager:

```javascript
google.script.run.getProductosEstrella(10);
google.script.run.getHorariosPico();
google.script.run.reporteEjecutivo(30);
```

---

## 🔄 PASO 8: FlowControl & Triggers (Automático)

### Setup Triggers para Alerts Automáticos:

```javascript
function crearTriggers() {
  // Verificar vencimientos diariamente
  ScriptApp.newTrigger('alertarVencimientos')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();
  
  // Sugerir pedidos cada 3 días
  ScriptApp.newTrigger('sugerirCompras')
    .timeBased()
    .atHour(8)
    .everyDays(3)
    .create();
    
  // Generar reporte ejecutivo cada 7 días
  ScriptApp.newTrigger('generarReporte')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(7)
    .create();
}

// Funciones que se ejecutan automáticamente:
function alertarVencimientos() {
  const proximasExpirar = detectarProximasAExpirar();
  // Enviar email o WhatsApp con alertas
  if (proximasExpirar.cantidadAlerta > 0) {
    Logger.log('⚠️ ' + proximasExpirar.cantidadAlerta + ' productos próximos a expirar');
  }
}

function sugerirCompras() {
  const sugerencias = sugerirPedidos();
  Logger.log('📦 ' + sugerencias.cantidad_sugerencias + ' sugerencias de compra');
}

function generarReporte() {
  const reporte = reporteEjecutivo(7);
  // Guardar o enviar por email
  Logger.log('📊 Reporte ejecutivo generado');
}
```

---

## 🛡️ PASO 9: Configuración de Seguridad

### Permisos y Roles:

```javascript
// Aún disponible solo para dueño/gerente
function verificarPermiso() {
  const user = Session.getActiveUser().getEmail();
  const permittedUsers = ['admin@mitienda.com', 'gerente@mitienda.com'];
  
  if (!permittedUsers.includes(user)) {
    throw new AppError('PERMISSION_DENIED', 'No tienes acceso');
  }
}
```

---

## 📋 CHECKLIST DE INTEGRACIÓN

- [ ] Archivos .gs copiados (4 módulos)
- [ ] Sheets creadas (8 nuevas)
- [ ] `inicializarV4()` ejecutada UNA VEZ
- [ ] APIs externas configuradas (WhatsApp si aplica)
- [ ] Frontend actualizado (vistas + botones nav)
- [ ] JavaScript de carga implementado
- [ ] Triggers automáticos creados
- [ ] Testing completado (mínimo 1 caso por módulo)
- [ ] Permisos configurados
- [ ] Documentación actualizada
- [ ] Git commit: "feat: v4.0 Modular - Finanzas + Compras + Loyalty + Analytics"

---

## 🚀 RESULT ESPERADO

Después de integración:

```
MicroERP v4.0 Capabilities:
✅ Gestión de fiados con WhatsApp automático
✅ Sugerencias de compra basadas en ventas
✅ Alertas de vencimientos
✅ Programa de puntos + Tickets QR
✅ Análisis de rentabilidad por producto
✅ Horarios pico identificados
✅ Reporte ejecutivo automático
✅ Dashboard de flujo de caja (semáforo)

Total: 6 archivos, 2,425 líneas, 16 sheets, 28 APIs públicas
Comparable a: SAP, Odoo, Toast (ERP retail profesional)
```

---

**Guía Integración:** v4.0 Enterprise Modular
**Creado:** 2026-04-14
**Status:** Ready to Deploy
