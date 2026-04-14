/**
 * MICRO ERP - PREMIUM EDITION
 * Desarrollado por: César Andrés Abadía
 * Archivo: Codigo.gs
 * Versión: 2.0 (Refactorizada y Blindada)
 * © 2026 Todos los derechos reservados
 */

const CONFIG = {
  SHEETS: {
    PRODUCTOS: "Productos",
    ENTRADAS: "Entradas",
    VENTAS: "Ventas",
    DETALLE_VENTAS: "Detalle_Ventas",
  },
  LOCK_TIMEOUT: 30000,
  COLUMNS: {
    PRODUCTOS: { id: 0, nombre: 1, stock: 2, precio: 3 },
    VENTAS: { id: 0, fecha: 1, total: 2 },
    DETALLE_VENTAS: { id: 0, idProducto: 1, cantidad: 2, precio: 3 },
    ENTRADAS: { id: 0, fecha: 1, idProducto: 2, cantidad: 3, costo: 4 },
  },
  LIMITS: {
    HISTORY_PAGINATION: 50,
  },
};

let DB_ID = null;

/**
 * Inicialización de Base de Datos
 */
function initDB() {
  try {
    DB_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
    return !!DB_ID;
  } catch (e) {
    Logger.log("FATAL initDB: " + e.toString());
    throw new Error(
      "No se pudo encontrar una hoja de cálculo activa. Vincula este script a un archivo de Google Sheets.",
    );
  }
}

/**
 * Gestor de Hojas (Defensivo)
 */
function getSheet(sheetName) {
  if (!sheetName) {
    throw new Error("Error de sistema: Nombre de hoja no proporcionado.");
  }

  if (!DB_ID) initDB();

  let ss;
  try {
    ss = SpreadsheetApp.openById(DB_ID);
  } catch (e) {
    throw new Error(
      "No se pudo abrir el archivo de datos. Verifica los permisos de edición.",
    );
  }

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    const nombresDisponibles = ss
      .getSheets()
      .map((s) => s.getName())
      .join(", ");
    throw new Error(
      `La pestaña "${sheetName}" no existe. Asegúrate de tener estas hojas: [Productos, Ventas, Detalle_Ventas, Entradas]. Disponibles actualmente: [${nombresDisponibles}]`,
    );
  }

  return sheet;
}

/**
 * Punto de entrada Web App
 */
function doGet() {
  try {
    initDB();
    const html = HtmlService.createTemplateFromFile("index");
    return html
      .evaluate()
      .setTitle("MicroERP Premium")
      .addMetaTag(
        "viewport",
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      )
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    Logger.log("ERROR doGet: " + e.toString());
    return HtmlService.createHtmlOutput(
      '<h2 style="color:red">Error en el servidor</h2><p>' +
        e.toString() +
        "</p>",
    );
  }
}

/**
 * Lógica de Inventario
 */
function getProductos() {
  try {
    const sheet = getSheet(CONFIG.SHEETS.PRODUCTOS);
    const data = sheet.getDataRange().getValues();
    if (!data || data.length <= 1) return [];

    const COL = CONFIG.COLUMNS.PRODUCTOS;
    return data
      .slice(1)
      .map((row) => {
        if (!row[COL.id]) return null;
        return {
          id: String(row[COL.id]).trim(),
          nombre: String(row[COL.nombre] || "Sin nombre").trim(),
          stock: Math.max(0, Math.floor(parseInt(row[COL.stock]) || 0)),
          precio: Math.max(0, parseFloat(row[COL.precio]) || 0),
        };
      })
      .filter((p) => p !== null);
  } catch (e) {
    Logger.log("ERROR getProductos: " + e.toString());
    return [];
  }
}

function saveProducto(producto) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(CONFIG.LOCK_TIMEOUT))
      throw new Error("Servidor ocupado. Intenta de nuevo.");

    // Sanitización
    const idLimpio = String(producto.id || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "");
    const nombreLimpio = String(producto.nombre || "Nuevo Item")
      .trim()
      .substring(0, 100);
    const stockLimpio = Math.max(0, Math.floor(parseInt(producto.stock) || 0));
    const precioLimpio = Math.max(0, parseFloat(producto.precio) || 0);

    if (!idLimpio) throw new Error("ID inválido");

    const sheet = getSheet(CONFIG.SHEETS.PRODUCTOS);
    const data = sheet.getDataRange().getValues();
    const COL = CONFIG.COLUMNS.PRODUCTOS;

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.id]).trim() === idLimpio) {
        rowIndex = i + 1;
        break;
      }
    }

    const rowData = [idLimpio, nombreLimpio, stockLimpio, precioLimpio];
    if (rowIndex !== -1) {
      sheet.getRange(rowIndex, 1, 1, 4).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function deleteProducto(id) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(CONFIG.LOCK_TIMEOUT)) throw new Error("Sistema ocupado");
    const sheet = getSheet(CONFIG.SHEETS.PRODUCTOS);
    const data = sheet.getDataRange().getValues();
    const COL = CONFIG.COLUMNS.PRODUCTOS;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.id]).trim() === String(id).trim()) {
        sheet.deleteRow(i + 1);
        SpreadsheetApp.flush();
        return { success: true };
      }
    }
    return { success: false, message: "No se encontró el producto" };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Procesamiento de Ventas (Atómico)
 */
function procesarVenta(carrito) {
  if (!carrito || carrito.length === 0)
    return { success: false, message: "Carrito vacío" };

  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(CONFIG.LOCK_TIMEOUT))
      throw new Error("Servidor ocupado: error de concurrencia");

    const sheetVentas = getSheet(CONFIG.SHEETS.VENTAS);
    const sheetDetalle = getSheet(CONFIG.SHEETS.DETALLE_VENTAS);
    const sheetStock = getSheet(CONFIG.SHEETS.PRODUCTOS);

    const dataStock = sheetStock.getDataRange().getValues();
    const idVenta = "V" + Date.now();
    const fecha = new Date();
    let totalVenta = 0;
    const filasDetalle = [];

    // Validar stock real dentro del bloqueo
    for (const item of carrito) {
      const idx = dataStock.findIndex(
        (r) => String(r[0]).trim() === String(item.id_producto).trim(),
      );
      if (idx === -1) throw new Error(`Producto ${item.nombre} ya no existe.`);

      const stockActual = parseInt(dataStock[idx][2]) || 0;
      if (stockActual < item.cantidad)
        throw new Error(`Stock insuficiente para ${item.nombre}.`);

      // Actualizar fila en memoria
      dataStock[idx][2] = stockActual - item.cantidad;
      totalVenta += item.cantidad * item.precio;

      filasDetalle.push([
        idVenta,
        item.id_producto,
        item.cantidad,
        item.precio,
      ]);
    }

    // Guardar cambios masivamente
    sheetStock.getRange(1, 1, dataStock.length, 4).setValues(dataStock);
    sheetDetalle
      .getRange(sheetDetalle.getLastRow() + 1, 1, filasDetalle.length, 4)
      .setValues(filasDetalle);
    sheetVentas.appendRow([idVenta, fecha, totalVenta]);

    SpreadsheetApp.flush();
    return { success: true, id: idVenta, total: totalVenta };
  } catch (e) {
    Logger.log("ERROR procesarVenta: " + e.toString());
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Dashboard e Informes
 */
function getDashboard() {
  try {
    const sheetVentas = getSheet(CONFIG.SHEETS.VENTAS);
    const dataVentas = sheetVentas.getDataRange().getValues();
    const productos = getProductos();

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
    productos.forEach((p) => {
      stockTotal += p.stock;
      valorStock += p.stock * p.precio;
    });

    return {
      ventasHoy: totalVentasHoy,
      transaccionesHoy: transaccionesHoy,
      stockTotal: stockTotal,
      valorStock: valorStock,
      utilidad: totalVentasHoy * 0.25, // Estimación simple si no hay costos
      margenPorcentaje: 25,
    };
  } catch (e) {
    Logger.log("ERROR Dashboard: " + e.toString());
    return {
      ventasHoy: 0,
      transaccionesHoy: 0,
      stockTotal: 0,
      valorStock: 0,
      utilidad: 0,
      margenPorcentaje: 0,
    };
  }
}

function getHistoricoVentas() {
  try {
    const sheet = getSheet(CONFIG.SHEETS.VENTAS);
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];

    const start = Math.max(2, lastRow - CONFIG.LIMITS.HISTORY_PAGINATION + 1);
    const num = lastRow - start + 1;
    const data = sheet.getRange(start, 1, num, 3).getValues();

    return data.reverse().map((r) => ({
      id: r[0],
      fecha: r[1] instanceof Date ? r[1].toLocaleString("es-ES") : r[1],
      total: r[2],
    }));
  } catch (e) {
    return [];
  }
}

/**
 * Inteligencia Artificial
 */
function analizarVentasConGemini() {
  try {
    const dashboard = getDashboard();
    const props = PropertiesService.getScriptProperties();
    const apiKey = (props.getProperty("GEMINI_API_KEY") || "").trim();

    if (!apiKey)
      return {
        success: false,
        message:
          "Configura la API Key de Gemini en las Propiedades del Script.",
      };

    const prompt = `
Eres un asesor experto en ventas minoristas, análisis de inventario y optimización de negocios pequeños en Latinoamérica.

Contexto del negocio:
- Tipo: tienda retail
- Objetivo: aumentar ventas, mejorar rotación de inventario y maximizar utilidad
- Usuario: no técnico, necesita instrucciones claras y aplicables hoy

Datos del día:
- Ventas totales: $${dashboard.ventasHoy}
- Transacciones: ${dashboard.transaccionesHoy}
- Productos en stock: ${dashboard.stockTotal}
- Valor del inventario: $${dashboard.valorStock}
- Utilidad estimada: $${dashboard.utilidad}
- Margen estimado: ${dashboard.margenPorcentaje}%

Datos de productos:
${JSON.stringify(getProductos().slice(0, 20))}

Tarea:
Genera un análisis inteligente del negocio y entrega EXACTAMENTE:

1) Diagnóstico general (máximo 3 líneas)
2) 3 recomendaciones accionables inmediatas
3) 2 alertas críticas (riesgos o problemas)
4) 2 oportunidades rápidas de mejora (ventas o inventario)

Reglas:
- Cero consejos genéricos (prohibido “vende más”, “mejora marketing”)
- Cada recomendación debe incluir:
  • Problema detectado
  • Acción concreta
  • Resultado esperado
- Usa lógica de negocio:
  • Si ventas son bajas → enfócate en aumentar ingresos
  • Si stock es alto → enfócate en rotación
  • Si hay pocos movimientos → enfócate en atracción de clientes
- Detecta productos con:
  • Bajo movimiento
  • Sobrestock
  • Precio posiblemente mal ajustado
- Sé directo, específico y útil
- Máximo 2 líneas por punto
- Lenguaje claro, sin tecnicismos innecesarios

Formato de salida:

📊 Diagnóstico:
...

🚀 Recomendaciones:
1. ...
2. ...
3. ...

⚠️ Alertas:
- ...
- ...

💡 Oportunidades:
- ...
- ...
`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      muteHttpExceptions: true,
    });

    if (res.getResponseCode() === 429)
      return {
        success: false,
        message: "Límite de cuota IA. Reintenta en breve.",
      };
    if (res.getResponseCode() !== 200)
      return { success: false, message: "Error de conexión con IA." };

    const json = JSON.parse(res.getContentText());
    return {
      success: true,
      analisis: json.candidates[0].content.parts[0].text,
    };
  } catch (e) {
    return { success: false, message: "Error en el servicio de IA." };
  }
}
