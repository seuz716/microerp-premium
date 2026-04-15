// ============================================================================
// FINANCEMANAGER v4.0 - Gestión de Flujo de Caja, Fiados, Pagos Digitales
// ============================================================================
// Dependencias: DatabaseManager, LockManager, AuditLogger, ErrorHandler, Validators
// Sheets: Finanzas, FiadosVencidos, Cartera (existente)
// API: Twilio WhatsApp (opcional pero recomendado)

const FINANCE_CONFIG = {
  SHEETS: {
    FINANZAS: 'Finanzas',
    FIADOS_VENCIDOS: 'FiadosVencidos',
  },
  COLUMNS: {
    FINANZAS: {
      ID: 0, TIPO: 1, MONTO: 2, FECHA: 3, CONCEPTO: 4, METODO: 5, USUARIO: 6
    },
    FIADOS_VENCIDOS: {
      ID: 0, ID_CLIENTE: 1, MONTO: 2, FECHA_VENCIMIENTO: 3, ESTADO: 4, NUMERO_WA: 5
    }
  },
  TIPOS: ['Ingreso', 'Egreso', 'Pago_Fiado'],
  METODOS_PAGO: ['Efectivo', 'Yape', 'Plin', 'Transferencia', 'Cheque'],
  LIMITE_FIADO_DEFAULT: 1000000, // $1M
  DIAS_ALERTA_VENCIMIENTO: 3,
  TWILIO_CONFIG: {
    ACCOUNT_SID: '', // Mover a PropertiesService
    AUTH_TOKEN: '', // Mover a PropertiesService
    NUMERO_SANDBOX: '+15017250902'
  }
};

// ============================================================================
// CLASSE: FinanceManager
// ============================================================================
class FinanceManager {
  static #instance = null;

  static getInstance() {
    if (!FinanceManager.#instance) {
      FinanceManager.#instance = new FinanceManager();
    }
    return FinanceManager.#instance;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTRAR MOVIMIENTO FINANCIERO
  // ─────────────────────────────────────────────────────────────────────────
  static registrarMovimiento(tipo, monto, concepto, metodo = 'Efectivo') {
    return LockManager.withRetry(() => {
      if (!FINANCE_CONFIG.TIPOS.includes(tipo)) {
        throw new AppError('INVALID_INPUT', `Tipo inválido: ${tipo}`);
      }

      if (!Validators.isValidPrice(monto)) {
        throw new AppError('INVALID_INPUT', 'Monto invalido');
      }

      const db = DatabaseManager.getInstance();
      const sheet = db.getSheet(FINANCE_CONFIG.SHEETS.FINANZAS);

      const nuevoRegistro = [
        'FIN_' + Date.now(),
        tipo,
        monto,
        new Date(),
        concepto,
        metodo,
        Session.getActiveUser().getEmail()
      ];

      sheet.appendRow(nuevoRegistro);

      AuditLogger.log('FINANCE_MOVEMENT', `${tipo} de $${monto}`, { concepto, metodo });

      return {
        success: true,
        id: nuevoRegistro[0],
        monto: monto,
        tipo: tipo
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTRAR FIADO (Crédito informal)
  // ─────────────────────────────────────────────────────────────────────────
  static registrarFiado(idCliente, monto, concepto, numeroWA = null) {
    return LockManager.withRetry(() => {
      if (!Validators.isValidId(idCliente)) {
        throw new AppError('INVALID_INPUT', 'ID cliente inválido');
      }

      if (!Validators.isValidPrice(monto)) {
        throw new AppError('INVALID_INPUT', 'Monto inválido');
      }

      const db = DatabaseManager.getInstance();
      
      // Validar límite de fiado en Cartera
      const carteraSheet = db.getSheet('Cartera');
      const clientes = carteraSheet.getDataRange().getValues();
      const cliente = clientes.find(row => row[0] === idCliente);

      if (cliente) {
        const limiteActual = cliente[1]; // Límite
        const saldoActual = cliente[2]; // Saldo
        
        if (saldoActual + monto > limiteActual) {
          throw new AppError('LIMIT_EXCEEDED', 
            `Límite de fiado $${limiteActual} superado. Saldo actual: $${saldoActual}`
          );
        }
      }

      // Guardar en FiadosVencidos
      const fiadosSheet = db.getSheet(FINANCE_CONFIG.SHEETS.FIADOS_VENCIDOS);
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 30); // 30 días

      const nuevoFiado = [
        'FIADO_' + Date.now(),
        idCliente,
        monto,
        fechaVencimiento,
        'Pendiente',
        numeroWA || ''
      ];

      fiadosSheet.appendRow(nuevoFiado);

      // Registrar como ingreso en Finanzas
      this.registrarMovimiento('Ingreso', monto, `Fiado: ${concepto}`, 'Fiado');

      // Enviar WhatsApp si número disponible
      if (numeroWA) {
        this.enviarAlertaFiadoCreado(numeroWA, monto, fechaVencimiento);
      }

      AuditLogger.log('FIADO_CREATED', `Fiado $${monto} a ${idCliente}`, { concepto, numeroWA });

      return {
        success: true,
        id: nuevoFiado[0],
        cliente: idCliente,
        monto: monto,
        fechaVencimiento: fechaVencimiento,
        mensaje: 'Fiado registrado correctamente'
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTRAR PAGO DE FIADO
  // ─────────────────────────────────────────────────────────────────────────
  static registrarPagoFiado(idFiado, monto, metodo = 'Efectivo') {
    return LockManager.withRetry(() => {
      if (!Validators.isValidPrice(monto)) {
        throw new AppError('INVALID_INPUT', 'Monto inválido');
      }

      const db = DatabaseManager.getInstance();
      const fiadosSheet = db.getSheet(FINANCE_CONFIG.SHEETS.FIADOS_VENCIDOS);
      const fiados = fiadosSheet.getDataRange().getValues();

      const fiadoIndex = fiados.findIndex(row => row[0] === idFiado);
      if (fiadoIndex === -1) {
        throw new AppError('NOT_FOUND', `Fiado ${idFiado} no encontrado`);
      }

      const fiado = fiados[fiadoIndex];
      const montoRestante = fiado[2];

      if (monto > montoRestante) {
        throw new AppError('INVALID_INPUT', 
          `Monto $${monto} supera fiado pendiente $${montoRestante}`
        );
      }

      // Actualizar estado
      const nuevoEstado = monto >= montoRestante ? 'Pagado' : 'Pagado_Parcial';
      fiadosSheet.getRange(fiadoIndex + 1, 5).setValue(nuevoEstado); // Estado

      // Registrar como egreso
      this.registrarMovimiento('Egreso', monto, `Pago fiado: ${idFiado}`, metodo);

      // Registrar en Pagos sheet (si existe)
      const pagosSheet = db.getSheet('Pagos');
      if (pagosSheet) {
        pagosSheet.appendRow([
          'PAG_' + Date.now(),
          idFiado,
          monto,
          new Date(),
          metodo,
          nuevoEstado
        ]);
      }

      AuditLogger.log('FIADO_PAID', `Pago $${monto} de ${idFiado}`, { metodo, estado: nuevoEstado });

      return {
        success: true,
        fiado: idFiado,
        montoPagado: monto,
        nuevoEstado: nuevoEstado,
        montoRestante: montoRestante - monto
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTRAR PAGO CON BILLETERA DIGITAL (Yape, Plin)
  // ─────────────────────────────────────────────────────────────────────────
  static registrarPagoDigital(idCliente, monto, billetera = 'Yape', numeroWA = null) {
    return LockManager.withRetry(() => {
      if (!['Yape', 'Plin'].includes(billetera)) {
        throw new AppError('INVALID_INPUT', 'Billetera inválida');
      }

      if (!Validators.isValidPrice(monto)) {
        throw new AppError('INVALID_INPUT', 'Monto inválido');
      }

      // Registrar movimiento
      this.registrarMovimiento('Ingreso', monto, `Pago ${billetera} de ${idCliente}`, billetera);

      // Generar QR de pago dinámico
      const qrPago = this.generarQRPago(idCliente, monto, billetera);

      // Enviar WhatsApp con QR
      if (numeroWA) {
        this.enviarQRPago(numeroWA, monto, billetera, qrPago);
      }

      AuditLogger.log('DIGITAL_PAYMENT', `${billetera} de $${monto}`, { cliente: idCliente, qr: qrPago });

      return {
        success: true,
        cliente: idCliente,
        monto: monto,
        billetera: billetera,
        qrPago: qrPago,
        timestamp: new Date()
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD DE FLUJO DE CAJA
  // ─────────────────────────────────────────────────────────────────────────
  static getFlujoCaja(dias = 30) {
    try {
      const db = DatabaseManager.getInstance();
      const finanzasSheet = db.getSheet(FINANCE_CONFIG.SHEETS.FINANZAS);
      const movimientos = finanzasSheet.getDataRange().getValues();

      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() - dias);

      let totalIngresos = 0;
      let totalEgresos = 0;

      movimientos.forEach(row => {
        const fecha = new Date(row[3]);
        if (fecha >= fechaLimite) {
          const monto = parseFloat(row[2]) || 0;
          if (row[1] === 'Ingreso') totalIngresos += monto;
          else if (row[1] === 'Egreso') totalEgresos += monto;
        }
      });

      const neto = totalIngresos - totalEgresos;

      // Semáforo: Verde (>100k), Amarillo (0-100k), Rojo (<0)
      let semaforo = 'rojo'; // #ef4444
      if (neto > 100000) semaforo = 'verde'; // #10b981
      else if (neto >= 0) semaforo = 'amarillo'; // #f59e0b

      return {
        periodo_dias: dias,
        totalIngresos: totalIngresos,
        totalEgresos: totalEgresos,
        neto: neto,
        porcentajeMargen: totalIngresos > 0 ? ((neto / totalIngresos) * 100).toFixed(2) : 0,
        semaforo: semaforo,
        alertas: this.generarAlertas(neto, totalIngresos)
      };
    } catch (err) {
      AuditLogger.log('FLUJO_CAJA_ERROR', err.message, {});
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIADOS PRÓXIMOS A VENCER
  // ─────────────────────────────────────────────────────────────────────────
  static getFiadosProximosAVencer() {
    try {
      const db = DatabaseManager.getInstance();
      const fiadosSheet = db.getSheet(FINANCE_CONFIG.SHEETS.FIADOS_VENCIDOS);
      const fiados = fiadosSheet.getDataRange().getValues();

      const hoy = new Date();
      const diasAlerta = FINANCE_CONFIG.DIAS_ALERTA_VENCIMIENTO;
      const proximasFechas = [];

      fiados.forEach(row => {
        if (row[4] !== 'Pagado') { // Si no está pagado
          const fechaVencimiento = new Date(row[3]);
          const diasRestantes = Math.floor((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24));

          if (diasRestantes <= diasAlerta && diasRestantes >= 0) {
            proximasFechas.push({
              id: row[0],
              cliente: row[1],
              monto: row[2],
              diasRestantes: diasRestantes,
              estado: row[4],
              numeroWA: row[5],
              urgencia: diasRestantes === 0 ? 'Vencida' : `${diasRestantes} días`
            });
          }
        }
      });

      return {
        cantidad: proximasFechas.length,
        montoTotal: proximasFechas.reduce((sum, f) => sum + f.monto, 0),
        fiados: proximasFechas.sort((a, b) => a.diasRestantes - b.diasRestantes)
      };
    } catch (err) {
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILIDADES PRIVADAS
  // ─────────────────────────────────────────────────────────────────────────

  static generarAlertas(neto, totalIngresos) {
    const alertas = [];

    if (neto < 0) {
      alertas.push({ tipo: 'error', mensaje: '🔴 FLUJO NEGATIVO - Egresos > Ingresos' });
    }
    if (neto > 0 && neto < 50000) {
      alertas.push({ tipo: 'warning', mensaje: '⚠️ Flujo bajo - Monitorear gastos' });
    }
    if (totalIngresos > 500000) {
      alertas.push({ tipo: 'info', mensaje: '✅ Excelente volumen de ingresos' });
    }

    return alertas;
  }

  static generarQRPago(idCliente, monto, billetera) {
    // Generar datos para QR dinámico
    const data = `MicroERP|${billetera}|${monto}|${idCliente}|${Date.now()}`;
    const qrUrl = `http://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}`;
    return qrUrl;
  }

  static enviarAlertaFiadoCreado(numeroWA, monto, fechaVencimiento) {
    // TODO: Integrar Twilio WhatsApp API
    // Aquí iría la lógica de envío real
    // Por ahora, solo log
    AuditLogger.log('WHATSAPP_ALERT', `Alerta fiado enviada a ${numeroWA}`, { monto, fechaVencimiento });
  }

  static enviarQRPago(numeroWA, monto, billetera, qrUrl) {
    // TODO: Integrar Twilio WhatsApp con imagen QR
    AuditLogger.log('PAYMENT_QR_SENT', `QR ${billetera} enviado a ${numeroWA}`, { monto, qrUrl });
  }
}

// ============================================================================
// APIS PÚBLICAS - FinanceManager
// ============================================================================

function registrarMovimiento(tipo, monto, concepto, metodo = 'Efectivo') {
  return ErrorHandler.response(() => 
    FinanceManager.getInstance().constructor.registrarMovimiento(tipo, monto, concepto, metodo)
  );
}

function registrarFiado(idCliente, monto, concepto, numeroWA = null) {
  return ErrorHandler.response(() => 
    FinanceManager.getInstance().constructor.registrarFiado(idCliente, monto, concepto, numeroWA)
  );
}

function registrarPagoFiado(idFiado, monto, metodo = 'Efectivo') {
  return ErrorHandler.response(() => 
    FinanceManager.getInstance().constructor.registrarPagoFiado(idFiado, monto, metodo)
  );
}

function registrarPagoDigital(idCliente, monto, billetera = 'Yape') {
  return ErrorHandler.response(() => 
    FinanceManager.getInstance().constructor.registrarPagoDigital(idCliente, monto, billetera)
  );
}

function getFlujoCaja(dias = 30) {
  return ErrorHandler.response(() => 
    FinanceManager.getInstance().constructor.getFlujoCaja(dias)
  );
}

function getFiadosProximosAVencer() {
  return ErrorHandler.response(() => 
    FinanceManager.getInstance().constructor.getFiadosProximosAVencer()
  );
}

// ============================================================================
// SETUP - Crear sheets automáticamente si no existen
// ============================================================================

function setupFinanceManager() {
  const db = DatabaseManager.getInstance();
  
  // Crear Finanzas sheet
  try {
    db.getSheet(FINANCE_CONFIG.SHEETS.FINANZAS);
  } catch (e) {
    const finanzasSheet = DatabaseManager.spreadsheet.insertSheet(FINANCE_CONFIG.SHEETS.FINANZAS);
    finanzasSheet.appendRow(['ID', 'Tipo', 'Monto', 'Fecha', 'Concepto', 'Método', 'Usuario']);
  }

  // Crear FiadosVencidos sheet
  try {
    db.getSheet(FINANCE_CONFIG.SHEETS.FIADOS_VENCIDOS);
  } catch (e) {
    const fiadosSheet = DatabaseManager.spreadsheet.insertSheet(FINANCE_CONFIG.SHEETS.FIADOS_VENCIDOS);
    fiadosSheet.appendRow(['ID', 'ID_Cliente', 'Monto', 'FechaVencimiento', 'Estado', 'NumeroWA']);
  }
}
