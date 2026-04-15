// ============================================================================
// ANALYTICSMANAGER v4.0 - Insights de Rentabilidad, Horarios Pico, KPIs
// ============================================================================
// Dependencias: DatabaseManager, LockManager, AuditLogger, ErrorHandler
// Sheets: Analytics_Cache, Reportes
// API: Google Sheets (nativa), Google Charts (visualización)

const ANALYTICS_CONFIG = {
  SHEETS: {
    ANALYTICS_CACHE: 'Analytics_Cache',
    REPORTES: 'Reportes',
  },
  CACHE_TTL_HORAS: 24, // Cachear por 1 día
  PERIODOS_ANALISIS: {
    ULTIMOS_30: 30,
    ULTIMOS_90: 90,
    ULTIMOS_365: 365
  }
};

// ============================================================================
// CLASSE: AnalyticsManager
// ============================================================================
class AnalyticsManager {
  static #instance = null;
  static #cache = {};

  static getInstance() {
    if (!AnalyticsManager.#instance) {
      AnalyticsManager.#instance = new AnalyticsManager();
    }
    return AnalyticsManager.#instance;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRODUCTOS ESTRELLA (Mayor ganancia)
  // ─────────────────────────────────────────────────────────────────────────
  static getProductosEstrella(limite = 10) {
    try {
      // Verificar cache
      if (this.#cache['productosEstrella'] && this.#cache['productosEstrella'].timestamp > Date.now() - 24*60*60*1000) {
        return this.#cache['productosEstrella'].data;
      }

      const db = DatabaseManager.getInstance();

      // Obtener productos con costo
      const productosSheet = db.getSheet('Productos');
      const productos = productosSheet.getDataRange().getValues();

      // Obtener detalles de ventas
      const detalleSheet = db.getSheet('Detalle_Ventas');
      const detalles = detalleSheet.getDataRange().getValues();

      // Obtener entradas (costo)
      const entradasSheet = db.getSheet('Entradas');
      const entradas = entradasSheet.getDataRange().getValues();

      // Mapear costos por producto
      const costoPorProducto = {};
      entradas.forEach((e, idx) => {
        if (idx === 0) return; // Skip header
        const idProducto = e[2];
        const costo = parseFloat(e[4]) || 0;
        if (!costoPorProducto[idProducto]) costoPorProducto[idProducto] = [];
        costoPorProducto[idProducto].push(costo);
      });

      // Calcular rentabilidad con últimas 90 días
      const hace90 = new Date();
      hace90.setDate(hace90.getDate() - 90);

      const rentabilidad = {};

      detalles.forEach((d, idx) => {
        if (idx === 0) return; // Skip header
        
        const fecha = new Date(d[3]);
        if (fecha < hace90) return; // Solo últimos 90 días

        const idProducto = d[1];
        const cantidad = parseInt(d[2]) || 0;
        const precioVenta = parseFloat(d[3]) || 0;

        if (!rentabilidad[idProducto]) {
          rentabilidad[idProducto] = {
            cantidadVendida: 0,
            montoTotal: 0,
            costoTotal: 0,
            transacciones: 0
          };
        }

        const costoPromedio = costoPorProducto[idProducto] 
          ? costoPorProducto[idProducto].reduce((a, b) => a + b, 0) / costoPorProducto[idProducto].length
          : 0;

        rentabilidad[idProducto].cantidadVendida += cantidad;
        rentabilidad[idProducto].montoTotal += cantidad * precioVenta;
        rentabilidad[idProducto].costoTotal += cantidad * costoPromedio;
        rentabilidad[idProducto].transacciones++;
      });

      // Calcular ganancia neta
      const productosOrdenados = Object.entries(rentabilidad)
        .map(([idProducto, datos]) => {
          const producto = productos.find(p => p[0] === idProducto);
          const gananciaNeta = datos.montoTotal - datos.costoTotal;
          const margen = datos.montoTotal > 0 ? ((gananciaNeta / datos.montoTotal) * 100).toFixed(2) : 0;

          return {
            idProducto: idProducto,
            nombre: producto ? producto[1] : 'Desconocido',
            cantidadVendida: datos.cantidadVendida,
            montoTotal: datos.montoTotal.toFixed(2),
            costoTotal: datos.costoTotal.toFixed(2),
            gananciaNeta: gananciaNeta.toFixed(2),
            margenPorcentaje: margen,
            transacciones: datos.transacciones,
            promedioTransaccion: (datos.montoTotal / datos.transacciones).toFixed(2)
          };
        })
        .sort((a, b) => parseFloat(b.gananciaNeta) - parseFloat(a.gananciaNeta))
        .slice(0, limite);

      const totalGanancia = productosOrdenados.reduce((sum, p) => sum + parseFloat(p.gananciaNeta), 0);

      const resultado = {
        periodo: '90 días',
        topProductos: limite,
        totalGanancia: totalGanancia.toFixed(2),
        productos: productosOrdenados.map((p, idx) => ({
          ...p,
          posicion: idx + 1,
          porcentajeDelTotal: ((parseFloat(p.gananciaNeta) / totalGanancia) * 100).toFixed(2)
        }))
      };

      // Cachear resultado
      this.#cache['productosEstrella'] = { data: resultado, timestamp: Date.now() };

      AuditLogger.log('ANALYTICS_STARS', `${limite} productos estrella calculados`, {});

      return resultado;
    } catch (err) {
      AuditLogger.log('ANALYTICS_ERROR', err.message, {});
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HORARIOS PICO
  // ─────────────────────────────────────────────────────────────────────────
  static getHorariosPico() {
    try {
      // Verificar cache
      if (this.#cache['horariosPico'] && this.#cache['horariosPico'].timestamp > Date.now() - 24*60*60*1000) {
        return this.#cache['horariosPico'].data;
      }

      const db = DatabaseManager.getInstance();
      const ventasSheet = db.getSheet('Ventas');
      const ventas = ventasSheet.getDataRange().getValues();

      const horarios = {};

      // Inicializar horas 0-23
      for (let h = 0; h < 24; h++) {
        horarios[h] = {
          transacciones: 0,
          montoTotal: 0,
          montoPromedio: 0,
          ocupacion: 0
        };
      }

      // Agrupar por hora
      ventas.forEach((v, idx) => {
        if (idx === 0) return; // Skip header

        const fecha = new Date(v[1]); // Fecha
        if (isNaN(fecha)) return;

        const hora = fecha.getHours();
        const monto = parseFloat(v[2]) || 0; // Total

        horarios[hora].transacciones++;
        horarios[hora].montoTotal += monto;
      });

      // Calcular promedios
      let maxTransacciones = 0;
      let maxMonto = 0;

      Object.values(horarios).forEach(h => {
        if (h.transacciones > 0) {
          h.montoPromedio = (h.montoTotal / h.transacciones).toFixed(2);
        }
        maxTransacciones = Math.max(maxTransacciones, h.transacciones);
        maxMonto = Math.max(maxMonto, h.montoTotal);
      });

      // Calcular ocupación relativa (0-100)
      Object.values(horarios).forEach(h => {
        h.ocupacion = maxTransacciones > 0 ? ((h.transacciones / maxTransacciones) * 100).toFixed(0) : 0;
      });

      // Encontrar mejores horas
      const horariosPorTransacciones = Object.entries(horarios)
        .sort((a, b) => b[1].transacciones - a[1].transacciones)
        .slice(0, 3);

      const horariosPorMonto = Object.entries(horarios)
        .sort((a, b) => b[1].montoTotal - a[1].montoTotal)
        .slice(0, 3);

      const resultado = {
        mejoresHoras: horariosPorTransacciones.map(([h, data]) => ({
          hora: `${h}:00 - ${h}:59`,
          transacciones: data.transacciones,
          montoTotal: data.montoTotal.toFixed(2),
          ocupacion: `${data.ocupacion}%`
        })),
        horariosPorVolumen: horariosPorMonto.map(([h, data]) => ({
          hora: `${h}:00 - ${h}:59`,
          monto: data.montoTotal.toFixed(2),
          promedio: data.montoPromedio
        })),
        todasLasHoras: Object.entries(horarios).map(([h, data]) => ({
          hora: parseInt(h),
          transacciones: data.transacciones,
          monto: data.montoTotal.toFixed(2),
          promedio: data.montoPromedio,
          ocupacion: `${data.ocupacion}%`,
          ocupacionVisual: this.generarGraficoOcupacion(parseInt(data.ocupacion))
        })),
        recomendacion: 'Refuerza equipo en horas pico para mejor servicio'
      };

      // Cachear
      this.#cache['horariosPico'] = { data: resultado, timestamp: Date.now() };

      AuditLogger.log('ANALYTICS_HOURS', 'Horarios pico calculados', {});

      return resultado;
    } catch (err) {
      AuditLogger.log('ANALYTICS_ERROR', err.message, {});
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANÁLISIS DE RENTABILIDAD POR CATEGORÍA
  // ─────────────────────────────────────────────────────────────────────────
  static rentabilidadPorCategoria() {
    try {
      const db = DatabaseManager.getInstance();

      // Obtener productos
      const productosSheet = db.getSheet('Productos');
      const productos = productosSheet.getDataRange().getValues();

      // Obtener detalles de ventas energía últimos 90 días
      const ventasSheet = db.getSheet('Detalle_Ventas');
      const ventas = ventasSheet.getDataRange().getValues();

      const hace90 = new Date();
      hace90.setDate(hace90.getDate() - 90);

      // Inferir categoría del nombre (simple, puede mejorar)
      const categorias = {};

      productos.forEach((p, idx) => {
        if (idx === 0) return;

        const nombre = p[1].toLowerCase();
        let categoria = 'Otros';

        if (nombre.includes('bebida') || nombre.includes('agua') || nombre.includes('refresco')) categoria = 'Bebidas';
        else if (nombre.includes('comida') || nombre.includes('snack') || nombre.includes('pan')) categoria = 'Comidas';
        else if (nombre.includes('dulce') || nombre.includes('chocolate') || nombre.includes('caramelo')) categoria = 'Dulces';
        else if (nombre.includes('electrónico') || nombre.includes('cable') || nombre.includes('accesorio')) categoria = 'Electrónica';

        if (!categorias[categoria]) {
          categorias[categoria] = {
            productos: [],
            ventasTotal: 0,
            rotacionTotal: 0,
            ganancharTotal: 0
          };
        }

        categorias[categoria].productos.push(p[0]);
      });

      // Calcular ventas por categoría
      ventas.forEach(v => {
        const idProducto = v[1];
        const cantidad = parseInt(v[2]) || 0;
        const monto = parseFloat(v[3]) || 0;

        Object.entries(categorias).forEach(([cat, data]) => {
          if (data.productos.includes(idProducto)) {
            data.ventasTotal += monto;
            data.rotacionTotal += cantidad;
          }
        });
      });

      // Compilar resultados
      const rentabilidadResultados = Object.entries(categorias)
        .map(([categoria, datos]) => {
          const gananciaEstimada = datos.ventasTotal * 0.2; // Margen 20%

          return {
            categoria: categoria,
            productosEnCategoria: datos.productos.length,
            ventasTotal: datos.ventasTotal.toFixed(2),
            rotacionTotal: datos.rotacionTotal,
            gananciaEstimada: gananciaEstimada.toFixed(2),
            margenPorcentaje: '20%',
            rotacionPromedioDiaria: (datos.rotacionTotal / 90).toFixed(2),
            prioridad: gananciaEstimada > 100000 ? 'Alta' : (gananciaEstimada > 50000 ? 'Media' : 'Baja')
          };
        })
        .sort((a, b) => parseFloat(b.gananciaEstimada) - parseFloat(a.gananciaEstimada));

      AuditLogger.log('ANALYTICS_CATEGORIES', 'Análisis por categoría completado', {});

      return {
        periodo: '90 días',
        categorías: rentabilidadResultados,
        recomendación: 'Enfoca stock en categorías de alta prioridad'
      };
    } catch (err) {
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REPORTE EJECUTIVO
  // ─────────────────────────────────────────────────────────────────────────
  static reporteEjecutivo(periodo_dias = 30) {
    try {
      const db = DatabaseManager.getInstance();

      const ventasSheet = db.getSheet('Ventas');
      const ventas = ventasSheet.getDataRange().getValues();

      const hace30 = new Date();
      hace30.setDate(hace30.getDate() - periodo_dias);

      // Calcular KPIs
      let totalIngresos = 0;
      let totalTransacciones = 0;
      let gananciaEstimada = 0;

      ventas.forEach((v, idx) => {
        if (idx === 0) return;

        const fecha = new Date(v[1]);
        if (fecha >= hace30) {
          const monto = parseFloat(v[2]) || 0;
          totalIngresos += monto;
          totalTransacciones++;
          gananciaEstimada += monto * 0.2; // 20% margen
        }
      });

      // Comparar con período anterior
      const hace60 = new Date();
      hace60.setDate(hace60.getDate() - (periodo_dias * 2));

      let totalIngresosAnterior = 0;
      ventas.forEach((v, idx) => {
        if (idx === 0) return;

        const fecha = new Date(v[1]);
        if (fecha >= hace60 && fecha < hace30) {
          const monto = parseFloat(v[2]) || 0;
          totalIngresosAnterior += monto;
        }
      });

      const variacionPorcentaje = totalIngresosAnterior > 0
        ? (((totalIngresos - totalIngresosAnterior) / totalIngresosAnterior) * 100).toFixed(2)
        : 0;

      const promedioPorTransaccion = totalTransacciones > 0 ? (totalIngresos / totalTransacciones).toFixed(2) : 0;

      const resultado = {
        periodo: `${periodo_dias} días`,
        kpis_principales: {
          ingresos_totales: totalIngresos.toFixed(2),
          transacciones_totales: totalTransacciones,
          promedio_por_transaccion: promedioPorTransaccion,
          ganancia_estimada: gananciaEstimada.toFixed(2),
          margen_porcentaje: '20%'
        },
        comparativa_anterior: {
          ingresos_anterior: totalIngresosAnterior.toFixed(2),
          variacion_porcentaje: variacionPorcentaje,
          tendencia: variacionPorcentaje > 0 ? '📈 Crecimiento' : (variacionPorcentaje <0 ? '📉 Decrecimiento' : '➡️ Estable')
        },
        alertas: this.generarAlertas(totalIngresos, totalTransacciones, variacionPorcentaje),
        proximas_acciones: [
          'Revisar productos estrella',
          'Optimizar horarios pico',
          'Controlar vencimientos próximos',
          'Activar programa de lealtad'
        ]
      };

      // Guardar en Reportes sheet
      const reportesSheet = db.getSheet(ANALYTICS_CONFIG.SHEETS.REPORTES);
      reportesSheet.appendRow([
        'REP_' + Date.now(),
        new Date(),
        'Ejecutivo',
        JSON.stringify(resultado),
        'Generado'
      ]);

      AuditLogger.log('REPORTE_EXECUTIVE', 'Reporte ejecutivo generado', {});

      return resultado;
    } catch (err) {
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILIDADES PRIVADAS
  // ─────────────────────────────────────────────────────────────────────────

  static generarGraficoOcupacion(ocupacion) {
    // Generar barra ASCII para visualización
    const barrasLlenas = Math.floor(ocupacion / 5);
    const barrasVacias = 20 - barrasLlenas;
    return '[' + '█'.repeat(barrasLlenas) + '░'.repeat(barrasVacias) + ']';
  }

  static generarAlertas(ingresos, transacciones, variacion) {
    const alertas = [];

    if (ingresos < 50000) {
      alertas.push({ tipo: 'warning', mensaje: '⚠️ Ingresos bajos - Revisar promociones' });
    }
    if (transacciones < 50) {
      alertas.push({ tipo: 'info', mensaje: 'ℹ️ Pocas transacciones - Activar programa loyalty' });
    }
    if (variacion < -10) {
      alertas.push({ tipo: 'error', mensaje: '🔴 Caída -10% vs período anterior' });
    }
    if (variacion > 20) {
      alertas.push({ tipo: 'success', mensaje: '✅ Crecimiento +20% vs período anterior' });
    }

    return alertas;
  }
}

// ============================================================================
// APIS PÚBLICAS - AnalyticsManager
// ============================================================================

function getProductosEstrella(limite = 10) {
  return ErrorHandler.response(() => 
    AnalyticsManager.getInstance().constructor.getProductosEstrella(limite)
  );
}

function getHorariosPico() {
  return ErrorHandler.response(() => 
    AnalyticsManager.getInstance().constructor.getHorariosPico()
  );
}

function rentabilidadPorCategoria() {
  return ErrorHandler.response(() => 
    AnalyticsManager.getInstance().constructor.rentabilidadPorCategoria()
  );
}

function reporteEjecutivo(periodo_dias = 30) {
  return ErrorHandler.response(() => 
    AnalyticsManager.getInstance().constructor.reporteEjecutivo(periodo_dias)
  );
}

// ============================================================================
// SETUP - Crear sheets automáticamente si no existen
// ============================================================================

function setupAnalyticsManager() {
  const db = DatabaseManager.getInstance();

  // Crear Analytics_Cache sheet
  try {
    db.getSheet(ANALYTICS_CONFIG.SHEETS.ANALYTICS_CACHE);
  } catch (e) {
    const cacheSheet = DatabaseManager.spreadsheet.insertSheet(ANALYTICS_CONFIG.SHEETS.ANALYTICS_CACHE);
    cacheSheet.appendRow(['Clave', 'Datos', 'Timestamp', 'Expiry']);
  }

  // Crear Reportes sheet
  try {
    db.getSheet(ANALYTICS_CONFIG.SHEETS.REPORTES);
  } catch (e) {
    const reportesSheet = DatabaseManager.spreadsheet.insertSheet(ANALYTICS_CONFIG.SHEETS.REPORTES);
    reportesSheet.appendRow(['ID', 'Fecha', 'Tipo', 'Datos_JSON', 'Estado']);
  }
}
