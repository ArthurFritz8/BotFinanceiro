/**
 * PriceZonesPrimitive — Series Primitive (Lightweight Charts v5)
 * Refs: ADR-077 (Camada de Anotações do Gráfico Interativo)
 *
 * Pinta zonas horizontais (faixas de preço entre top/bottom) e linhas verticais
 * tracejadas ligando "candle de origem" ao "Now", diretamente no canvas do chart
 * (zero reflow em pan/zoom). Cada zona aceita rótulo no canto superior esquerdo
 * (ex.: "OB H1", "FVG M15", "R:R 1:3.2").
 *
 * API:
 *   const primitive = new PriceZonesPrimitive();
 *   series.attachPrimitive(primitive);
 *   primitive.setZones([{ top, bottom, fill, stroke, label, labelColor, dashed }, ...]);
 *   primitive.setVerticalLines([{ time, color }]);
 *   // ...later
 *   series.detachPrimitive(primitive);
 */

const DEFAULT_ZONE = Object.freeze({
  bottom: 0,
  dashed: false,
  fill: "rgba(255,255,255,0.08)",
  labelAlign: "top-left",
  label: "",
  labelColor: "rgba(255,255,255,0.85)",
  stroke: "rgba(255,255,255,0.32)",
  top: 0,
});

class ZonesPaneRenderer {
  constructor() {
    this._zones = [];
    this._verticalLines = [];
    this._series = null;
    this._chart = null;
  }

  update(zones, verticalLines, series, chart) {
    this._zones = Array.isArray(zones) ? zones : [];
    this._verticalLines = Array.isArray(verticalLines) ? verticalLines : [];
    this._series = series;
    this._chart = chart;
  }

  draw(target) {
    if (!this._series || !this._chart) {
      return;
    }

    const series = this._series;
    const chart = this._chart;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const widthPx = scope.bitmapSize.width;
      const heightPx = scope.bitmapSize.height;
      const ratioX = scope.horizontalPixelRatio || 1;
      const ratioY = scope.verticalPixelRatio || 1;

      ctx.save();

      // ---- Zonas horizontais ----
      for (const raw of this._zones) {
        const zone = { ...DEFAULT_ZONE, ...raw };
        const top = Number(zone.top);
        const bottom = Number(zone.bottom);
        if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;

        const yTop = series.priceToCoordinate(Math.max(top, bottom));
        const yBottom = series.priceToCoordinate(Math.min(top, bottom));
        if (yTop == null || yBottom == null) continue;

        const yTopPx = yTop * ratioY;
        const yBottomPx = yBottom * ratioY;
        const heightZone = Math.max(1, yBottomPx - yTopPx);

        // Fill semi-transparente
        ctx.fillStyle = zone.fill;
        ctx.fillRect(0, yTopPx, widthPx, heightZone);

        // Borda 1px (escala bitmap)
        ctx.strokeStyle = zone.stroke;
        ctx.lineWidth = Math.max(1, Math.round(ratioY));
        if (zone.dashed) {
          ctx.setLineDash([6 * ratioX, 4 * ratioX]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(0, yTopPx + 0.5);
        ctx.lineTo(widthPx, yTopPx + 0.5);
        ctx.moveTo(0, yBottomPx + 0.5);
        ctx.lineTo(widthPx, yBottomPx + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);

        // Rótulo da zona (top-left por padrão, central para Position Tool R:R)
        if (zone.label) {
          const fontSize = 10 * ratioY;
          const padX = 6 * ratioX;
          const padY = 3 * ratioY;
          ctx.font = `600 ${fontSize}px Sora, "Trebuchet MS", sans-serif`;
          const text = String(zone.label);
          const metrics = ctx.measureText(text);
          const tagW = metrics.width + padX * 2;
          const tagH = fontSize + padY * 2;
          const defaultTagX = padX;
          const defaultTagY = yTopPx + padY;
          const centerTagX = (widthPx - tagW) / 2;
          const centerTagY = yTopPx + (heightZone - tagH) / 2;
          const tagX = zone.labelAlign === "center"
            ? Math.max(0, Math.min(centerTagX, widthPx - tagW))
            : defaultTagX;
          const tagY = zone.labelAlign === "center"
            ? Math.max(0, Math.min(centerTagY, Math.max(0, heightPx - tagH)))
            : defaultTagY;

          // Background tag
          ctx.fillStyle = "rgba(6, 11, 20, 0.78)";
          ctx.fillRect(tagX, tagY, tagW, tagH);
          ctx.strokeStyle = zone.stroke;
          ctx.lineWidth = Math.max(1, Math.round(ratioY));
          ctx.strokeRect(tagX + 0.5, tagY + 0.5, tagW - 1, tagH - 1);

          // Texto
          ctx.fillStyle = zone.labelColor;
          ctx.textBaseline = "top";
          ctx.fillText(text, tagX + padX, tagY + padY);
        }
      }

      // ---- Linhas verticais (origem → now) ----
      const timeScale = chart.timeScale();
      for (const vline of this._verticalLines) {
        const x = timeScale.timeToCoordinate(vline.time);
        if (x == null) continue;
        const xPx = x * ratioX;
        ctx.strokeStyle = vline.color || "rgba(255,255,255,0.28)";
        ctx.lineWidth = Math.max(1, Math.round(ratioX));
        ctx.setLineDash([4 * ratioX, 4 * ratioX]);
        ctx.beginPath();
        ctx.moveTo(xPx + 0.5, 0);
        ctx.lineTo(xPx + 0.5, heightPx);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    });
  }
}

class ZonesPaneView {
  constructor(primitive) {
    this._primitive = primitive;
    this._renderer = new ZonesPaneRenderer();
  }

  zOrder() {
    return "bottom";
  }

  update() {
    this._renderer.update(
      this._primitive._zones,
      this._primitive._verticalLines,
      this._primitive._series,
      this._primitive._chart,
    );
  }

  renderer() {
    return this._renderer;
  }
}

export class PriceZonesPrimitive {
  constructor() {
    this._zones = [];
    this._verticalLines = [];
    this._series = null;
    this._chart = null;
    this._paneViews = [new ZonesPaneView(this)];
  }

  attached(param) {
    this._series = param.series;
    this._chart = param.chart;
    this._paneViews.forEach((v) => v.update());
  }

  detached() {
    this._series = null;
    this._chart = null;
  }

  setZones(zones) {
    this._zones = Array.isArray(zones) ? zones.slice() : [];
    this._paneViews.forEach((v) => v.update());
  }

  setVerticalLines(lines) {
    this._verticalLines = Array.isArray(lines) ? lines.slice() : [];
    this._paneViews.forEach((v) => v.update());
  }

  clear() {
    this._zones = [];
    this._verticalLines = [];
    this._paneViews.forEach((v) => v.update());
  }

  paneViews() {
    return this._paneViews;
  }

  updateAllViews() {
    this._paneViews.forEach((v) => v.update());
  }
}
