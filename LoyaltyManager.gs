// ============================================================================
// LOYALTYMANAGER v4.0 - Programa de Puntos, Tickets QR, Fidelización
// ============================================================================
// Dependencias: DatabaseManager, LockManager, AuditLogger, ErrorHandler, Validators
// Sheets: Loyalty, TicketsQR
// API: Google Drive (para almacenar QR), Google Charts (visualizar)

const LOYALTY_CONFIG = {
  SHEETS: {
    LOYALTY: 'Loyalty',
    TICKETS_QR: 'TicketsQR',
  },
  COLUMNS: {
    LOYALTY: {
      ID: 0, NOMBRE: 1, EMAIL: 2, NUMERO: 3, PUNTOS: 4, NIVEL: 5, FECHA_REGISTRO: 6
    },
    TICKETS_QR: {
      ID: 0, ID_VENTA: 1, QR_URL: 2, FECHA_GENERADO: 3, CANJEADO: 4, TIMESTAMP: 5
    }
  },
  PUNTOS: {
    POR_PESO: 1, // 1 punto por $1 gastado
    CANJE_RATIO: 100, // 100 puntos = $5 descuento
    DESCUENTO_CANJE: 5
  },
  NIVELES: {
    BRONZE: { nombre: 'Bronze', minPuntos: 0, descuentoAdicional: 0 },
    SILVER: { nombre: 'Silver', minPuntos: 500, descuentoAdicional: 1 },
    GOLD: { nombre: 'Gold', minPuntos: 2000, descuentoAdicional: 2 },
    PLATINUM: { nombre: 'Platinum', minPuntos: 5000, descuentoAdicional: 5 }
  },
  QR_EXPIRY_HORAS: 24,
  GOOGLE_DRIVE_FOLDER: 'MicroERP_QR_Tickets' // Crear si no existe
};

// ============================================================================
// CLASSE: LoyaltyManager
// ============================================================================
class LoyaltyManager {
  static #instance = null;

  static getInstance() {
    if (!LoyaltyManager.#instance) {
      LoyaltyManager.#instance = new LoyaltyManager();
    }
    return LoyaltyManager.#instance;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTRAR CLIENTE EN PROGRAMA DE FIDELIZACIÓN
  // ─────────────────────────────────────────────────────────────────────────
  static crearClienteLoyalty(nombre, email, numero) {
    return LockManager.withRetry(() => {
      if (!Validators.isValidName(nombre)) {
        throw new AppError('INVALID_INPUT', 'Nombre inválido');
      }

      if (!numero || numero.length < 7) {
        throw new AppError('INVALID_INPUT', 'Número de teléfono inválido');
      }

      const db = DatabaseManager.getInstance();
      const loyaltySheet = db.getSheet(LOYALTY_CONFIG.SHEETS.LOYALTY);

      const nuevoCliente = [
        'LOYALTY_' + Date.now(),
        nombre,
        email,
        numero,
        0, // Puntos iniciales
        'Bronze', // Nivel inicial
        new Date()
      ];

      loyaltySheet.appendRow(nuevoCliente);

      AuditLogger.log('LOYALTY_CLIENT_CREATED', `Cliente ${nombre} registrado`, { numero, email });

      return {
        success: true,
        id: nuevoCliente[0],
        cliente: nombre,
        puntos: 0,
        nivel: 'Bronze',
        mensaje: `Bienvenido ${nombre}! Comenzaste con 0 puntos. Acumula 1 punto por cada $1`
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACUMULAR PUNTOS POR COMPRA
  // ─────────────────────────────────────────────────────────────────────────
  static acumularPuntos(idCliente, montoVenta) {
    return LockManager.withRetry(() => {
      if (!Validators.isValidPrice(montoVenta)) {
        throw new AppError('INVALID_INPUT', 'Monto inválido');
      }

      const db = DatabaseManager.getInstance();
      const loyaltySheet = db.getSheet(LOYALTY_CONFIG.SHEETS.LOYALTY);
      const clientes = loyaltySheet.getDataRange().getValues();

      const clienteIndex = clientes.findIndex(row => row[0] === idCliente);
      if (clienteIndex === -1) {
        throw new AppError('NOT_FOUND', `Cliente ${idCliente} no registrado en programa`);
      }

      const cliente = clientes[clienteIndex];
      const puntosAcumulados = Math.floor(montoVenta * LOYALTY_CONFIG.PUNTOS.POR_PESO);
      const nuevosPuntos = (parseInt(cliente[4]) || 0) + puntosAcumulados;

      // Actualizar puntos
      loyaltySheet.getRange(clienteIndex + 1, 5).setValue(nuevosPuntos);

      // Calcular nuevo nivel
      const nuevoNivel = this.calcularNivel(nuevosPuntos);
      loyaltySheet.getRange(clienteIndex + 1, 6).setValue(nuevoNivel);

      // Calcular bonus por nivel
      const bonusDescuento = LOYALTY_CONFIG.NIVELES[nuevoNivel]?.descuentoAdicional || 0;

      AuditLogger.log('LOYALTY_EARNED', `${puntosAcumulados} puntos acumulados a ${idCliente}`, 
        { nuevosPuntos, nivel: nuevoNivel, bonusDescuento }
      );

      return {
        success: true,
        cliente: idCliente,
        puntosGanados: puntosAcumulados,
        puntosTotal: nuevosPuntos,
        nivelAnterior: cliente[5],
        nivelActual: nuevoNivel,
        bonusDescuento: bonusDescuento,
        promocion: bonusDescuento > 0 ? `¡Felicidades! Subiste a ${nuevoNivel} (+${bonusDescuento}% descuento)` : null
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CANJE DE PUNTOS POR DESCUENTO
  // ─────────────────────────────────────────────────────────────────────────
  static canjearPuntos(idCliente, puntosUsados) {
    return LockManager.withRetry(() => {
      if (!Number.isInteger(puntosUsados) || puntosUsados < 100) {
        throw new AppError('INVALID_INPUT', 'Mínimo 100 puntos para canjear');
      }

      const db = DatabaseManager.getInstance();
      const loyaltySheet = db.getSheet(LOYALTY_CONFIG.SHEETS.LOYALTY);
      const clientes = loyaltySheet.getDataRange().getValues();

      const clienteIndex = clientes.findIndex(row => row[0] === idCliente);
      if (clienteIndex === -1) {
        throw new AppError('NOT_FOUND', 'Cliente no registrado');
      }

      const cliente = clientes[clienteIndex];
      const puntosActuales = parseInt(cliente[4]) || 0;

      if (puntosActuales < puntosUsados) {
        throw new AppError('INSUFFICIENT_POINTS', 
          `Tienes ${puntosActuales} puntos. Necesitas ${puntosUsados}`
        );
      }

      // Calcular descuento
      const descuentoMonto = (puntosUsados / LOYALTY_CONFIG.PUNTOS.CANJE_RATIO) * LOYALTY_CONFIG.PUNTOS.DESCUENTO_CANJE;

      // Reducir puntos
      const nuevosPuntos = puntosActuales - puntosUsados;
      loyaltySheet.getRange(clienteIndex + 1, 5).setValue(nuevosPuntos);

      AuditLogger.log('LOYALTY_REDEEMED', `${puntosUsados} puntos canjeados`, 
        { cliente: cliente[1], descuentoMonto, puntosRestantes: nuevosPuntos }
      );

      return {
        success: true,
        cliente: idCliente,
        puntosUsados: puntosUsados,
        descuentoMonto: descuentoMonto,
        puntosRestantes: nuevosPuntos,
        codigoCupon: 'CUPON_' + Date.now(),
        validez: '24h'
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GENERAR TICKET QR DIGITAL
  // ─────────────────────────────────────────────────────────────────────────
  static generarTicketQR(idVenta, detalles = {}) {
    return LockManager.withRetry(() => {
      const db = DatabaseManager.getInstance();

      // Generar datos para QR
      const qrData = {
        idVenta: idVenta,
        monto: detalles.monto || 0,
        items: detalles.items || [],
        timestamp: new Date().toISOString()
      };

      // Crear URL del QR (usando API gratuita)
      const qrDataJson = encodeURIComponent(JSON.stringify(qrData));
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${qrDataJson}`;

      // Guardar en TicketsQR sheet
      const ticketsSheet = db.getSheet(LOYALTY_CONFIG.SHEETS.TICKETS_QR);
      const nuevoTicket = [
        'TICKET_' + Date.now(),
        idVenta,
        qrUrl,
        new Date(),
        false, // Canjeado
        Date.now()
      ];

      ticketsSheet.appendRow(nuevoTicket);

      // Generar URL amigable para compartir por WhatsApp/SMS
      const linkDescarga = `https://script.google.com/macros/d/SCRIPT_ID/usercontent?venta=${idVenta}&mode=qr`;

      AuditLogger.log('QR_TICKET_GENERATED', `Ticket QR para venta ${idVenta}`, { qrUrl });

      return {
        success: true,
        idTicket: nuevoTicket[0],
        idVenta: idVenta,
        qrUrl: qrUrl,
        linkCompartir: linkDescarga,
        mensaje: `Tu ticket: ${linkDescarga}`,
        formato: 'Comparte por WhatsApp o SMS',
        duracionHoras: LOYALTY_CONFIG.QR_EXPIRY_HORAS
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD DE CLIENTE LOYALTY
  // ─────────────────────────────────────────────────────────────────────────
  static getClienteLoyalty(idCliente) {
    try {
      const db = DatabaseManager.getInstance();
      const loyaltySheet = db.getSheet(LOYALTY_CONFIG.SHEETS.LOYALTY);
      const clientes = loyaltySheet.getDataRange().getValues();

      const cliente = clientes.find(row => row[0] === idCliente);
      if (!cliente) {
        throw new AppError('NOT_FOUND', 'Cliente no encontrado');
      }

      const puntos = parseInt(cliente[4]) || 0;
      const nivel = cliente[5];
      const puntosProximoNivel = this.calcularPuntosProximoNivel(puntos);

      return {
        id: cliente[0],
        nombre: cliente[1],
        numero: cliente[3],
        puntos: puntos,
        nivel: nivel,
        descuentoActual: LOYALTY_CONFIG.NIVELES[nivel]?.descuentoAdicional || 0,
        puntosProximoNivel: puntosProximoNivel,
        porcentajeProgreso: puntosProximoNivel > 0 
          ? ((puntos / puntosProximoNivel) * 100).toFixed(0) 
          : 100,
        proximos_beneficios: this.generarBeneficiosProximo(nivel),
        descuentoCanjeDisponible: Math.floor(puntos / LOYALTY_CONFIG.PUNTOS.CANJE_RATIO) * LOYALTY_CONFIG.PUNTOS.DESCUENTO_CANJE,
        fechaRegistro: cliente[6],
        resumen: `${cliente[1]}, eres miembro ${nivel} con ${puntos} puntos. Próximo nivel: ${puntosProximoNivel}`
      };
    } catch (err) {
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RANKING DE CLIENTES TOP
  // ─────────────────────────────────────────────────────────────────────────
  static getRankingClientesTop(limite = 10) {
    try {
      const db = DatabaseManager.getInstance();
      const loyaltySheet = db.getSheet(LOYALTY_CONFIG.SHEETS.LOYALTY);
      const clientes = loyaltySheet.getDataRange().getValues();

      const ranking = clientes
        .filter((c, idx) => idx > 0) // Skip header
        .map(c => ({
          nombre: c[1],
          numero: c[3],
          puntos: parseInt(c[4]) || 0,
          nivel: c[5],
          descuento: LOYALTY_CONFIG.NIVELES[c[5]]?.descuentoAdicional || 0
        }))
        .sort((a, b) => b.puntos - a.puntos)
        .slice(0, limite);

      return {
        cantidadTop: ranking.length,
        ranking: ranking.map((c, idx) => ({ ...c, posicion: idx + 1 }))
      };
    } catch (err) {
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILIDADES PRIVADAS
  // ─────────────────────────────────────────────────────────────────────────

  static calcularNivel(puntos) {
    const niveles = ['Platinum', 'Gold', 'Silver', 'Bronze'];
    for (const nivel of niveles) {
      if (puntos >= LOYALTY_CONFIG.NIVELES[nivel].minPuntos) {
        return nivel;
      }
    }
    return 'Bronze';
  }

  static calcularPuntosProximoNivel(puntos) {
    const niveles = [
      { name: 'Platinum', min: 5000 },
      { name: 'Gold', min: 2000 },
      { name: 'Silver', min: 500 },
      { name: 'Bronze', min: 0 }
    ];

    for (const nivel of niveles) {
      if (puntos < nivel.min) {
        // Encontrar el siguiente nivel
        const siguienteLevelMin = niveles[niveles.indexOf(nivel) - 1]?.min || nivel.min;
        return siguienteLevelMin;
      }
    }
    return 5000; // Platinum
  }

  static generarBeneficiosProximo(nivelActual) {
    const beneficios = {
      Bronze: ['Acceso a programa', 'Recibe 1 punto por $1', 'Promociones especiales'],
      Silver: ['Todo Bronze +', '2% descuento adicional', 'Cumpleaños: $50 regalo'],
      Gold: ['Todo Silver +', '3% descuento adicional', 'Envío gratis', 'Acceso VIP a ofertas'],
      Platinum: ['Todo Gold +', '5% descuento adicional', 'Asistencia prioritaria', 'Eventos exclusivos']
    };

    const proximos = {
      Bronze: 'Silver en 500 puntos',
      Silver: 'Gold en 2000 puntos',
      Gold: 'Platinum en 5000 puntos',
      Platinum: 'Ya eres nivel máximo! 👑'
    };

    return {
      beneficios_actuales: beneficios[nivelActual] || [],
      proximo_nivel: proximos[nivelActual] || 'Desconocido'
    };
  }
}

// ============================================================================
// APIS PÚBLICAS - LoyaltyManager
// ============================================================================

function crearClienteLoyalty(nombre, email, numero) {
  return ErrorHandler.response(() => 
    LoyaltyManager.getInstance().constructor.crearClienteLoyalty(nombre, email, numero)
  );
}

function acumularPuntos(idCliente, montoVenta) {
  return ErrorHandler.response(() => 
    LoyaltyManager.getInstance().constructor.acumularPuntos(idCliente, montoVenta)
  );
}

function canjearPuntos(idCliente, puntosUsados) {
  return ErrorHandler.response(() => 
    LoyaltyManager.getInstance().constructor.canjearPuntos(idCliente, puntosUsados)
  );
}

function generarTicketQR(idVenta, detalles = {}) {
  return ErrorHandler.response(() => 
    LoyaltyManager.getInstance().constructor.generarTicketQR(idVenta, detalles)
  );
}

function getClienteLoyalty(idCliente) {
  return ErrorHandler.response(() => 
    LoyaltyManager.getInstance().constructor.getClienteLoyalty(idCliente)
  );
}

function getRankingClientesTop(limite = 10) {
  return ErrorHandler.response(() => 
    LoyaltyManager.getInstance().constructor.getRankingClientesTop(limite)
  );
}

// ============================================================================
// SETUP - Crear sheets automáticamente si no existen
// ============================================================================

function setupLoyaltyManager() {
  const db = DatabaseManager.getInstance();

  // Crear Loyalty sheet
  try {
    db.getSheet(LOYALTY_CONFIG.SHEETS.LOYALTY);
  } catch (e) {
    const loyaltySheet = DatabaseManager.spreadsheet.insertSheet(LOYALTY_CONFIG.SHEETS.LOYALTY);
    loyaltySheet.appendRow(['ID', 'Nombre', 'Email', 'Número', 'Puntos', 'Nivel', 'FechaRegistro']);
  }

  // Crear TicketsQR sheet
  try {
    db.getSheet(LOYALTY_CONFIG.SHEETS.TICKETS_QR);
  } catch (e) {
    const ticketsSheet = DatabaseManager.spreadsheet.insertSheet(LOYALTY_CONFIG.SHEETS.TICKETS_QR);
    ticketsSheet.appendRow(['ID', 'ID_Venta', 'QR_URL', 'FechaGenerado', 'Canjeado', 'Timestamp']);
  }
}
