// ============================================================================
// PURCHASEINTELLIGENCE v4.0 - Compras Inteligentes, Vencimientos, Pedidos Auto
// ============================================================================
// Dependencias: DatabaseManager, LockManager, AuditLogger, ErrorHandler, Validators
// Sheets: PedidosSugeridos, ControlVencimientos, Productos, Entradas

const PURCHASE_CONFIG = {
  SHEETS: {
    PEDIDOS_SUGERIDOS: 'PedidosSugeridos',
    CONTROL_VENCIMIENTOS: 'ControlVencimientos',
  },
  COLUMNS: {
    PEDIDOS_SUGERIDOS: {
      ID: 0, ID_PRODUCTO: 1, CANTIDAD: 2, FECHA_SUGERENCIA: 3, ESTADO: 4, COSTO_ESTIMADO: 5
    },
    CONTROL_VENCIMIENTOS: {
      ID: 0, ID_PRODUCTO: 1, NOMBRE: 2, FECHA_EXPIRY: 3, DIAS_PENDIENTES: 4, PROMOCION: 5
    }
  },
  DIAS_MINIMOS_STOCK: 7, // Sugerir compra si stock < promedio × 7 días
  DIAS_ALERTA_VENCIMIENTO: 15, // Alertar si < 15 días
  ANALISIS_PERIODO_DIAS: 30 // Analizar últimos 30 días para tendencias
};

// ============================================================================
// CLASSE: PurchaseIntelligence
// ============================================================================
class PurchaseIntelligence {
  static #instance = null;

  static getInstance() {
    if (!PurchaseIntelligence.#instance) {
      PurchaseIntelligence.#instance = new PurchaseIntelligence();
    }
    return PurchaseIntelligence.#instance;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUGERIR PEDIDOS AUTOMÁTICOS
  // ─────────────────────────────────────────────────────────────────────────
  static sugerirPedidos() {
    try {
      const db = DatabaseManager.getInstance();

      // Obtener productos
      const productosSheet = db.getSheet('Productos');
      const productos = productosSheet.getDataRange().getValues();

      // Obtener ventas últimas 30 días
      const ventasSheet = db.getSheet('Detalle_Ventas');
      const ventas = ventasSheet.getDataRange().getValues();

      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() - PURCHASE_CONFIG.ANALISIS_PERIODO_DIAS);

      const sugerencias = [];

      productos.forEach((producto, idx) => {
        if (idx === 0) return; // Skip header

        const idProducto = producto[0]; // ID
        const stockActual = parseInt(producto[2]) || 0; // Stock
        const nombre = producto[1]; // Nombre

        // Calcular promedio diario de ventas
        const ventasProducto = ventas.filter(v => {
          if (v[1] !== idProducto) return false; // ID_Producto
          const fecha = new Date(v[3]); // Fecha si existe
          return fecha >= fechaLimite;
        });

        const cantidadTotalVendida = ventasProducto.reduce((sum, v) => sum + (parseInt(v[2]) || 0), 0);
        const promedioDiario = cantidadTotalVendida / PURCHASE_CONFIG.ANALISIS_PERIODO_DIAS;
        const stockRecomendado = promedioDiario * PURCHASE_CONFIG.DIAS_MINIMOS_STOCK;

        // Si stock < recomendado → sugerir compra
        if (stockActual < stockRecomendado && promedioDiario > 0) {
          const cantidadPedida = Math.ceil(stockRecomendado * 1.5); // Comprar 1.5x recomendado
          
          sugerencias.push({
            id: 'SUGER_' + Date.now() + '_' + idProducto,
            idProducto: idProducto,
            nombre: nombre,
            stockActual: stockActual,
            promedioDiario: promedioDiario.toFixed(2),
            stockRecomendado: Math.ceil(stockRecomendado),
            cantidadSugerida: cantidadPedida,
            urgencia: stockActual === 0 ? 'CRÍTICA' : (stockActual < promedioDiario * 3 ? 'ALTA' : 'NORMAL'),
            timestamp: new Date()
          });
        }
      });

      // Guardar sugerencias en sheet
      if (sugerencias.length > 0) {
        const sugerenciasSheet = db.getSheet(PURCHASE_CONFIG.SHEETS.PEDIDOS_SUGERIDOS);
        sugerencias.forEach(s => {
          sugerenciasSheet.appendRow([
            s.id,
            s.idProducto,
            s.cantidadSugerida,
            s.timestamp,
            'Pendiente',
            s.cantidadSugerida * 5000 // Costo estimado (placeholder)
          ]);
        });
      }

      AuditLogger.log('PURCHASE_SUGGEST', `${sugerencias.length} sugerencias generadas`, {});

      return {
        cantidad_sugerencias: sugerencias.length,
        sugerencias: sugerencias.sort((a, b) => {
          // Ordenar por urgencia
          const urgenciaOrder = { 'CRÍTICA': 0, 'ALTA': 1, 'NORMAL': 2 };
          return urgenciaOrder[a.urgencia] - urgenciaOrder[b.urgencia];
        }),
        monto_estimado: sugerencias.reduce((sum, s) => sum + (s.cantidadSugerida * 5000), 0)
      };
    } catch (err) {
      AuditLogger.log('PURCHASE_ERROR', err.message, {});
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DETECCIÓN DE PRÓXIMOS A EXPIRAR
  // ─────────────────────────────────────────────────────────────────────────
  static detectarProximasAExpirar() {
    try {
      const db = DatabaseManager.getInstance();
      
      // Obtener entradas (tiene fecha de expiración)
      const entradasSheet = db.getSheet('Entradas');
      const entradas = entradasSheet.getDataRange().getValues();

      const hoy = new Date();
      const productosExpirando = [];

      entradas.forEach((entrada, idx) => {
        if (idx === 0) return; // Skip header

        const idProducto = entrada[2]; // ID_Producto
        const fechaExpiry = new Date(entrada[3]); // Fecha vencimiento (si existe)
        
        if (!fechaExpiry || isNaN(fechaExpiry)) return;

        const diasRestantes = Math.floor((fechaExpiry - hoy) / (1000 * 60 * 60 * 24));

        if (diasRestantes <= PURCHASE_CONFIG.DIAS_ALERTA_VENCIMIENTO && diasRestantes >= 0) {
          // Obtener nombre del producto
          const productosSheet = db.getSheet('Productos');
          const productos = productosSheet.getDataRange().getValues();
          const producto = productos.find(p => p[0] === idProducto);

          productosExpirando.push({
            id: 'VENC_' + entrada[0],
            idProducto: idProducto,
            nombre: producto ? producto[1] : 'Desconocido',
            fechaExpiry: fechaExpiry,
            diasRestantes: diasRestantes,
            stock: entrada[4],
            urgencia: diasRestantes === 0 ? '🔴 HOY' : (diasRestantes <= 3 ? '🟠 MUY PRONTO' : '🟡 PRÓXIMAMENTE'),
            sugerenciaPromocion: this.sugerirPromocion(diasRestantes, producto ? producto[3] : 0)
          });
        }
      });

      AuditLogger.log('EXPIRY_CHECK', `${productosExpirando.length} productos próximos a expirar`, {});

      return {
        cantidadAlerta: productosExpirando.length,
        productos: productosExpirando.sort((a, b) => a.diasRestantes - b.diasRestantes),
        accionRecomendada: productosExpirando.length > 0 ? 'Aplicar promociones urgentes' : 'Sin alertas'
      };
    } catch (err) {
      AuditLogger.log('EXPIRY_ERROR', err.message, {});
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUGERIR PROMOCIONES PARA VENCIDOS
  // ─────────────────────────────────────────────────────────────────────────
  static sugerirPromociones() {
    try {
      const productosVenciendo = this.detectarProximasAExpirar();

      const promociones = productosVenciendo.productos.map(p => {
        // Descuento progresivo según días restantes
        let descuentoPorcentaje = 10; // Mínimo 10%
        if (p.diasRestantes <= 1) descuentoPorcentaje = 40;
        else if (p.diasRestantes <= 3) descuentoPorcentaje = 30;
        else if (p.diasRestantes <= 7) descuentoPorcentaje = 20;
        else if (p.diasRestantes <= 14) descuentoPorcentaje = 15;

        return {
          id: p.id,
          nombre: p.nombre,
          descuentoPorcentaje: descuentoPorcentaje,
          mensajePromocion: this.generarMensajePromo(p.nombre, descuentoPorcentaje, p.diasRestantes),
          impactoVentas: descuentoPorcentaje > 20 ? '+150%' : '+75%', // Estimado
          gananciaUtilidad: 'Mejor que descarte total'
        };
      });

      return {
        cantidadPromociones: promociones.length,
        promociones: promociones,
        rentabilidad: 'Mantener 15% margen aunque con descuento'
      };
    } catch (err) {
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANÁLISIS ABC DEL INVENTARIO
  // ─────────────────────────────────────────────────────────────────────────
  static analisysABCInventory(dias = 90) {
    try {
      const db = DatabaseManager.getInstance();

      // Obtener productos
      const productosSheet = db.getSheet('Productos');
      const productos = productosSheet.getDataRange().getValues();

      // Obtener ventas últimas N días
      const ventasSheet = db.getSheet('Detalle_Ventas');
      const ventas = ventasSheet.getDataRange().getValues();

      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() - dias);

      // Calcular ventas por producto
      const ventasPorProducto = {};

      ventas.forEach(v => {
        if (v[1]) { // ID_Producto
          const id = v[1];
          const cantidad = parseInt(v[2]) || 0;

          if (!ventasPorProducto[id]) {
            ventasPorProducto[id] = 0;
          }
          ventasPorProducto[id] += cantidad;
        }
      });

      // Calcular ABC
      const productosConVentas = productos
        .filter((p, idx) => idx > 0 && ventasPorProducto[p[0]])
        .map(p => ({
          id: p[0],
          nombre: p[1],
          ventas: ventasPorProducto[p[0]],
          precio: p[3],
          utilidad: ventasPorProducto[p[0]] * p[3] * 0.2 // Margen 20%
        }))
        .sort((a, b) => b.utilidad - a.utilidad);

      const totalUtilidad = productosConVentas.reduce((sum, p) => sum + p.utilidad, 0);

      let acumulado = 0;
      const productosABC = productosConVentas.map(p => {
        acumulado += p.utilidad;
        const porcentajeAcumulado = (acumulado / totalUtilidad) * 100;

        let categoria = 'C'; // Bajo movimiento
        if (porcentajeAcumulado <= 80) categoria = 'A'; // Top 80%
        else if (porcentajeAcumulado <= 95) categoria = 'B'; // 80-95%

        return {
          ...p,
          categoria: categoria,
          porcentajeAcumulado: porcentajeAcumulado.toFixed(2),
          recomendacion: categoria === 'A' 
            ? 'Stock alto, promoción frecuente'
            : categoria === 'B'
            ? 'Stock moderado, ofertas ocasionales'
            : 'Stock mínimo, evaluar discontinuar'
        };
      });

      return {
        periodo_dias: dias,
        totalProductos: productosABC.length,
        productosCategoriaA: productosABC.filter(p => p.categoria === 'A').length,
        productosCategoriaB: productosABC.filter(p => p.categoria === 'B').length,
        productosCategoriaC: productosABC.filter(p => p.categoria === 'C').length,
        distribucin: productosABC
      };
    } catch (err) {
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILIDADES PRIVADAS
  // ─────────────────────────────────────────────────────────────────────────

  static sugerirPromocion(diasRestantes, precio = 0) {
    if (diasRestantes <= 1) return '40% OFF - ¡HOYY!';
    if (diasRestantes <= 3) return '30% OFF - Últimos días';
    if (diasRestantes <= 7) return '20% OFF - Próximo a vencer';
    if (diasRestantes <= 14) return '15% OFF - Luego no hay';
    return 'Sin promoción aún';
  }

  static generarMensajePromo(nombre, descuento, diasRestantes) {
    const urgencia = diasRestantes <= 1 ? '¡URGENTE!' : 'Aprisa';
    return `${urgencia} ${nombre} al ${descuento}% OFF - ${diasRestantes} días restantes`;
  }
}

// ============================================================================
// APIS PÚBLICAS - PurchaseIntelligence
// ============================================================================

function sugerirPedidos() {
  return ErrorHandler.response(() => 
    PurchaseIntelligence.getInstance().constructor.sugerirPedidos()
  );
}

function detectarProximasAExpirar() {
  return ErrorHandler.response(() => 
    PurchaseIntelligence.getInstance().constructor.detectarProximasAExpirar()
  );
}

function sugerirPromociones() {
  return ErrorHandler.response(() => 
    PurchaseIntelligence.getInstance().constructor.sugerirPromociones()
  );
}

function analisysABCInventory(dias = 90) {
  return ErrorHandler.response(() => 
    PurchaseIntelligence.getInstance().constructor.analisysABCInventory(dias)
  );
}

// ============================================================================
// SETUP - Crear sheets automáticamente si no existen
// ============================================================================

function setupPurchaseIntelligence() {
  const db = DatabaseManager.getInstance();

  // Crear PedidosSugeridos sheet
  try {
    db.getSheet(PURCHASE_CONFIG.SHEETS.PEDIDOS_SUGERIDOS);
  } catch (e) {
    const pedidosSheet = DatabaseManager.spreadsheet.insertSheet(PURCHASE_CONFIG.SHEETS.PEDIDOS_SUGERIDOS);
    pedidosSheet.appendRow(['ID', 'ID_Producto', 'Cantidad', 'FechaSugerencia', 'Estado', 'CostoEstimado']);
  }

  // Crear ControlVencimientos sheet
  try {
    db.getSheet(PURCHASE_CONFIG.SHEETS.CONTROL_VENCIMIENTOS);
  } catch (e) {
    const vencSheet = DatabaseManager.spreadsheet.insertSheet(PURCHASE_CONFIG.SHEETS.CONTROL_VENCIMIENTOS);
    vencSheet.appendRow(['ID', 'ID_Producto', 'Nombre', 'FechaExpiry', 'DiasPendientes', 'Promocion']);
  }
}
