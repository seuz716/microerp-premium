# 📈 Plan de Mejoras - MicroERP Premium v2.1+

## 🎯 Prioridad Alta

### 1. Completar Módulo de Cartera (Cartera.gs)
**Estado**: Archivo vacío  
**Impacto**: Alto - Funcionalidad crítica para empresas B2B  
**Esfuerzo**: 2-3 días

**Funciones Necesarias**:
```javascript
function crearClienteCredito(nombre, limite_credito)
function registrarFactura(id_cliente, items, fecha_vencimiento)
function registrarPago(id_factura, monto)
function getCarteraPorCobrar() // Dashboard
function getClientes()
function updateClienteCredito(id, limite_actualizado)
```

**Impacto Negocio**: Permite dar crédito a clientes, fundamental para mayoristas.

---

### 2. Tests Automatizados
**Estado**: No existen  
**Impacto**: Medio - Calidad y confiabilidad  
**Esfuerzo**: 3-4 días

**Implementar**:
- Jest + Google Apps Script testing framework
- Cobertura mínima 70% en funciones críticas
- Tests de: `procesarVenta()`, `saveProducto()`, locks

**Archivo Sugerido**: `Codigo.test.gs`

---

### 3. API Documentation (OpenAPI/Swagger)
**Estado**: No existe  
**Impacto**: Medio - Integraciones futuras  
**Esfuerzo**: 1 día

**Crear**: `API_DOCS.md` o `openapi.yaml`
- Todos los endpoints documentados
- Ejemplos de request/response
- Error codes detallados

---

## 🎯 Prioridad Media

### 4. Rate Limiting & Throttling
**Estado**: No implementado  
**Impacto**: Seguridad  
**Esfuerzo**: 1-2 días

**Implementar**:
```javascript
const rateLimitMap = {}; // { userId: {count, timestamp} }
function checkRateLimit(userId, limit = 100, window = 60000) {
  // Max 100 requests per minute per user
}
```

**Protege contra**: Scraping, fuerza bruta, DoS

---

### 5. Logging & Audit Trail Persistente
**Estado**: Solo Logger.log() básico  
**Impacto**: Crítico para auditoría  
**Esfuerzo**: 2 días

**Opciones**:
- Google Sheets como tabla de logs
- Firebase Realtime Database (recomendado)
- Google Cloud Logging

**Qué Loguear**:
- Todas las transacciones (login, venta, cambio de producto)
- Cambios de stock
- Errores del sistema
- Acceso de usuarios

---

### 6. Control de Acceso por Rol (RBAC)
**Estado**: Sin autenticación  
**Impacto**: Alto - Empresas medianas  
**Esfuerzo**: 3 días

**Roles Propuestos**:
```
- ADMIN: Acceso total, auditoría, usuarios
- GERENTE: Ventas, inventario, reportes
- VENDEDOR: Solo ventas y consulta de stock
- VIEWER: Solo lectura de reportes
```

**Implementar**:
- función `getCurrentUser()` con roles
- Decoradores de autorización en endpoints
- UI condicional por rol

---

## 🎯 Prioridad Baja (Nice-to-Have)

### 7. Historial con Filtros Avanzados
**Estado**: Constante HISTORY_PAGINATION existe pero no se usa  
**Impacto**: Funcionalidad  
**Esfuerzo**: 2 días

**Agregar Filters**:
- Por fecha (rango)
- Por producto
- Por vendedor (si existe RBAC)
- Por monto (min-max)

---

### 8. Reportes Exportables (PDF/Excel)
**Estado**: No existe  
**Impacto**: Funcionalidad  
**Esfuerzo**: 2-3 días

**Reportes**:
- Reporte de Ventas por Período
- Inventario Actual
- Top 10 Productos
- Análisis de Rotación de Stock

**Lib Sugerida**: `Apps Script PDF Lib` o Google Sheets export nativo

---

### 9. Sincronización con Google Drive / Cloud Storage
**Estado**: Solo Google Sheets  
**Impacto**: Bajo  
**Esfuerzo**: 2 días

- Backup automático de datos
- Exportación programada a CSV
- Integración con Google Drive File Picker

---

### 10. Webhooks para Integraciones Externas
**Estado**: No existe  
**Impacto**: Bajo-Medio  
**Esfuerzo**: 3 días

**Casos de Uso**:
- Notificar a Slack cuando stock < porcentaje
- Enviar email de confirmación de venta
- Sincronizar con facturación externa
- Integración con WhatsApp Business API

---

## 🔧 Mejoras de Código

### 11. Refatorización de Variables Globales
**Problema**: `let DB_ID = null` es global

**Solución**:
```javascript
class DatabaseManager {
  static instance;
  constructor() {
    this.DB_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
  }
  static getInstance() {
    return this.instance ||= new DatabaseManager();
  }
}
```

---

### 12. Validación de Datos Mejorada
**Agregar Validadores**:
```javascript
const VALIDATORS = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  phone: (v) => /^\+?[\d\s\-()]{7,20}$/.test(v),
  currency: (v) => v >= 0 && v <= 999999999,
  dateRange: (start, end) => start < end,
};
```

---

### 13. Versionado de API
**Agregar Header de Versión**:
```javascript
function doGet(e) {
  const apiVersion = "2.0";
  // Retornar versión en respuesta
}
```

---

### 14. Error Codes Estandarizados
**Implementar**:
```javascript
const ERROR_CODES = {
  SHEET_NOT_FOUND: { code: 'SNF', http: 404 },
  INSUFFICIENT_STOCK: { code: 'ISK', http: 400 },
  SYSTEM_LOCK_TIMEOUT: { code: 'SLT', http: 503 },
  INVALID_INPUT: { code: 'INV', http: 400 },
};
```

---

### 15. Caché de Productos
**Problema**: `getProductos()` lee toda la hoja cada vez

**Solución**:
```javascript
class ProductCache {
  constructor() {
    this.cache = null;
    this.lastUpdate = 0;
    this.TTL = 60000; // 1 minuto
  }
  
  getProductos() {
    if (Date.now() - this.lastUpdate > this.TTL) {
      this.cache = // leer de sheet
      this.lastUpdate = Date.now();
    }
    return this.cache;
  }
}
```

---

## 📊 Comparativa: Antes vs Después

| Aspecto | Antes (v2.0) | Después (v2.1) | Impacto |
|---------|--------------|----------------|---------|
| Funciones | 6 | 15+ | +150% |
| Tests | 0% | 70%+ | ✅ |
| Seguridad | Básica | RBAC + Audit | ⬆️ |
| Documentación | README | README + API | ⬆️ |
| Performance | Bueno | Mejor (cache) | ⬆️ |
| Escalabilidad | 50-100 usuarios | 1000+ usuarios | ⬆️ |

---

## 🚀 Timeline Sugerido

```
Week 1: Cartera + Tests (Prioridad Alta)
Week 2: API Docs + Rate Limiting (Prioridad Media)
Week 3: RBAC + Audit Logging (Prioridad Media)
Week 4: Reportes + Integración (Prioridad Baja)
Week 5: QA + Performance Testing
```

---

## 💰 Estimación de Esfuerzo

| Componente | Horas | Personas | Semanas |
|-----------|-------|----------|---------|
| Cartera Module | 20 | 1 | 1 |
| Tests | 24 | 1 | 1 |
| RBAC | 20 | 1 | 1 |
| Audit/Logging | 16 | 1 | 1 |
| Reportes | 16 | 1 | 1 |
| QA & Testing | 24 | 2 | 1 |
| **TOTAL** | **120** | **~2** | **~6-8** |

---

## ✅ Checklist de Implementación

- [ ] Crear branch `feature/cartera-module`
- [ ] Implementar funciones de Cartera
- [ ] Crear tests para Cartera
- [ ] Revisar cobertura de código
- [ ] Documentar API de Cartera
- [ ] Deploy a staging
- [ ] QA testing
- [ ] Merge a main
- [ ] Tag v2.1.0
- [ ] Release notes

---

**Versión del Plan**: 1.0  
**Última Actualización**: 14 de abril de 2026  
**Autor**: Auditoría Automática - GitHub Copilot
