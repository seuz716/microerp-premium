/**
 * MICRO ERP - MÓDULO DE CARTERA
 * Extensión de Codigo.gs v2.0
 * Desarrollado por: César Andrés Abadía
 * Archivo: Cartera.gs
 * Versión: 1.1
 * © 2026 Todos los derechos reservados
 *
 * CAMBIOS v1.1:
 *   - [FIX] tipo_mov en CANCELACION corregido (antes usaba ESTADOS.CANCELADA por error)
 *   - [FIX] IDs con UUID parcial para evitar colisiones en concurrencia
 *   - [FIX] deleteTercero usa soft-delete (campo activo col 6) en lugar de borrar la fila
 *   - [NEW] actualizarVencimientos() — trigger diario que persiste estado VENCIDA en la hoja
 *   - [NEW] getTerceros() filtra inactivos por defecto
 *
 * HOJAS REQUERIDAS (agregar al Spreadsheet):
 *   - Terceros          → ID, Nombre, Teléfono, Tipo, Limite_Credito, Activo
 *   - Cartera           → ID, Fecha, ID_Tercero, Origen_ID, Total, Saldo, Tipo, Estado, Fecha_Vencimiento
 *   - Movimientos_Cartera → ID, Fecha, ID_Cartera, ID_Tercero, Valor, Tipo_Mov, Referencia
 *
 * TRIGGER REQUERIDO (configurar una sola vez):
 *   Apps Script → Triggers → actualizarVencimientos → Temporizado → Diario
 *
 * MODIFICACIÓN REQUERIDA EN Codigo.gs:
 *   - procesarVenta() acepta ahora un segundo parámetro: opciones { tipo, idTercero, diasCredito }
 *   - CONFIG.SHEETS y CONFIG.COLUMNS se amplían abajo (copiar al CONFIG existente)
 */

// ─────────────────────────────────────────────
// EXTENSIÓN DEL CONFIG (agregar a CONFIG en Codigo.gs)
// ─────────────────────────────────────────────
// SHEETS nuevas:
//   TERCEROS: "Terceros"
//   CARTERA: "Cartera"
//   MOVIMIENTOS_CARTERA: "Movimientos_Cartera"
//
// COLUMNS nuevas:
//   TERCEROS:  { id:0, nombre:1, telefono:2, tipo:3, limite_credito:4 }
//   CARTERA:   { id:0, fecha:1, id_tercero:2, origen_id:3, total:4, saldo:5, tipo:6, estado:7, fecha_vencimiento:8 }
//   MOV_CARTERA: { id:0, fecha:1, id_cartera:2, id_tercero:3, valor:4, tipo_mov:5, referencia:6 }

const CARTERA_CONFIG = {
  SHEETS: {
    TERCEROS: "Terceros",
    CARTERA: "Cartera",
    MOV_CARTERA: "Movimientos_Cartera",
  },
  COLUMNS: {
    TERCEROS:    { id: 0, nombre: 1, telefono: 2, tipo: 3, limite_credito: 4, activo: 5 },
    CARTERA:     { id: 0, fecha: 1, id_tercero: 2, origen_id: 3, total: 4, saldo: 5, tipo: 6, estado: 7, fecha_vencimiento: 8 },
    MOV_CARTERA: { id: 0, fecha: 1, id_cartera: 2, id_tercero: 3, valor: 4, tipo_mov: 5, referencia: 6 },
  },
  ESTADOS: { ABIERTA: "ABIERTA", PARCIAL: "PARCIAL", CANCELADA: "CANCELADA", VENCIDA: "VENCIDA" },
  TIPOS:   { CXC: "CxC", CXP: "CxP" },
  LOCK_TIMEOUT: 30000,
};

// ─────────────────────────────────────────────
// TERCEROS
// ─────────────────────────────────────────────

function getTerceros(filtroTipo) {
  try {
    const sheet = getSheet(CARTERA_CONFIG.SHEETS.TERCEROS);
    const data = sheet.getDataRange().getValues();
    if (!data || data.length <= 1) return [];

    const COL = CARTERA_CONFIG.COLUMNS.TERCEROS;
    return data.slice(1)
      .map((row) => {
        if (!row[COL.id]) return null;
        // Columna activo: si está vacía se asume TRUE (registros antiguos sin el campo)
        const activo = row[COL.activo] === false || String(row[COL.activo]).toUpperCase() === "INACTIVO"
          ? false : true;
        return {
          id:             String(row[COL.id]).trim(),
          nombre:         String(row[COL.nombre] || "Sin nombre").trim(),
          telefono:       String(row[COL.telefono] || "").trim(),
          tipo:           String(row[COL.tipo] || "CLIENTE").trim().toUpperCase(),
          limite_credito: Math.max(0, parseFloat(row[COL.limite_credito]) || 0),
          activo:         activo,
        };
      })
      .filter((t) => t !== null)
      .filter((t) => t.activo)                                                          // ocultar inactivos por defecto
      .filter((t) => !filtroTipo || t.tipo === filtroTipo.toUpperCase());
  } catch (e) {
    Logger.log("ERROR getTerceros: " + e.toString());
    return [];
  }
}

function saveTercero(tercero) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(CARTERA_CONFIG.LOCK_TIMEOUT))
      throw new Error("Servidor ocupado. Intenta de nuevo.");

    const idLimpio      = String(tercero.id || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const nombreLimpio  = String(tercero.nombre || "Tercero").trim().substring(0, 100);
    const telLimpio     = String(tercero.telefono || "").trim().substring(0, 20);
    const tipoLimpio    = ["CLIENTE","PROVEEDOR","OTRO"].includes(String(tercero.tipo).toUpperCase())
                          ? String(tercero.tipo).toUpperCase() : "CLIENTE";
    const limiteLimpio  = Math.max(0, parseFloat(tercero.limite_credito) || 0);

    if (!idLimpio) throw new Error("ID de tercero inválido.");

    const sheet = getSheet(CARTERA_CONFIG.SHEETS.TERCEROS);
    const data  = sheet.getDataRange().getValues();
    const COL   = CARTERA_CONFIG.COLUMNS.TERCEROS;

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.id]).trim() === idLimpio) { rowIndex = i + 1; break; }
    }

    const rowData = [idLimpio, nombreLimpio, telLimpio, tipoLimpio, limiteLimpio, "ACTIVO"];
    if (rowIndex !== -1) {
      sheet.getRange(rowIndex, 1, 1, 6).setValues([rowData]);
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

function deleteTercero(id) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(CARTERA_CONFIG.LOCK_TIMEOUT)) throw new Error("Sistema ocupado.");

    // Verificar que no tenga cartera abierta
    const carteraAbierta = getCarteraPorTercero(id).filter(
      (c) => c.estado !== CARTERA_CONFIG.ESTADOS.CANCELADA
    );
    if (carteraAbierta.length > 0)
      throw new Error("No se puede desactivar: el tercero tiene cartera pendiente.");

    const sheet = getSheet(CARTERA_CONFIG.SHEETS.TERCEROS);
    const data  = sheet.getDataRange().getValues();
    const COL   = CARTERA_CONFIG.COLUMNS.TERCEROS;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL.id]).trim() === String(id).trim()) {
        // Soft delete: marcar INACTIVO sin borrar la fila (preserva historial)
        sheet.getRange(i + 1, COL.activo + 1).setValue("INACTIVO");
        SpreadsheetApp.flush();
        return { success: true };
      }
    }
    return { success: false, message: "Tercero no encontrado." };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────────────────────────
// CARTERA - LECTURA
// ─────────────────────────────────────────────

function getCartera(filtroEstado, filtroTipo) {
  try {
    const sheet = getSheet(CARTERA_CONFIG.SHEETS.CARTERA);
    const data  = sheet.getDataRange().getValues();
    if (!data || data.length <= 1) return [];

    const COL = CARTERA_CONFIG.COLUMNS.CARTERA;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    return data.slice(1)
      .map((row) => {
        if (!row[COL.id]) return null;
        const fVenc = row[COL.fecha_vencimiento] instanceof Date
          ? row[COL.fecha_vencimiento] : new Date(row[COL.fecha_vencimiento]);

        // Actualizar estado a VENCIDA en memoria si aplica
        let estado = String(row[COL.estado] || "ABIERTA").trim();
        if (estado !== CARTERA_CONFIG.ESTADOS.CANCELADA) {
          fVenc.setHours(0, 0, 0, 0);
          if (!isNaN(fVenc.getTime()) && fVenc < hoy) estado = CARTERA_CONFIG.ESTADOS.VENCIDA;
        }

        return {
          id:               String(row[COL.id]).trim(),
          fecha:            row[COL.fecha] instanceof Date ? row[COL.fecha].toLocaleDateString("es-CO") : row[COL.fecha],
          id_tercero:       String(row[COL.id_tercero]).trim(),
          origen_id:        String(row[COL.origen_id] || "").trim(),
          total:            parseFloat(row[COL.total]) || 0,
          saldo:            parseFloat(row[COL.saldo]) || 0,
          tipo:             String(row[COL.tipo]).trim(),
          estado:           estado,
          fecha_vencimiento: !isNaN(fVenc.getTime()) ? fVenc.toLocaleDateString("es-CO") : "",
          dias_vencido:     (estado === CARTERA_CONFIG.ESTADOS.VENCIDA)
                              ? Math.floor((hoy - fVenc) / 86400000) : 0,
        };
      })
      .filter((c) => c !== null)
      .filter((c) => !filtroEstado || c.estado === filtroEstado)
      .filter((c) => !filtroTipo   || c.tipo === filtroTipo);
  } catch (e) {
    Logger.log("ERROR getCartera: " + e.toString());
    return [];
  }
}

function getCarteraPorTercero(idTercero) {
  return getCartera().filter((c) => c.id_tercero === String(idTercero).trim());
}

function getSaldoTercero(idTercero) {
  const cartera = getCarteraPorTercero(idTercero);
  return cartera
    .filter((c) => c.estado !== CARTERA_CONFIG.ESTADOS.CANCELADA)
    .reduce((acc, c) => acc + c.saldo, 0);
}

// ─────────────────────────────────────────────
// CARTERA - CREACIÓN (llamado desde procesarVenta o manualmente para CxP)
// ─────────────────────────────────────────────

/**
 * Crea un registro de cartera.
 * @param {string} idTercero
 * @param {string} origenId    - ID de la venta (CxC) o entrada (CxP)
 * @param {number} total
 * @param {string} tipo        - "CxC" | "CxP"
 * @param {number} diasCredito - días para vencimiento (default 30)
 */
function crearCartera_(idTercero, origenId, total, tipo, diasCredito) {
  // Función interna, llamar siempre dentro de un lock externo
  const tercero = getTerceros().find((t) => t.id === String(idTercero).trim());
  if (!tercero) throw new Error(`Tercero ${idTercero} no existe.`);

  if (tipo === CARTERA_CONFIG.TIPOS.CXC) {
    const saldoActual = getSaldoTercero(idTercero);
    if (tercero.limite_credito > 0 && (saldoActual + total) > tercero.limite_credito) {
      throw new Error(
        `Límite de crédito superado para ${tercero.nombre}. ` +
        `Disponible: $${(tercero.limite_credito - saldoActual).toLocaleString("es-CO")}`
      );
    }
  }

  const sheet = getSheet(CARTERA_CONFIG.SHEETS.CARTERA);
  const idCartera = (tipo === CARTERA_CONFIG.TIPOS.CXC ? "CXC" : "CXP")
    + Date.now()
    + Utilities.getUuid().replace(/-/g, "").slice(0, 6).toUpperCase();
  const fecha = new Date();
  const fVenc = new Date();
  fVenc.setDate(fVenc.getDate() + (parseInt(diasCredito) || 30));

  sheet.appendRow([
    idCartera,
    fecha,
    idTercero,
    origenId,
    total,
    total,                              // saldo inicial = total
    tipo,
    CARTERA_CONFIG.ESTADOS.ABIERTA,
    fVenc,
  ]);

  return idCartera;
}

// ─────────────────────────────────────────────
// ABONOS (FIFO)
// ─────────────────────────────────────────────

/**
 * Registra un abono de un tercero.
 * Aplica FIFO: primero la deuda más antigua con saldo > 0.
 *
 * @param {string} idTercero
 * @param {number} valorAbono
 * @param {string} referencia  - Descripción del pago (ej: "Transferencia", "Efectivo")
 * @param {string} tipo        - "CxC" (cobrar) | "CxP" (pagar)
 */
function registrarAbono(idTercero, valorAbono, referencia, tipo) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(CARTERA_CONFIG.LOCK_TIMEOUT))
      throw new Error("Servidor ocupado. Intenta de nuevo.");

    const valor = parseFloat(valorAbono);
    if (!valor || valor <= 0) throw new Error("Valor de abono inválido.");

    const tipoLimpio = tipo === CARTERA_CONFIG.TIPOS.CXP
      ? CARTERA_CONFIG.TIPOS.CXP : CARTERA_CONFIG.TIPOS.CXC;

    // Leer cartera completa del tercero, pendientes, orden FIFO (fecha asc = primera row = más antigua)
    const sheetCartera = getSheet(CARTERA_CONFIG.SHEETS.CARTERA);
    const dataCartera  = sheetCartera.getDataRange().getValues();
    const COL          = CARTERA_CONFIG.COLUMNS.CARTERA;

    const pendientes = [];
    for (let i = 1; i < dataCartera.length; i++) {
      const row = dataCartera[i];
      if (
        String(row[COL.id_tercero]).trim() === String(idTercero).trim() &&
        String(row[COL.tipo]).trim()       === tipoLimpio &&
        String(row[COL.estado]).trim()     !== CARTERA_CONFIG.ESTADOS.CANCELADA &&
        (parseFloat(row[COL.saldo]) || 0)  > 0
      ) {
        pendientes.push({ rowIndex: i + 1, saldo: parseFloat(row[COL.saldo]) });
      }
    }

    if (pendientes.length === 0)
      throw new Error("Este tercero no tiene cartera pendiente de ese tipo.");

    const totalPendiente = pendientes.reduce((a, p) => a + p.saldo, 0);
    if (valor > totalPendiente)
      throw new Error(
        `Abono ($${valor.toLocaleString("es-CO")}) supera la deuda total ` +
        `($${totalPendiente.toLocaleString("es-CO")}).`
      );

    // Aplicar FIFO
    const sheetMov  = getSheet(CARTERA_CONFIG.SHEETS.MOV_CARTERA);
    let restante    = valor;
    const fecha     = new Date();
    const refLimpia = String(referencia || "Abono").trim().substring(0, 100);

    for (const p of pendientes) {
      if (restante <= 0) break;

      const aplicado   = Math.min(restante, p.saldo);
      const nuevoSaldo = p.saldo - aplicado;
      restante        -= aplicado;

      // Leer ID de cartera para el movimiento
      const idCartera = String(dataCartera[p.rowIndex - 1][COL.id]).trim();
      const nuevoEstado = nuevoSaldo <= 0
        ? CARTERA_CONFIG.ESTADOS.CANCELADA
        : CARTERA_CONFIG.ESTADOS.PARCIAL;

      // Actualizar fila de cartera
      sheetCartera.getRange(p.rowIndex, COL.saldo + 1).setValue(nuevoSaldo);
      sheetCartera.getRange(p.rowIndex, COL.estado + 1).setValue(nuevoEstado);

      // Registrar movimiento
      sheetMov.appendRow([
        "MOV" + Date.now() + Utilities.getUuid().replace(/-/g, "").slice(0, 6).toUpperCase(),
        fecha,
        idCartera,
        idTercero,
        aplicado,
        aplicado >= p.saldo ? "CANCELACION" : "ABONO",   // FIX: tipo_mov correcto (no estado)
        refLimpia,
      ]);
    }

    SpreadsheetApp.flush();
    return {
      success:  true,
      aplicado: valor,
      restante: Math.max(0, restante),
    };
  } catch (e) {
    Logger.log("ERROR registrarAbono: " + e.toString());
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────────────────────────
// MODIFICACIÓN A procesarVenta (reemplaza la función en Codigo.gs)
// Agrega soporte de crédito sin romper el flujo actual
// ─────────────────────────────────────────────

/**
 * procesarVenta extendida
 * @param {Array}  carrito
 * @param {Object} opciones  - { tipo: "contado"|"credito", idTercero: string, diasCredito: number }
 */
function procesarVentaV2(carrito, opciones) {
  if (!carrito || carrito.length === 0)
    return { success: false, message: "Carrito vacío." };

  const opt          = opciones || {};
  const esCredito    = opt.tipo === "credito";
  const idTercero    = String(opt.idTercero || "").trim();
  const diasCredito  = parseInt(opt.diasCredito) || 30;

  if (esCredito && !idTercero)
    return { success: false, message: "Venta a crédito requiere seleccionar un cliente." };

  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(CARTERA_CONFIG.LOCK_TIMEOUT))
      throw new Error("Servidor ocupado: error de concurrencia.");

    const sheetVentas  = getSheet(CONFIG.SHEETS.VENTAS);
    const sheetDetalle = getSheet(CONFIG.SHEETS.DETALLE_VENTAS);
    const sheetStock   = getSheet(CONFIG.SHEETS.PRODUCTOS);

    const dataStock = sheetStock.getDataRange().getValues();
    const idVenta   = "V" + Date.now();
    const fecha     = new Date();
    let totalVenta  = 0;
    const filasDetalle = [];

    // Validar stock (igual que antes)
    for (const item of carrito) {
      const idx = dataStock.findIndex(
        (r) => String(r[0]).trim() === String(item.id_producto).trim(),
      );
      if (idx === -1) throw new Error(`Producto ${item.nombre} ya no existe.`);

      const stockActual = parseInt(dataStock[idx][2]) || 0;
      if (stockActual < item.cantidad)
        throw new Error(`Stock insuficiente para ${item.nombre}.`);

      dataStock[idx][2] = stockActual - item.cantidad;
      totalVenta += item.cantidad * item.precio;
      filasDetalle.push([idVenta, item.id_producto, item.cantidad, item.precio]);
    }

    // Si es crédito, verificar límite ANTES de escribir en Sheets
    if (esCredito) {
      const tercero = getTerceros().find((t) => t.id === idTercero);
      if (!tercero) throw new Error("Cliente no encontrado.");

      if (tercero.limite_credito > 0) {
        const saldoActual = getSaldoTercero(idTercero);
        if ((saldoActual + totalVenta) > tercero.limite_credito) {
          throw new Error(
            `Límite de crédito superado para ${tercero.nombre}. ` +
            `Disponible: $${(tercero.limite_credito - saldoActual).toLocaleString("es-CO")}`
          );
        }
      }
    }

    // Guardar inventario y venta
    sheetStock.getRange(1, 1, dataStock.length, 4).setValues(dataStock);
    sheetDetalle
      .getRange(sheetDetalle.getLastRow() + 1, 1, filasDetalle.length, 4)
      .setValues(filasDetalle);
    sheetVentas.appendRow([idVenta, fecha, totalVenta]);

    // Si es crédito, crear registro en Cartera
    if (esCredito) {
      crearCartera_(idTercero, idVenta, totalVenta, CARTERA_CONFIG.TIPOS.CXC, diasCredito);
    }

    SpreadsheetApp.flush();
    return { success: true, id: idVenta, total: totalVenta, credito: esCredito };
  } catch (e) {
    Logger.log("ERROR procesarVentaV2: " + e.toString());
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────────────────────────
// CxP MANUAL (compras a crédito con proveedor)
// ─────────────────────────────────────────────

/**
 * Registra una deuda con proveedor (CxP).
 * Llamar después de registrar la entrada de inventario.
 * @param {string} idProveedor
 * @param {string} origenId      - ID de la entrada en hoja Entradas
 * @param {number} total
 * @param {number} diasCredito
 */
function registrarCxP(idProveedor, origenId, total, diasCredito) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(CARTERA_CONFIG.LOCK_TIMEOUT))
      throw new Error("Servidor ocupado.");

    const totalLimpio = parseFloat(total);
    if (!totalLimpio || totalLimpio <= 0) throw new Error("Monto inválido.");

    const idCartera = crearCartera_(
      String(idProveedor).trim(),
      String(origenId).trim(),
      totalLimpio,
      CARTERA_CONFIG.TIPOS.CXP,
      parseInt(diasCredito) || 30,
    );

    SpreadsheetApp.flush();
    return { success: true, id: idCartera };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────────────────────────
// TRIGGER DIARIO — PERSISTIR ESTADO VENCIDA EN HOJA
// Configurar: Apps Script → Triggers → actualizarVencimientos → Temporizado → Cada día
// ─────────────────────────────────────────────

/**
 * Recorre la hoja Cartera y persiste el estado VENCIDA en las filas que correspondan.
 * Antes el estado solo se calculaba en memoria → reportes externos veían datos incorrectos.
 * Con este trigger el estado queda guardado en Sheets y es consistente siempre.
 */
function actualizarVencimientos() {
  try {
    const sheet = getSheet(CARTERA_CONFIG.SHEETS.CARTERA);
    const data  = sheet.getDataRange().getValues();
    if (!data || data.length <= 1) return;

    const COL = CARTERA_CONFIG.COLUMNS.CARTERA;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    const actualizaciones = []; // batch: [ { row, nuevoEstado } ]

    for (let i = 1; i < data.length; i++) {
      const estado = String(data[i][COL.estado] || "").trim();
      if (estado === CARTERA_CONFIG.ESTADOS.CANCELADA) continue; // ya cerrada, ignorar

      const saldo = parseFloat(data[i][COL.saldo]) || 0;
      if (saldo <= 0) continue; // sin saldo pendiente, ignorar

      let fVenc = data[i][COL.fecha_vencimiento];
      fVenc = fVenc instanceof Date ? fVenc : new Date(fVenc);
      if (isNaN(fVenc.getTime())) continue; // fecha inválida, ignorar

      fVenc.setHours(0, 0, 0, 0);

      if (fVenc < hoy && estado !== CARTERA_CONFIG.ESTADOS.VENCIDA) {
        actualizaciones.push({ rowIndex: i + 1 });
      }
    }

    // Escritura en batch (una llamada por fila actualizada, mínimas)
    for (const a of actualizaciones) {
      sheet.getRange(a.rowIndex, COL.estado + 1).setValue(CARTERA_CONFIG.ESTADOS.VENCIDA);
    }

    if (actualizaciones.length > 0) {
      SpreadsheetApp.flush();
      Logger.log(`actualizarVencimientos: ${actualizaciones.length} registros marcados como VENCIDA.`);
    }
  } catch (e) {
    Logger.log("ERROR actualizarVencimientos: " + e.toString());
  }
}



function getDashboardCartera() {
  try {
    const hoy       = new Date(); hoy.setHours(0, 0, 0, 0);
    const cartera   = getCartera();

    const cxc       = cartera.filter((c) => c.tipo === CARTERA_CONFIG.TIPOS.CXC);
    const cxp       = cartera.filter((c) => c.tipo === CARTERA_CONFIG.TIPOS.CXP);

    const porCobrar = cxc
      .filter((c) => c.estado !== CARTERA_CONFIG.ESTADOS.CANCELADA)
      .reduce((a, c) => a + c.saldo, 0);

    const porPagar  = cxp
      .filter((c) => c.estado !== CARTERA_CONFIG.ESTADOS.CANCELADA)
      .reduce((a, c) => a + c.saldo, 0);

    const vencidaCxC = cxc
      .filter((c) => c.estado === CARTERA_CONFIG.ESTADOS.VENCIDA)
      .reduce((a, c) => a + c.saldo, 0);

    const vencidaCxP = cxp
      .filter((c) => c.estado === CARTERA_CONFIG.ESTADOS.VENCIDA)
      .reduce((a, c) => a + c.saldo, 0);

    // Alertas: CxC vencidas
    const alertas = cxc
      .filter((c) => c.estado === CARTERA_CONFIG.ESTADOS.VENCIDA)
      .sort((a, b) => b.dias_vencido - a.dias_vencido)
      .slice(0, 10)
      .map((c) => ({
        id_tercero: c.id_tercero,
        saldo:      c.saldo,
        dias:       c.dias_vencido,
        origen:     c.origen_id,
      }));

    return {
      porCobrar,
      porPagar,
      vencidaCxC,
      vencidaCxP,
      alertas,
      totalObligaciones: cxc.length + cxp.length,
    };
  } catch (e) {
    Logger.log("ERROR getDashboardCartera: " + e.toString());
    return { porCobrar: 0, porPagar: 0, vencidaCxC: 0, vencidaCxP: 0, alertas: [], totalObligaciones: 0 };
  }
}

// ─────────────────────────────────────────────
// EXTENSIÓN DEL ANÁLISIS GEMINI
// Reemplaza analizarVentasConGemini() en Codigo.gs
// ─────────────────────────────────────────────

function analizarConGeminiCompleto() {
  try {
    const dashboard        = getDashboard();
    const dashboardCartera = getDashboardCartera();
    const props  = PropertiesService.getScriptProperties();
    const apiKey = (props.getProperty("GEMINI_API_KEY") || "").trim();

    if (!apiKey)
      return { success: false, message: "Configura la API Key de Gemini en las Propiedades del Script." };

    const prompt = `
Eres un asesor experto en negocios pequeños de Latinoamérica. Analiza tanto ventas como cartera.

VENTAS DEL DÍA:
- Total: $${dashboard.ventasHoy}
- Transacciones: ${dashboard.transaccionesHoy}
- Utilidad estimada: $${dashboard.utilidad} (${dashboard.margenPorcentaje}%)

INVENTARIO:
- Unidades en stock: ${dashboard.stockTotal}
- Valor inventario: $${dashboard.valorStock}

CARTERA:
- Por cobrar (CxC): $${dashboardCartera.porCobrar}
- CxC vencida: $${dashboardCartera.vencidaCxC}
- Por pagar a proveedores (CxP): $${dashboardCartera.porPagar}
- CxP vencida: $${dashboardCartera.vencidaCxP}
- Alertas de clientes vencidos: ${JSON.stringify(dashboardCartera.alertas.slice(0, 5))}

PRODUCTOS:
${JSON.stringify(getProductos().slice(0, 15))}

Entrega EXACTAMENTE este formato:

📊 Diagnóstico general (máx 3 líneas):
...

🚀 Recomendaciones inmediatas:
1. [Problema] → [Acción] → [Resultado esperado]
2. ...
3. ...

⚠️ Alertas críticas:
- ...
- ...

💰 Estado de cartera:
- ...
- ...

💡 Oportunidades de mejora:
- ...
- ...

Reglas: sin consejos genéricos, máximo 2 líneas por punto, lenguaje directo y sin tecnicismos.
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const res = UrlFetchApp.fetch(url, {
      method:      "post",
      contentType: "application/json",
      payload:     JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      muteHttpExceptions: true,
    });

    if (res.getResponseCode() === 429)
      return { success: false, message: "Límite de cuota IA. Reintenta en breve." };
    if (res.getResponseCode() !== 200)
      return { success: false, message: "Error de conexión con IA." };

    const json = JSON.parse(res.getContentText());
    return { success: true, analisis: json.candidates[0].content.parts[0].text };
  } catch (e) {
    return { success: false, message: "Error en el servicio de IA." };
  }
}
