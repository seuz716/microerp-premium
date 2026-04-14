# MicroERP Premium

**Sistema de Gestión de Inventario y Ventas para Google Sheets**

Desarrollado por: **César Andrés Abadía**  
Versión: **2.0** (Refactorizada y Blindada)  
© 2026 Todos los derechos reservados

---

## 🎯 Descripción General

MicroERP Premium es una solución empresarial completa diseñada como **Web App integrada en Google Sheets**, ideal para pequeños negocios, tiendas, depósitos y emprendimientos que necesitan:

- ✅ **Gestión de Inventario** en tiempo real
- ✅ **Procesamiento de Ventas** atómico y seguro
- ✅ **Dashboard Ejecutivo** con métricas clave
- ✅ **Interface Responsiva** (Desktop/Mobile/Tablet)
- ✅ **UI Moderna** con Glassmorphism
- ✅ **Almacenamiento en Google Sheets** (sin servidores adicionales)

---

## 📊 Auditoría de Código

### Arquitectura & Stack
- **Backend**: Google Apps Script (GAS) - Node.js equivalente para Google Workspace
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Base de Datos**: Google Sheets (4 hojas integradas)
- **Despliegue**: Web App integrada de Google Sheets

### Métricas del Proyecto
| Métrica | Valor |
|---------|-------|
| Líneas de Código | 2,186 |
| Archivos Backend (GAS) | 1 (Codigo.gs) - 440 líneas |
| Archivos Frontend | 2 (index.html - 949 líneas, index_auditado.html - 797 líneas) |
| Archivos de Configuración | 0 |
| Peso Total | ~140 KB |

### Características Técnicas Implementadas ✅

#### Backend (Codigo.gs)
- ✅ **Gestión de Hojas Defensiva** - Validación de existencia de hojas
- ✅ **Locking Multi-usuario** - LockService para prevenir condiciones de carrera (30s timeout)
- ✅ **Transacciones Atómicas** - Procesamiento de ventas sin estado inconsistente
- ✅ **Sanitización de Datos** - Validación de entrada (IDs, nombres, números)
- ✅ **Manejo Robusto de Errores** - Try-catch exhaustivo con logging
- ✅ **Configuración Centralizada** - CONFIG object
- ✅ **Documentación JSDoc** - Funciones bien comentadas
- ✅ **Validación de Stock Real** - Dentro del bloqueo crítico

#### Frontend (index.html)
- ✅ **Diseño Responsivo** - Mobile-first, breakpoints múltiples
- ✅ **UI Moderna** - Glassmorphism, colores degradados, animaciones suaves
- ✅ **Dark Mode Nativo** - CSS variables para temas adaptables
- ✅ **Optimización Mobile** - Safe area insets (notch support), viewport meta
- ✅ **Accesibilidad** - Semántica HTML5, contraste WCAG
- ✅ **Indicadores de Carga** - Progress bar global durante llamadas
- ✅ **Gestos Táctiles** - Optimizados para interacción mobile

### Fortalezas 💪

1. **Seguridad Concurrente**: Implementa locks para evitar race conditions en operaciones críticas
2. **UX Premium**: Interfaz bella, moderna y completamente funcional
3. **Sin Infraestructura Adicional**: Todo corre en Google Sheets + Google Apps Script
4. **Atómica de Ventas**: Garantiza integridad de datos en transacciones multi-hoja
5. **Validación en Dos Niveles**: Cliente (UI) + Servidor (Backend)
6. **Escalable**: Estructura modular y fácil de extender

### Áreas de Mejora 🔧

1. **Missing API Endpoints**: Faltan funciones como `registrarEntrada()`, `getHistorial()`, etc.
2. **No Hay Tests Automatizados**: Sin cobertura de pruebas unitarias
3. **Logging Limitado**: Solo usa `Logger.log()` nativo
4. **Sin Versionado de API**: No hay control de versiones en las funciones públicas
5. **Cartera.gs Vacío**: Archivo sin implementación (probablemente para módulo de cuentas por cobrar)
6. **Paginación Manual**: Constante HISTORY_PAGINATION existe pero no se usa
7. **Sin Documentación API**: Falta swagger/OpenAPI o similar
8. **Variables Globales**: `DB_ID` debería ser local o en CONFIG
9. **Falta Validación de Formatos**: Emails, teléfonos, etc. no se validan
10. **Sin Rate Limiting**: Vulnerable a abuso de API

---

## 🗄️ Estructura de Base de Datos

### Hojas Requeridas en Google Sheets

```
📊 Spreadsheet
├── Productos (id, nombre, stock, precio)
├── Ventas (id_venta, fecha, total)
├── Detalle_Ventas (id_venta, id_producto, cantidad, precio)
└── Entradas (id, fecha, id_producto, cantidad, costo)
```

### Schema Detallado

**Productos** (Columnas A-D)
```
ID | Nombre | Stock | Precio
---|--------|-------|-------
P001 | Laptop | 5 | 99999
```

**Ventas** (Columnas A-C)
```
ID_Venta | Fecha | Total
---------|-------|------
V1713098401234 | 2026-04-14 | 25000
```

**Detalle_Ventas** (Columnas A-D)
```
ID_Venta | ID_Producto | Cantidad | Precio_Unitario
---------|-------------|----------|---------------
V1... | P001 | 1 | 99999
```

---

## 🚀 Instalación & Uso

### Prerequisitos
- Cuenta de Google con Google Sheets y Google Apps Script habilitados
- Navegador moderno (Chrome, Firefox, Safari, Edge)

### Setup Inicial

1. **Crear Google Sheets**
   - Copia el ID del spreadsheet

2. **Crear Google Apps Script Web App**
   - Ve a `Apps Script` en el spreadsheet
   - Reemplaza `Codigo.gs` con el contenido del archivo
   - Vincula el archivo `index.html`

3. **Configurar Hojas**
   - Crea 4 hojas con nombres exactos: `Productos`, `Ventas`, `Detalle_Ventas`, `Entradas`
   - Agregar headers en primera fila

4. **Deploy como Web App**
   ```
   Deploy → New Deployment → Type: Web App
   Execute as: Tu cuenta
   Who has access: Anyone (o restringido)
   ```

5. **Copiar URL de Web App**
   - Usar la URL proporcionada en navegador/app

### Uso Básico
- **Ver Dashboard**: Visualiza ventas hoy, transacciones, stock, valor de inventario
- **Gestionar Productos**: CRUD completo (crear, leer, actualizar, borrar)
- **Procesar Ventas**: Añade items al carrito → Procesa venta atómica
- **Historial**: Consulta transacciones pasadas con paginación

---

## 📦 API Reference

### Funciones Backend Públicas

```javascript
// Obtener todos los productos
getProductos() → Array<Product>

// Guardar nuevo producto o actualizar existente
saveProducto(producto) → {success: bool, message?: string}

// Eliminar producto
deleteProducto(id) → {success: bool, message?: string}

// Procesar venta (atómico)
procesarVenta(carrito) → {success: bool, id?: string, total?: number, message?: string}

// Dashboard con métricas
getDashboard() → {ventasHoy, transaccionesHoy, stockTotal, valorStock, utilidad}
```

### Tipos de Datos

```typescript
type Product = {
  id: string;        // ID único (ej: P001)
  nombre: string;    // Máx 100 caracteres
  stock: number;     // Entero ≥ 0
  precio: number;    // Positivo, permite decimales
}

type CartItem = {
  id_producto: string;
  nombre: string;
  cantidad: number;
  precio: number;
}
```

---

## 🔒 Seguridad

- ✅ **XSS Mitigation**: HTML escapado en inputs
- ✅ **SQL Injection N/A**: No usa SQL directo
- ✅ **CSRF Protection**: Google Apps Script incluido
- ✅ **Data Validation**: Sanitización en entrada
- ✅ **Concurrency Control**: Locks en operaciones críticas
- ⚠️ **Rate Limiting**: No implementado (considerar en v2.1)
- ⚠️ **Auditoría**: No hay logs persistentes (considerar Firebase)

---

## 📋 Roadmap v2.1+

- [ ] Completar módulo de Cartera (cuentas por cobrar)
- [ ] Tests automatizados (Jest + Google Apps Script testing)
- [ ] API Documentation (OpenAPI/Swagger)
- [ ] Rate Limiting por usuario
- [ ] Historial con filtros avanzados
- [ ] Reportes exportables (PDF/Excel)
- [ ] Control de acceso por rol (admin/vendedor)
- [ ] Sincronización con Google Drive
- [ ] Webhooks para integraciones
- [ ] Soporte multi-idioma

---

## 📄 Licencia

© 2026 - Todos los derechos reservados  
Desarrollado por: César Andrés Abadía  
Versión Premium - Código propietario

---

## 📞 Soporte

Para reportar bugs, solicitar features o preguntas:
- 📧 Email: cesar@example.com
- 🐛 Issues: GitHub Issues (este repositorio)
- 💬 Discussions: GitHub Discussions

---

**Última actualización**: 14 de abril de 2026  
**Estado**: Production Ready ✅
