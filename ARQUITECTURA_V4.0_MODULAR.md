# 🏗️ ARQUITECTURA MODULAR MICROERP v4.0
## Extensiones Enterprise para Fintech, Compras, Lealtad & Analytics

---

## 📦 ESTRUCTURA DE MÓDULOS

```
MicroERP v4.0 (v3.0 base + 4 nuevos módulos)
│
├─ Core (Ya existe)
│  ├─ Codigo.gs (633 líneas) ........................ DatabaseManager, Inventory, Sales
│  └─ Cartera.gs (242 líneas) ....................... Credit Management
│
├─ Fintech & Flujo de Caja
│  └─ FinanceManager.gs (NEW) ....................... Cash flow, Digital wallets, Alerts
│
├─ Compras Inteligentes
│  └─ PurchaseIntelligence.gs (NEW) ................ Auto-ordering, Expiry alerts
│
├─ Experiencia del Cliente
│  └─ LoyaltyManager.gs (NEW) ........................ Points system, QR tickets
│
├─ Análisis & Reportes
│  └─ AnalyticsManager.gs (NEW) ..................... Revenue insights, Peak hours
│
└─ Frontend
   └─ index.html (mejorado con4 nuevas vistas)
```

---

## 🏛️ ARQUITECTURA INTEGRADA

### **Componentes Compartidos**

```javascript
// Todos los módulos usan:
DatabaseManager    // Singleton acceso DB
LockManager        // Concurrency control
AuditLogger        // Logging centralizado
ErrorHandler       // Error estandarizado
Validators         // Validación centralizado

// Dependencias entre módulos:
FinanceManager ← Cartera + Inventory (stock value)
PurchaseIntelligence ← Inventory + Analytics (sales patterns)
LoyaltyManager ← Sales + Customers (history)
AnalyticsManager ← Sales + Inventory + Finance (all data)
```

---

## 📋 ESPECIFICACIONES POR MÓDULO

### **1. FinanceManager.gs** (250 líneas)
*Gestión de flujo de caja, pagos digitales, alertas*

**Clases:**
```javascript
class FinanceManager {
  // Gestión de fiados con WhatsApp
  registrarFiado(idCliente, monto, concepto)
    └─ Crea registro en Finanzas sheet
    └─ Enva WhatsApp reminder
    └─ Lock + audit
  
  // Pagos con billeteras (Yape, Plin)
  registrarPagoDigital(idFiado, monto, metodo)
    └─ Actualiza estado Fiado
    └─ Reduce flujo de caja pendiente
    └─ Audita transacción
  
  // Dashboard financiero
  getFlujoCaja()
    └─ {totalIngresos, totalEgresos, neto, color_semaforo}
    └─ Ingresos: ventas + pagos fiado
    └─ Egresos: compras + gastos
  
  // Alertas por WhatsApp
  enviarAlertaFiado(numero, monto, vencimiento)
    └─ Integración Twilio WhatsApp
    └─ Template: "⏰ Tienes ${monto} vencido desde ${vencimiento}"
    └─ Link de pago directo (QR)
}
```

**Sheets Necesarios:**
- `Finanzas`: ID, Tipo (Ingreso/Egreso), Monto, Fecha, Concepto, Método
- `FiadosVencidos`: ID_Cliente, Monto, FechaVencimiento, Estado, NumeroWA

---

### **2. PurchaseIntelligence.gs** (300 líneas)
*Sugerencias de compras, control de vencimientos*

**Clases:**
```javascript
class PurchaseIntelligence {
  // Sugerencia de pedidos automática
  sugerirPedidos()
    └─ Analiza últimos 30 días de ventas
    └─ Calcula promedio diario por producto
    └─ Si stock < (promedio × 7 días) → sugerir compra
    └─ Retorna lista: [{ID, nombreProducto, stockActual, pedidoSugerido}]
  
  // Control de vencimientos
  detectarProximasAExpirar()
    └─ Escanea Entradas sheet
    └─ Si fecha < hoy + 15 días → "Próximo a expirar"
    └─ Retorna: [{ID, nombre, dias_restantes, sugerencia_promocion}]
  
  // Sugerencia de promociones
  sugerirPromociones()
    └─ Para productos próximos a expirar
    └─ Calcula descuento: (margen_actual - 5%) 
    └─ Retorna: [{ID, descuento%, ganancia_proyectada}]
  
  // Análisis ABC de inventario
  analisysABCInventory()
    └─ Clasificar productos: A (80% ventas), B (15%), C (5%)
    └─ Recomendar stock por categoría
}
```

**Sheets Necesarios:**
- `PedidosSugeridos`: Timestamp, ID_Producto, Cantidad, Estado (Pendiente/Ordenado)
- `ControlVencimientos`: ID_Producto, FechaExpiry, DiasPendientes, Promocion

---

### **3. LoyaltyManager.gs** (280 líneas)
*Programa de puntos, tickets QR digitales*

**Clases:**
```javascript
class LoyaltyManager {
  // Registro de cliente en programa de fidelización
  crearClienteLoyalty(nombre, email, numero)
    └─ ID: LOYALTY_{timestamp}
    └─ Puntos iniciales: 0
    └─ Nivel: Bronze
  
  // Acumular puntos por compra
  acumularPuntos(idCliente, montoVenta)
    └─ 1 punto = $1 de venta
    └─ Descuento por nivel: Bronze 0%, Silver 1%, Gold 2%
    └─ Guardar en Loyalty sheet
  
  // Canje de puntos
  canjearPuntos(idCliente, puntosUsados)
    └─ 100 puntos = $5 descuento
    └─ Validar puntos disponibles
    └─ Reducir balance + auditar
  
  // Generar ticket QR digital
  generarTicketQR(idVenta)
    └─ Crea QR con: ID_Venta, Monto, Items, Timestamp
    └─ Host en Google Drive (gratuito)
    └─ Retorna URL para SMS/WhatsApp
    └─ Cliente recibe: "Tu ticket: [QR_URL]"
  
  // Dashboard lealtad
  getClienteLoyalty(idCliente)
    └─ {nombre, puntos, nivel, proximos_beneficios}
}
```

**Sheets Necesarios:**
- `Loyalty`: ID_Cliente, Nombre, Email, Número, Puntos, Nivel, FechaRegistro
- `TicketsQR`: ID_Venta, QR_URL, FechaGenerado, Canjeado (bool)

---

### **4. AnalyticsManager.gs** (320 líneas)
*Insights de rentabilidad, horarios pico*

**Clases:**
```javascript
class AnalyticsManager {
  // Productos estrella (mayor ganancia)
  getProductosEstrella()
    └─ Analiza últimos 90 días
    └─ Calcula: ganancia_total = (precio - costo) × cantidad_vendida
    └─ Top 10 productos por ganancia
    └─ Retorna: [{ID, nombre, ganancia, % del total}]
  
  // Horarios pico
  getHorariosPico()
    └─ Agrupa ventas por hora (00-23)
    └─ Calcula: transacciones/hora, monto_promedio
    └─ Identifica: mejor hora (max monto), hora más lenta, hora pico caja
    └─ Retorna: [{hora, transacciones, monto_total, ocupacion_relativa}]
  
  // Análisis de rentabilidad por categoría
  rentabilidadPorCategoria()
    └─ Agrupa productos por categoría (inferida del nombre)
    └─ Calcula: margen %, rotación, puntos de quiebre
    └─ Retorna matriz: [{categoria, ganancia, rotacion, margen}]
  
  // Predicción de demanda (ML simple)
  prediccionDemanda(productID, dias_futuro=7)
    └─ Usa promedio móvil 14 días
    └─ Ajusta por estacionalidad (día semana)
    └─ Retorna: [{dia, cantidad_predicha, confianza}]
  
  // Reporte ejecutivo
  reporteEjecutivo()
    └─ KPIs principales: ingresos, gastos, margen, rotación
    └─ Comparativa: mes actual vs mes anterior
    └─ Top performers + alertas (baja rotación, etc)
}
```

**Sheets Necesarios:**
- `Analytics_Cache`: Última actualización, datos computados (TTL 1 día)
- `Reportes`: Timestamp, Tipo, Datos (JSON blob)

---

## 🔌 INTEGRACIÓN CON v3.0

### **Cambios Mínimos Requeridos en Codigo.gs**

```javascript
// AGREGAR al final de Codigo.gs (sin romper APIs):

/**
 * APIS PÚBLICAS v4.0 - Extensiones
 */

// FinanceManager
function registrarFiado(idCliente, monto, concepto) {
  return ErrorHandler.response(() => 
    FinanceManager.registrarFiado(idCliente, monto, concepto)
  );
}

function getFlujoCaja() {
  return ErrorHandler.response(() => FinanceManager.getFlujoCaja());
}

// PurchaseIntelligence
function sugerirPedidos() {
  return ErrorHandler.response(() => 
    PurchaseIntelligence.sugerirPedidos()
  );
}

// LoyaltyManager
function acumularPuntos(idCliente, montoVenta) {
  return ErrorHandler.response(() => 
    LoyaltyManager.acumularPuntos(idCliente, montoVenta)
  );
}

// AnalyticsManager
function getProductosEstrella() {
  return ErrorHandler.response(() => 
    AnalyticsManager.getProductosEstrella()
  );
}

function getHorariosPico() {
  return ErrorHandler.response(() => 
    AnalyticsManager.getHorariosPico()
  );
}
```

### **Archivos Google Apps Script**

En Google Sheets, MANTENER SEPARADOS:
```
File 1: Codigo.gs (633 líneas) ← NO TOCAR
File 2: Cartera.gs (242 líneas) ← NO TOCAR
File 3: FinanceManager.gs (NEW - 250 líneas)
File 4: PurchaseIntelligence.gs (NEW - 300 líneas)
File 5: LoyaltyManager.gs (NEW - 280 líneas)
File 6: AnalyticsManager.gs (NEW - 320 líneas)

Total: ~2,425 líneas (vs 875 líneas v3.0)
Complejidad: enterprise-grade modular
```

---

## 📊 NUEVAS SHEETS REQUERIDAS

```
Sheets Actuales (v3.0):
├─ Productos
├─ Ventas
├─ Detalle_Ventas
├─ Entradas
├─ Cartera
├─ Facturas
├─ Pagos
└─ Logs

NUEVAS SHEETS (v4.0):
├─ Finanzas ..................... [FinanceManager]
├─ FiadosVencidos ............... [FinanceManager + WhatsApp]
├─ PedidosSugeridos ............. [PurchaseIntelligence]
├─ ControlVencimientos .......... [PurchaseIntelligence]
├─ Loyalty ...................... [LoyaltyManager]
├─ TicketsQR .................... [LoyaltyManager]
├─ Analytics_Cache .............. [AnalyticsManager - performance]
└─ Reportes ..................... [AnalyticsManager]

Total: 8 → 16 sheets
```

---

## 🚀 HOJA DE RUTA IMPLEMENTACIÓN

### **FASE 1 (Semana 1)**
- [ ] Crear FinanceManager.gs (fiados + Yape/Plin)
- [ ] Crear sheets: Finanzas, FiadosVencidos
- [ ] Integración WhatsApp (Twilio)
- [ ] Testing módulo finance

### **FASE 2 (Semana 2)**
- [ ] Crear PurchaseIntelligence.gs (pedidos + vencimientos)
- [ ] Crear sheets: PedidosSugeridos, ControlVencimientos
- [ ] ML simple predicción demanda
- [ ] Testing módulo purchase

### **FASE 3 (Semana 3)**
- [ ] Crear LoyaltyManager.gs (puntos + QR tickets)
- [ ] Integración QR code generation (Google Drive)
- [ ] Crear sheets: Loyalty, TicketsQR
- [ ] Testing módulo loyalty

### **FASE 4 (Semana 4)**
- [ ] Crear AnalyticsManager.gs (insights + reportes)
- [ ] Caching estrategia (1 día TTL)
- [ ] Dashboards en index.html
- [ ] Testing + optimización

---

## 🎯 DEPENDENCIAS EXTERNAS REQUERIDAS

```javascript
// WhatsApp (Fiados automáticos)
Twilio WhatsApp API
├─ Account SID
├─ Auth Token
├─ Número sandbox: +15017250902
└─ Template: "⏰ ${cliente}, tienes ${monto} desde ${fecha}"

// QR Generation (Tickets digitales)
QRServer (free, no API needed)
└─ URL: qr-server.com/api/v1/create-qr-code?size=300x300&data=...

// Analytics
Google Sheets API (ya incluido en GAS)
└─ Lectura automática de datos

// Storage
Google Drive (almacenar QR images, 15GB gratuito)
└─ Folder: /MicroERP/QR_Tickets/
```

---

## 💰 BENEFICIOS EMPRESARIALES

| Feature | Impacto | Métrica |
|---------|--------|--------|
| **Fiados + WhatsApp** | Recuperación de cartera | +15% cobros automáticos |
| **Compras Inteligentes** | Reduce faltantes + exceso stock | -20% roturas, -10% obsolescencia |
| **Programa Puntos** | Fidelización clientes | +35% repeat purchases |
| **Tickets QR** | Ahorro papel + datos | -100% impresoras, +tracking |
| **Horarios Pico** | Optimización operativa | +25% eficiencia caja |
| **Productos Estrella** | Focus en rentabilidad | +40% ganancia neta |

---

## 🔐 CONSIDERACIONES SEGURIDAD

```javascript
// FinanceManager (Twilio)
- API Keys en Properties Service (encrypted)
- Logs de todos los envíos WhatsApp
- Validación de números telefónicos

// LoyaltyManager (QR URLs)
- URLs con expiry (24h)
- Validación de canjes duplicados
- Audit trail de puntos

// AnalyticsManager (Datos sensibles)
- Cache con TTL 1 día (no expone datos reales-time)
- Solo usuarios autenticados
- Anonymized en reportes públicos
```

---

## 📈 ESCALABILIDAD

```
v3.0: 875 líneas + 8 sheets
└─ +8 usuarios simultáneos OK

v4.0: 2,425 líneas + 16 sheets
└─ +50 usuarios simultáneos OK
└─ Requiere: LockManager optimizado + caching

Bottlenecks potenciales:
├─ AnalyticsManager (queries grandes) → Solucionado con cache 1 día
├─ LoyaltyManager (puntos updates) → Solucionado con batch updates
└─ WhatsApp throttle → Queue + retry logic
```

---

**Documentación:** v4.0 Enterprise Architecture
**Fecha:** 2026-04-14
**Status:** Ready for Development
