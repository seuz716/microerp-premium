// ============================================================================
// CREDIT MANAGEMENT (CARTERA) - Accounts Receivable Module
// ============================================================================

class CarteraManager {
  static crearClienteCredito(nombre, limitCredito) {
    return LockManager.withRetry(() => {
      if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
        throw new AppError("INVALID_INPUT", "Customer name required");
      }
      if (!Validators.isValidPrice(limitCredito)) {
        throw new AppError("INVALID_INPUT", "Credit limit invalid");
      }

      const db = DatabaseManager.getInstance();
      const sheet = db.getSheet(CONFIG.SHEETS.CARTERA);
      const idCliente = 'CLI_' + Date.now();
      const row = [idCliente, nombre.trim(), limitCredito, 0, true];
      sheet.appendRow(row);
      SpreadsheetApp.flush();

      AuditLogger.log('CREDIT_CLIENT_CREATE', { id: idCliente, nombre, limitCredito });
      return ErrorHandler.response('OK', 'Client created', { id: idCliente });
    }, 'crearClienteCredito');
  }

  static registrarFactura(idCliente, items, fechaVencimiento) {
    return LockManager.withRetry(() => {
      if (!Validators.isValidId(idCliente)) {
        throw new AppError("INVALID_INPUT", "Client ID invalid");
      }
      if (!Array.isArray(items) || items.length === 0) {
        throw new AppError("INVALID_INPUT", "Items required");
      }

      let monto = 0;
      items.forEach((item, i) => {
        if (!Validators.isValidPrice(item.precio) || !Validators.isValidStock(item.cantidad)) {
          throw new AppError("INVALID_INPUT", `Item ${i}: invalid`);
        }
        monto += item.precio * item.cantidad;
      });

      const db = DatabaseManager.getInstance();
      const sheetCartera = db.getSheet(CONFIG.SHEETS.CARTERA);
      const sheetFacturas = db.getSheet(CONFIG.SHEETS.FACTURAS);

      const dataCartera = sheetCartera.getDataRange().getValues();
      const COL_CARTERA = CONFIG.COLUMNS.CARTERA;

      let clienteIdx = -1;
      for (let i = 1; i < dataCartera.length; i++) {
        if (String(dataCartera[i][COL_CARTERA.id]).trim() === idCliente) {
          clienteIdx = i;
          break;
        }
      }

      if (clienteIdx === -1) {
        throw new AppError("NOT_FOUND", `Client ${idCliente} not found`);
      }

      const clienteSaldo = parseFloat(dataCartera[clienteIdx][COL_CARTERA.saldo]) || 0;
      const clienteLimite = parseFloat(dataCartera[clienteIdx][COL_CARTERA.limite]) || 0;

      if (clienteSaldo + monto > clienteLimite) {
        throw new AppError("INSUFFICIENT_STOCK", "Credit limit exceeded");
      }

      const idFactura = 'FAC_' + Date.now();
      const fecha = new Date();
      const rowFactura = [idFactura, idCliente, fecha, monto, fechaVencimiento, 'PENDIENTE'];
      sheetFacturas.appendRow(rowFactura);

      dataCartera[clienteIdx][COL_CARTERA.saldo] = clienteSaldo + monto;
      sheetCartera.getRange(clienteIdx + 1, 1, 1, 5).setValues([dataCartera[clienteIdx]]);

      SpreadsheetApp.flush();
      AuditLogger.log('INVOICE_CREATE', { id: idFactura, cliente: idCliente, monto });
      return ErrorHandler.response('OK', 'Invoice created', { id: idFactura, monto });
    }, 'registrarFactura');
  }

  static registrarPago(idFactura, monto) {
    return LockManager.withRetry(() => {
      if (!monto || !Validators.isValidPrice(monto)) {
        throw new AppError("INVALID_INPUT", "Payment invalid");
      }

      const db = DatabaseManager.getInstance();
      const sheetFacturas = db.getSheet(CONFIG.SHEETS.FACTURAS);
      const sheetPagos = db.getSheet(CONFIG.SHEETS.PAGOS);
      const sheetCartera = db.getSheet(CONFIG.SHEETS.CARTERA);

      const dataFacturas = sheetFacturas.getDataRange().getValues();
      const COL_FAC = CONFIG.COLUMNS.FACTURAS;
      const COL_CAR = CONFIG.COLUMNS.CARTERA;

      let facturaIdx = -1;
      let idCliente = null;
      let montoFactura = 0;

      for (let i = 1; i < dataFacturas.length; i++) {
        if (String(dataFacturas[i][COL_FAC.id]).trim() === idFactura) {
          facturaIdx = i;
          idCliente = dataFacturas[i][COL_FAC.idCliente];
          montoFactura = parseFloat(dataFacturas[i][COL_FAC.monto]) || 0;
          break;
        }
      }

      if (facturaIdx === -1) {
        throw new AppError("NOT_FOUND", `Invoice ${idFactura} not found`);
      }

      if (monto > montoFactura) {
        throw new AppError("INVALID_INPUT", `Payment exceeds invoice amount`);
      }

      const idPago = 'PAG_' + Date.now();
      const fecha = new Date();
      sheetPagos.appendRow([idPago, idFactura, monto, fecha]);

      const newMontoFactura = montoFactura - monto;
      dataFacturas[facturaIdx][COL_FAC.monto] = newMontoFactura;
      dataFacturas[facturaIdx][COL_FAC.estado] = newMontoFactura > 0 ? 'PAGADA_PARCIAL' : 'PAGADA';
      sheetFacturas.getRange(facturaIdx + 1, 1, 1, 6).setValues([dataFacturas[facturaIdx]]);

      const dataCartera = sheetCartera.getDataRange().getValues();
      for (let i = 1; i < dataCartera.length; i++) {
        if (String(dataCartera[i][COL_CAR.id]).trim() === idCliente) {
          const saldoActual = parseFloat(dataCartera[i][COL_CAR.saldo]) || 0;
          dataCartera[i][COL_CAR.saldo] = Math.max(0, saldoActual - monto);
          sheetCartera.getRange(i + 1, 1, 1, 5).setValues([dataCartera[i]]);
          break;
        }
      }

      SpreadsheetApp.flush();
      AuditLogger.log('PAYMENT', { id: idPago, factura: idFactura, monto });
      return ErrorHandler.response('OK', 'Payment recorded', { id: idPago });
    }, 'registrarPago');
  }

  static getCarteraStatus() {
    try {
      const db = DatabaseManager.getInstance();
      const sheetCartera = db.getSheet(CONFIG.SHEETS.CARTERA);
      const sheetFacturas = db.getSheet(CONFIG.SHEETS.FACTURAS);

      const dataCartera = sheetCartera.getDataRange().getValues();
      const dataFacturas = sheetFacturas.getDataRange().getValues();

      const COL_CAR = CONFIG.COLUMNS.CARTERA;
      const COL_FAC = CONFIG.COLUMNS.FACTURAS;

      const clientes = [];
      let totalCartera = 0;

      for (let i = 1; i < dataCartera.length; i++) {
        if (!dataCartera[i][COL_CAR.id]) continue;

        clientes.push({
          id: dataCartera[i][COL_CAR.id],
          nombre: dataCartera[i][COL_CAR.nombre],
          limite: parseFloat(dataCartera[i][COL_CAR.limite]) || 0,
          saldo: parseFloat(dataCartera[i][COL_CAR.saldo]) || 0,
          activo: dataCartera[i][COL_CAR.activo],
        });

        totalCartera += parseFloat(dataCartera[i][COL_CAR.saldo]) || 0;
      }

      const invoicesPendientes = [];
      for (let i = 1; i < dataFacturas.length; i++) {
        if (!dataFacturas[i][COL_FAC.id]) continue;
        const estado = String(dataFacturas[i][COL_FAC.estado] || 'PENDIENTE');
        if (estado.includes('PENDIENTE') || estado.includes('PARCIAL')) {
          invoicesPendientes.push({
            id: dataFacturas[i][COL_FAC.id],
            cliente: dataFacturas[i][COL_FAC.idCliente],
            monto: parseFloat(dataFacturas[i][COL_FAC.monto]) || 0,
            vencimiento: dataFacturas[i][COL_FAC.vencimiento],
            estado: estado,
          });
        }
      }

      return ErrorHandler.response('OK', 'Cartera status', {
        clientes,
        totalCartera,
        invoicesPendientes,
        cantidad: clientes.length,
      });
    } catch (e) {
      AuditLogger.log('CARTERA_STATUS_ERROR', { error: e.toString() }, 'ERROR');
      return ErrorHandler.response('DB_ERROR', e.message);
    }
  }

  static deleteClienteCredito(idCliente) {
    return LockManager.withRetry(() => {
      if (!Validators.isValidId(idCliente)) {
        throw new AppError("INVALID_INPUT", "Client ID invalid");
      }

      const db = DatabaseManager.getInstance();
      const sheet = db.getSheet(CONFIG.SHEETS.CARTERA);
      const data = sheet.getDataRange().getValues();
      const COL = CONFIG.COLUMNS.CARTERA;

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][COL.id]).trim() === idCliente) {
          sheet.deleteRow(i + 1);
          SpreadsheetApp.flush();
          AuditLogger.log('CREDIT_CLIENT_DELETE', { id: idCliente });
          return ErrorHandler.response('OK', 'Client deleted');
        }
      }

      throw new AppError("NOT_FOUND", `Client ${idCliente} not found`);
    }, 'deleteClienteCredito');
  }
}

// ============================================================================
// PUBLIC CARTERA APIS
// ============================================================================
function crearClienteCredito(nombre, limitCredito) {
  try {
    return CarteraManager.crearClienteCredito(nombre, limitCredito);
  } catch (e) {
    if (e instanceof AppError) return ErrorHandler.response(e.code, e.message);
    return ErrorHandler.response('DB_ERROR', e.toString());
  }
}

function registrarFactura(idCliente, items, fechaVencimiento) {
  try {
    return CarteraManager.registrarFactura(idCliente, items, fechaVencimiento);
  } catch (e) {
    if (e instanceof AppError) return ErrorHandler.response(e.code, e.message);
    return ErrorHandler.response('DB_ERROR', e.toString());
  }
}

function registrarPago(idFactura, monto) {
  try {
    return CarteraManager.registrarPago(idFactura, monto);
  } catch (e) {
    if (e instanceof AppError) return ErrorHandler.response(e.code, e.message);
    return ErrorHandler.response('DB_ERROR', e.toString());
  }
}

function getCarteraStatus() {
  return CarteraManager.getCarteraStatus();
}

function deleteClienteCredito(idCliente) {
  try {
    return CarteraManager.deleteClienteCredito(idCliente);
  } catch (e) {
    if (e instanceof AppError) return ErrorHandler.response(e.code, e.message);
    return ErrorHandler.response('DB_ERROR', e.toString());
  }
}
