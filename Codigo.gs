// ============================================================================
// MICROERP PREMIUM v3.0 ENTERPRISE EDITION
// Backend: Google Apps Script + Google Sheets
// Enterprise Patterns: Singleton, Cache, Audit, Locking with Retry
// ============================================================================

/**
 * CONFIGURATION - Centralized (NO GLOBAL VARIABLES)
 */
const CONFIG = {
  SHEETS: {
    PRODUCTOS: 'Productos',
    VENTAS: 'Ventas',
    DETALLE_VENTAS: 'Detalle_Ventas',
    ENTRADAS: 'Entradas',
    CARTERA: 'Cartera',
    FACTURAS: 'Facturas',
    PAGOS: 'Pagos',
    LOGS: 'Logs',
  },
  COLUMNS: {
    PRODUCTOS: { id: 0, nombre: 1, stock: 2, precio: 3 },
    VENTAS: { id: 0, fecha: 1, total: 2 },
    DETALLE_VENTAS: { idVenta: 0, idProducto: 1, cantidad: 2, precio: 3 },
    ENTRADAS: { id: 0, fecha: 1, idProducto: 2, cantidad: 3, costo: 4 },
    CARTERA: { id: 0, nombre: 1, limite: 2, saldo: 3, activo: 4 },
    FACTURAS: { id: 0, idCliente: 1, fecha: 2, monto: 3, vencimiento: 4, estado: 5 },
    PAGOS: { id: 0, idFactura: 1, monto: 2, fecha: 3 },
    LOGS: { timestamp: 0, usuario: 1, accion: 2, detalles: 3, ip: 4, estado: 5 },
  },
  LIMITS: {
    HISTORY_PAGINATION: 50,
    MAX_PRODUCTS: 1000,
    MAX_LOCK_RETRIES: 3,
  },
  TIMEOUTS: {
    LOCK_MS: 15000,
    CACHE_TTL_MS: 60000,
    BACKOFF_BASE_MS: 500,
  },
  VALIDATION: {
    ID_REGEX: /^[A-Z0-9_-]{3,20}$/,
    MAX_PRICE: 999999,
    MAX_STOCK: 99999,
    MAX_NAME_LENGTH: 100,
  },
};

// ============================================================================
// SINGLETON - DATABASE MANAGER (Sin variables globales)
// ============================================================================
class DatabaseManager {
  static #instance = null;
  #dbId = null;
  #lastInitTime = 0;

  constructor() {
    if (DatabaseManager.#instance) return DatabaseManager.#instance;
    DatabaseManager.#instance = this;
    this.initDatabase();
  }

  static getInstance() {
    return DatabaseManager.#instance || new DatabaseManager();
  }

  initDatabase() {
    try {
      this.#dbId = SpreadsheetApp.getActiveSpreadsheet().getId();
      this.#lastInitTime = Date.now();
      Logger.log(`[DB] Initialized: ${this.#dbId}`);
      return !!this.#dbId;
    } catch (e) {
      throw new AppError("DB_ERROR", "Init failed: " + e.toString());
    }
  }

  getDbId() {
    if (!this.#dbId || Date.now() - this.#lastInitTime > 30 * 60 * 1000) {
      this.initDatabase();
    }
    return this.#dbId;
  }

  getSheet(sheetName) {
    if (!sheetName || typeof sheetName !== 'string') {
      throw new AppError("INVALID_INPUT", "Sheet name required");
    }
    try {
      const ss = SpreadsheetApp.openById(this.getDbId());
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        const available = ss.getSheets().map(s => s.getName()).join(", ");
        throw new AppError("SHEET_NOT_FOUND", `${sheetName} not found: ${available}`);
      }
      return sheet;
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("DB_ERROR", e.toString());
    }
  }

  ensureSheets() {
    try {
      const ss = SpreadsheetApp.openById(this.getDbId());
      const existing = ss.getSheets().map(s => s.getName());
      const headers = {
        'Productos': ['ID', 'Nombre', 'Stock', 'Precio'],
        'Ventas': ['ID', 'Fecha', 'Total'],
        'Detalle_Ventas': ['ID_Venta', 'ID_Producto', 'Cantidad', 'Precio'],
        'Entradas': ['ID', 'Fecha', 'ID_Producto', 'Cantidad', 'Costo'],
        'Cartera': ['ID', 'Nombre', 'Límite', 'Saldo', 'Activo'],
        'Facturas': ['ID', 'ID_Cliente', 'Fecha', 'Monto', 'Vencimiento', 'Estado'],
        'Pagos': ['ID', 'ID_Factura', 'Monto', 'Fecha'],
        'Logs': ['Timestamp', 'Usuario', 'Acción', 'Detalles', 'IP', 'Estado'],
      };
      Object.entries(CONFIG.SHEETS).forEach(([key, name]) => {
        if (!existing.includes(name)) {
          const sheet = ss.insertSheet(name);
          if (headers[name]) sheet.appendRow(headers[name]);
          Logger.log(`[DB] Created: ${name}`);
        }
      });
    } catch (e) {
      Logger.log(`[DB WARNING] ${e.toString()}`);
    }
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================
class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }
}

class ErrorHandler {
  static response(code, message, data = null) {
    return {
      success: code === 'OK',
      code: code,
      message: message || code,
      data: data,
      timestamp: new Date().toISOString(),
    };
  }

  static logFatal(context, error) {
    Logger.log(`[FATAL] ${context}: ${error.toString()}`);
    AuditLogger.log('ERROR', { context, error: error.toString() }, 'ERROR');
  }
}

// ============================================================================
// VALIDATORS
// ============================================================================
class Validators {
  static isValidId(id) {
    if (!id || typeof id !== 'string') return false;
    return CONFIG.VALIDATION.ID_REGEX.test(id.trim().toUpperCase());
  }

  static isValidPrice(price) {
    const p = parseFloat(price);
    return !isNaN(p) && p >= 0 && p <= CONFIG.VALIDATION.MAX_PRICE;
  }

  static isValidStock(stock) {
    const s = parseInt(stock);
    return !isNaN(s) && s >= 0 && s <= CONFIG.VALIDATION.MAX_STOCK;
  }

  static isValidName(name) {
    if (!name || typeof name !== 'string') return false;
    const t = name.trim();
    return t.length > 0 && t.length <= CONFIG.VALIDATION.MAX_NAME_LENGTH;
  }

  static validateCart(cart) {
    if (!Array.isArray(cart) || cart.length === 0) {
      throw new AppError("INVALID_INPUT", "Cart empty");
    }
    cart.forEach((item, i) => {
      if (!Validators.isValidId(item.id_producto))
        throw new AppError("INVALID_INPUT", `Item ${i}: ID invalid`);
      if (!Validators.isValidStock(item.cantidad))
        throw new AppError("INVALID_INPUT", `Item ${i}: Qty invalid`);
      if (!Validators.isValidPrice(item.precio))
        throw new AppError("INVALID_INPUT", `Item ${i}: Price invalid`);
      if (!item.nombre || typeof item.nombre !== 'string')
        throw new AppError("INVALID_INPUT", `Item ${i}: Name invalid`);
    });
    return true;
  }
}

// ============================================================================
// AUDIT LOGGER
// ============================================================================
class AuditLogger {
  static log(action, details, estado = 'SUCCESS') {
    try {
      const db = DatabaseManager.getInstance();
      db.ensureSheets();
      const sheet = db.getSheet(CONFIG.SHEETS.LOGS);
      const row = [
        new Date(),
        Session.getActiveUser().getEmail() || 'system',
        action,
        JSON.stringify(details),
        'N/A',
        estado,
      ];
      sheet.appendRow(row);
      SpreadsheetApp.flush();
    } catch (e) {
      Logger.log(`[AUDIT ERROR] ${e.toString()}`);
    }
  }
}

// ============================================================================
// PRODUCT CACHE
// ============================================================================
class ProductCache {
  static #cache = null;
  static #lastUpdate = 0;
  static #key = 'PRODUCTS_CACHE_V3';

  static getProducts() {
    const aged = Date.now() - ProductCache.#lastUpdate;
    if (ProductCache.#cache && aged < 5000) {
      Logger.log(`[CACHE] Memory (${aged}ms)`);
      return ProductCache.#cache;
    }

    const cached = CacheService.getScriptCache().get(ProductCache.#key);
    if (cached) {
      ProductCache.#cache = JSON.parse(cached);
      ProductCache.#lastUpdate = Date.now();
      Logger.log('[CACHE] CacheService hit');
      return ProductCache.#cache;
    }

    const products = ProductCache.#loadFromSheet();
    ProductCache.#cache = products;
    ProductCache.#lastUpdate = Date.now();
    CacheService.getScriptCache().put(ProductCache.#key, JSON.stringify(products), CONFIG.TIMEOUTS.CACHE_TTL_MS / 1000);
    Logger.log(`[CACHE] Loaded ${products.length} from sheet`);
    return products;
  }

  static #loadFromSheet() {
    try {
      const db = DatabaseManager.getInstance();
      const sheet = db.getSheet(CONFIG.SHEETS.PRODUCTOS);
      const data = sheet.getDataRange().getValues();
      if (!data || data.length <=1) return [];
      const COL = CONFIG.COLUMNS.PRODUCTOS;
      return data.slice(1)
        .filter(row => !!row[COL.id])
        .map(row => ({
          id: String(row[COL.id]).trim().toUpperCase(),
          nombre: String(row[COL.nombre] || "N/A").trim(),
          stock: Math.max(0, Math.floor(parseInt(row[COL.stock]) || 0)),
          precio: Math.max(0, parseFloat(row[COL.precio]) || 0),
        }));
    } catch (e) {
      Logger.log(`[CACHE ERROR] ${e.toString()}`);
      return [];
    }
  }

  static invalidate() {
    ProductCache.#cache = null;
    ProductCache.#lastUpdate = 0;
    CacheService.getScriptCache().remove(ProductCache.#key);
    Logger.log('[CACHE] Invalidated');
  }
}

// ============================================================================
// LOCK MANAGER
// ============================================================================
class LockManager {
  static withRetry(operation, context) {
    const lock = LockService.getScriptLock();
    let lastError = null;
    for (let i = 1; i <= CONFIG.LIMITS.MAX_LOCK_RETRIES; i++) {
      try {
        const acquired = lock.tryLock(CONFIG.TIMEOUTS.LOCK_MS);
        if (!acquired) {
          const props = PropertiesService.getScriptProperties();
          const lockTime = props.getProperty(`LOCK_${context}`);
          if (lockTime && Date.now() - parseInt(lockTime) > 45000) {
            props.deleteProperty(`LOCK_${context}`);
            Logger.log(`[LOCK] Phantom: ${context}`);
            AuditLogger.log('LOCK_PHANTOM', { context }, 'WARNING');
            continue;
          }
          throw new AppError("LOCK_TIMEOUT", `Lock ${i}/${CONFIG.LIMITS.MAX_LOCK_RETRIES}`);
        }
        PropertiesService.getScriptProperties().setProperty(`LOCK_${context}`, Date.now().toString());
        const result = operation();
        PropertiesService.getScriptProperties().deleteProperty(`LOCK_${context}`);
        Logger.log(`[LOCK] OK: ${context}`);
        return result;
      } catch (e) {
        lastError = e;
        if (i < CONFIG.LIMITS.MAX_LOCK_RETRIES) {
          const delay = CONFIG.TIMEOUTS.BACKOFF_BASE_MS * Math.pow(2, i - 1);
          Logger.log(`[LOCK] Retry ${delay}ms`);
          Utilities.sleep(delay);
        }
      } finally {
        try { lock.releaseLock(); } catch (e) { Logger.log(`[LOCK ERR] ${e}`); }
      }
    }
    throw lastError;
  }
}

// ============================================================================
// INVENTORY MANAGER
// ============================================================================
class InventoryManager {
  static getProductos() {
    try {
      return ProductCache.getProducts();
    } catch (e) {
      AuditLogger.log('PRODUCTS_ERROR', { error: e.toString() }, 'ERROR');
      throw e;
    }
  }

  static saveProducto(producto) {
    return LockManager.withRetry(() => {
      const id = String(producto.id || '').trim().toUpperCase();
      if (!Validators.isValidId(id)) throw new AppError("VALIDATION_ERROR", "ID invalid");
      if (!Validators.isValidName(producto.nombre)) throw new AppError("VALIDATION_ERROR", "Name invalid");
      if (!Validators.isValidStock(producto.stock)) throw new AppError("VALIDATION_ERROR", "Stock invalid");
      if (!Validators.isValidPrice(producto.precio)) throw new AppError("VALIDATION_ERROR", "Price invalid");

      const db = DatabaseManager.getInstance();
      const sheet = db.getSheet(CONFIG.SHEETS.PRODUCTOS);
      const data = sheet.getDataRange().getValues();
      const COL = CONFIG.COLUMNS.PRODUCTOS;

      let rowIdx = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][COL.id]).trim().toUpperCase() === id) {
          rowIdx = i + 1;
          break;
        }
      }

      const row = [id, producto.nombre.trim(), producto.stock, producto.precio];
      if (rowIdx !== -1) {
        sheet.getRange(rowIdx, 1, 1, 4).setValues([row]);
        AuditLogger.log('PRODUCT_UPDATE', { id });
      } else {
        sheet.appendRow(row);
        AuditLogger.log('PRODUCT_CREATE', { id });
      }

      SpreadsheetApp.flush();
      ProductCache.invalidate();
      return ErrorHandler.response('OK', 'Saved', { id });
    }, 'saveProducto');
  }

  static deleteProducto(id) {
    return LockManager.withRetry(() => {
      id = String(id || '').trim().toUpperCase();
      if (!Validators.isValidId(id)) throw new AppError("VALIDATION_ERROR", "ID invalid");

      const db = DatabaseManager.getInstance();
      const sheet = db.getSheet(CONFIG.SHEETS.PRODUCTOS);
      const data = sheet.getDataRange().getValues();
      const COL = CONFIG.COLUMNS.PRODUCTOS;

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][COL.id]).trim().toUpperCase() === id) {
          sheet.deleteRow(i + 1);
          SpreadsheetApp.flush();
          ProductCache.invalidate();
          AuditLogger.log('PRODUCT_DELETE', { id });
          return ErrorHandler.response('OK', 'Deleted');
        }
      }
      throw new AppError("NOT_FOUND", `Product ${id} not found`);
    }, 'deleteProducto');
  }
}

// ============================================================================
// SALES MANAGER
// ============================================================================
class SalesManager {
  static procesarVenta(carrito) {
    return LockManager.withRetry(() => {
      if (!Array.isArray(carrito) || carrito.length === 0) throw new AppError("INVALID_INPUT", "Cart empty");
      Validators.validateCart(carrito);

      const db = DatabaseManager.getInstance();
      const sheetStock = db.getSheet(CONFIG.SHEETS.PRODUCTOS);
      const sheetVentas = db.getSheet(CONFIG.SHEETS.VENTAS);
      const sheetDetalle = db.getSheet(CONFIG.SHEETS.DETALLE_VENTAS);

      const dataStock = sheetStock.getDataRange().getValues();
      const idVenta = 'V' + Date.now();
      const fecha = new Date();
      let totalVenta = 0;
      const filasDetalle = [];
      const COL = CONFIG.COLUMNS.PRODUCTOS;

      for (const item of carrito) {
        const idx = dataStock.findIndex(r => String(r[COL.id]).trim().toUpperCase() === String(item.id_producto).trim().toUpperCase());
        if (idx === -1) throw new AppError("NOT_FOUND", `Product ${item.id_producto} not found`);

        const stock = Math.floor(parseInt(dataStock[idx][COL.stock]) || 0);
        if (stock < item.cantidad) {
          throw new AppError("INSUFFICIENT_STOCK", `${item.nombre}: have ${stock}, need ${item.cantidad}`);
        }

        dataStock[idx][COL.stock] = stock - item.cantidad;
        totalVenta += item.cantidad * item.precio;
        filasDetalle.push([idVenta, item.id_producto, item.cantidad, item.precio]);
      }

      sheetStock.getRange(1, 1, dataStock.length, 4).setValues(dataStock);
      if (filasDetalle.length > 0) {
        sheetDetalle.getRange(sheetDetalle.getLastRow() + 1, 1, filasDetalle.length, 4).setValues(filasDetalle);
      }
      sheetVentas.appendRow([idVenta, fecha, totalVenta]);

      SpreadsheetApp.flush();
      ProductCache.invalidate();

      AuditLogger.log('SALE', { id: idVenta, items: carrito.length, total: totalVenta });

      return ErrorHandler.response('OK', 'Sale processed', {
        id: idVenta,
        total: totalVenta,
        fecha: fecha.toISOString(),
        items: carrito.length,
      });
    }, 'procesarVenta');
  }

  static getHistoricoVentas() {
    try {
      const db = DatabaseManager.getInstance();
      const sheet = db.getSheet(CONFIG.SHEETS.VENTAS);
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return [];

      const start = Math.max(2, lastRow - CONFIG.LIMITS.HISTORY_PAGINATION + 1);
      const data = sheet.getRange(start, 1, lastRow - start + 1, 3).getValues();

      return data.reverse().map(r => ({
        id: r[0],
        fecha: r[1] instanceof Date ? r[1].toLocaleString('es-ES') : r[1],
        total: parseFloat(r[2]) || 0,
      }));
    } catch (e) {
      AuditLogger.log('HISTORY_ERROR', { error: e.toString() }, 'ERROR');
      return [];
    }
  }
}

// ============================================================================
// DASHBOARD
// ============================================================================
class Dashboard {
  static getDashboard() {
    try {
      const db = DatabaseManager.getInstance();
      const sheetVentas = db.getSheet(CONFIG.SHEETS.VENTAS);
      const dataVentas = sheetVentas.getDataRange().getValues();
      const productos = InventoryManager.getProductos();

      let totalVentasHoy = 0;
      let transaccionesHoy = 0;
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      for (let i = 1; i < dataVentas.length; i++) {
        const d = new Date(dataVentas[i][1]);
        if (!isNaN(d.getTime())) {
          d.setHours(0, 0, 0, 0);
          if (d.getTime() === hoy.getTime()) {
            totalVentasHoy += parseFloat(dataVentas[i][2]) || 0;
            transaccionesHoy++;
          }
        }
      }

      let stockTotal = 0;
      let valorStock = 0;
      productos.forEach(p => {
        stockTotal += p.stock;
        valorStock += p.stock * p.precio;
      });

      return ErrorHandler.response('OK', 'Dashboard', {
        ventasHoy: totalVentasHoy,
        transaccionesHoy: transaccionesHoy,
        stockTotal: stockTotal,
        valorStock: valorStock,
        utilidad: totalVentasHoy * 0.25,
        margenPorcentaje: 25,
      });
    } catch (e) {
      ErrorHandler.logFatal('Dashboard', e);
      return ErrorHandler.response('DB_ERROR', 'Dashboard error', {
        ventasHoy: 0,
        transaccionesHoy: 0,
        stockTotal: 0,
        valorStock: 0,
        utilidad: 0,
        margenPorcentaje: 0,
      });
    }
  }
}

// ============================================================================
// WEB APP ENTRY POINTS
// ============================================================================
function doGet() {
  try {
    const db = DatabaseManager.getInstance();
    db.ensureSheets();
    const html = HtmlService.createTemplateFromFile("index");
    return html
      .evaluate()
      .setTitle("MicroERP Premium v3.0")
      .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    ErrorHandler.logFatal('doGet', e);
    return HtmlService.createHtmlOutput('<h2 style="color:red">Error</h2><p>' + e.toString() + '</p>');
  }
}

// ============================================================================
// PUBLIC APIS
// ============================================================================
function getProductos() {
  try {
    return ErrorHandler.response('OK', 'Products', InventoryManager.getProductos());
  } catch (e) {
    return ErrorHandler.response('DB_ERROR', e.message);
  }
}

function saveProducto(producto) {
  try {
    return InventoryManager.saveProducto(producto);
  } catch (e) {
    if (e instanceof AppError) return ErrorHandler.response(e.code, e.message);
    return ErrorHandler.response('DB_ERROR', e.toString());
  }
}

function deleteProducto(id) {
  try {
    return InventoryManager.deleteProducto(id);
  } catch (e) {
    if (e instanceof AppError) return ErrorHandler.response(e.code, e.message);
    return ErrorHandler.response('DB_ERROR', e.toString());
  }
}

function procesarVenta(carrito) {
  try {
    return SalesManager.procesarVenta(carrito);
  } catch (e) {
    if (e instanceof AppError) return ErrorHandler.response(e.code, e.message);
    return ErrorHandler.response('DB_ERROR', e.toString());
  }
}

function getDashboard() {
  return Dashboard.getDashboard();
}

function getHistoricoVentas() {
  try {
    return ErrorHandler.response('OK', 'History', SalesManager.getHistoricoVentas());
  } catch (e) {
    return ErrorHandler.response('DB_ERROR', e.message);
  }
}

function analizarVentasConGemini() {
  try {
    const dashboard = Dashboard.getDashboard();
    const props = PropertiesService.getScriptProperties();
    const apiKey = (props.getProperty("GEMINI_API_KEY") || "").trim();

    if (!apiKey) {
      return ErrorHandler.response('VALIDATION_ERROR', "Configure GEMINI_API_KEY");
    }

    const prompt = `Expert retail advisor. Data: ${JSON.stringify(dashboard.data)}. Top 10: ${JSON.stringify(InventoryManager.getProductos().slice(0, 10))}. Generate: 1) Diagnosis 2) 3 recommendations 3) 2 alerts 4) 2 opportunities. Be specific.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      muteHttpExceptions: true,
    });

    if (res.getResponseCode() !== 200) {
      return ErrorHandler.response('DB_ERROR', "IA error");
    }

    const json = JSON.parse(res.getContentText());
    return ErrorHandler.response('OK', 'Analysis', {
      analisis: json.candidates[0].content.parts[0].text,
    });
  } catch (e) {
    return ErrorHandler.response('DB_ERROR', e.toString());
  }
}
