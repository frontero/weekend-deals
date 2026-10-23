import { formatEuros, formatTimestamp } from '../../lib/format.js';

// ECharts options for the admin charts, built from the palette of the current mode. Marks follow the data-viz specs:
// 2px lines, 8px dots ringed in the surface colour, bars at most 24px with a rounded data end, hairline grid, and a
// tooltip that leads with the value. Park and accommodation names come from the providers, so tooltips escape them.

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Charts plot whole euros, so the axis gets round numbers; the cents stay in the data. */
export const euros = (cents) => (cents == null ? null : cents / 100);
export const euroLabel = (value) => formatEuros(value * 100);
export const countLabel = (value) => Math.abs(value).toLocaleString('nl-NL');
export const percentLabel = (value) => `${Math.round(value)}%`;

export const tooltipTitle = (text) => `<div style="font-size:12px;opacity:.7;margin-bottom:2px">${escapeHtml(text)}</div>`;

/** A tooltip line: the value first, then what it is, keyed by a short stroke of the series colour. */
export const tooltipRow = (color, label, value) =>
  `<div style="display:flex;align-items:center;gap:8px;margin-top:3px">` +
  `<span style="display:inline-block;width:12px;height:2px;border-radius:1px;background:${color}"></span>` +
  `<b style="font-weight:600">${escapeHtml(value)}</b><span style="opacity:.75">${escapeHtml(label)}</span></div>`;

function base(palette) {
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT, color: palette.inkSecondary },
    animationDuration: 450,
    animationDurationUpdate: 300,
    grid: { left: 4, right: 12, top: 36, bottom: 4, containLabel: true },
    tooltip: {
      confine: true,
      backgroundColor: palette.tooltip,
      borderColor: palette.grid,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: palette.ink, fontFamily: FONT, fontSize: 13 },
      extraCssText: 'border-radius:12px;box-shadow:0 10px 30px rgb(0 0 0 / .14);',
    },
  };
}

const legend = (palette, data) => ({
  data,
  top: 0,
  left: 0,
  icon: 'roundRect',
  itemWidth: 12,
  itemHeight: 4,
  itemGap: 16,
  textStyle: { color: palette.inkSecondary, fontSize: 12 },
});

const valueAxis = (palette, { formatter = euroLabel, scale = false, min, max, integer = false } = {}) => ({
  type: 'value',
  scale,
  min,
  max,
  // Counts get whole-number ticks.
  minInterval: integer ? 1 : undefined,
  axisLabel: { color: palette.muted, formatter, fontSize: 12, hideOverlap: true },
  splitLine: { lineStyle: { color: palette.grid } },
  axisLine: { show: false },
  axisTick: { show: false },
});

const timeAxis = (palette) => ({
  type: 'time',
  axisLabel: { color: palette.muted, hideOverlap: true, fontSize: 12 },
  axisLine: { lineStyle: { color: palette.axis } },
  axisTick: { show: false },
  splitLine: { show: false },
});

const categoryAxis = (palette, data, extra = {}) => ({
  type: 'category',
  data,
  axisLabel: { color: palette.muted, hideOverlap: true, fontSize: 12 },
  axisLine: { lineStyle: { color: palette.axis } },
  axisTick: { show: false },
  ...extra,
});

const axisTooltip = (palette, formatter) => ({
  ...base(palette).tooltip,
  trigger: 'axis',
  axisPointer: { type: 'line', lineStyle: { color: palette.axis } },
  formatter,
});

const dot = (palette, color) => ({ color, borderColor: palette.surface, borderWidth: 2 });

/**
 * A line over time with a shaded band, e.g. the median price with the middle half of the prices around it.
 * @param points [{ at, value, low, high }] with `at` an ISO time or milliseconds
 */
export function bandChart(palette, { points, name, bandName, valueFormatter = euroLabel, note }) {
  const color = palette.series[0];
  const byTime = new Map(points.map((point) => [Date.parse(point.at), point]));
  return {
    ...base(palette),
    legend: legend(palette, [name, bandName]),
    xAxis: timeAxis(palette),
    yAxis: valueAxis(palette, { formatter: valueFormatter, scale: true }),
    tooltip: axisTooltip(palette, (params) => {
      const point = byTime.get(params[0].value[0]);
      if (!point) return '';
      return (
        tooltipTitle(formatTimestamp(point.at)) +
        tooltipRow(color, name, valueFormatter(point.value)) +
        tooltipRow(palette.deemphasis, bandName, `${valueFormatter(point.low)} – ${valueFormatter(point.high)}`) +
        (note ? `<div style="font-size:12px;opacity:.7;margin-top:4px">${escapeHtml(note(point))}</div>` : '')
      );
    }),
    series: [
      {
        name: 'low',
        type: 'line',
        stack: 'band',
        data: points.map((point) => [Date.parse(point.at), point.low]),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        silent: true,
      },
      {
        name: bandName,
        type: 'line',
        stack: 'band',
        data: points.map((point) => [Date.parse(point.at), point.high - point.low]),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color, opacity: 0.14 },
        itemStyle: { color },
        silent: true,
      },
      {
        name,
        type: 'line',
        data: points.map((point) => [Date.parse(point.at), point.value]),
        symbol: 'circle',
        symbolSize: 8,
        showSymbol: points.length <= 40,
        lineStyle: { width: 2, color, cap: 'round', join: 'round' },
        itemStyle: dot(palette, color),
        z: 3,
      },
    ],
  };
}

/** Counts above and below a baseline per item, e.g. prices that went up and down per round. */
export function divergingBars(palette, { labels, titles = labels, lower, higher, lowerName, higherName }) {
  return {
    ...base(palette),
    legend: legend(palette, [lowerName, higherName]),
    xAxis: categoryAxis(palette, labels),
    yAxis: valueAxis(palette, { formatter: countLabel, integer: true }),
    tooltip: {
      ...axisTooltip(palette, (params) => {
        const index = params[0].dataIndex;
        return (
          tooltipTitle(titles[index]) +
          tooltipRow(palette.lower, lowerName, countLabel(lower[index])) +
          tooltipRow(palette.higher, higherName, countLabel(higher[index]))
        );
      }),
      axisPointer: { type: 'shadow', shadowStyle: { color: palette.grid, opacity: 0.5 } },
    },
    series: [
      {
        name: higherName,
        type: 'bar',
        stack: 'change',
        data: higher,
        barMaxWidth: 24,
        itemStyle: { color: palette.higher, borderRadius: [4, 4, 0, 0] },
      },
      {
        name: lowerName,
        type: 'bar',
        stack: 'change',
        data: lower.map((value) => -value),
        barMaxWidth: 24,
        itemStyle: { color: palette.lower, borderRadius: [0, 0, 4, 4] },
      },
    ],
  };
}

/** One value per category, e.g. how many parks are free per weekend. */
export function columns(palette, { labels, titles = labels, values, name, valueFormatter = countLabel, color = palette.series[0] }) {
  return {
    ...base(palette),
    grid: { ...base(palette).grid, top: 16 },
    xAxis: categoryAxis(palette, labels),
    yAxis: valueAxis(palette, { formatter: valueFormatter, integer: valueFormatter === countLabel }),
    tooltip: {
      ...axisTooltip(palette, (params) => {
        const index = params[0].dataIndex;
        return tooltipTitle(titles[index]) + tooltipRow(color, name, valueFormatter(values[index]));
      }),
      axisPointer: { type: 'shadow', shadowStyle: { color: palette.grid, opacity: 0.5 } },
    },
    series: [{ name, type: 'bar', data: values, barMaxWidth: 24, itemStyle: { color, borderRadius: [4, 4, 0, 0] } }],
  };
}

/** Per category the middle half of the prices as a bar, with the median as a dot on it. */
export function rangeColumns(palette, { labels, titles = labels, low, median, high, valueFormatter = euroLabel }) {
  const color = palette.series[0];
  return {
    ...base(palette),
    legend: legend(palette, ['Mediaan', 'Middelste helft']),
    xAxis: categoryAxis(palette, labels),
    // The bars start at the lower quartile: the axis starts near the lowest one, not at zero.
    yAxis: valueAxis(palette, { formatter: valueFormatter, scale: true }),
    tooltip: {
      ...axisTooltip(palette, (params) => {
        const index = params[0].dataIndex;
        return (
          tooltipTitle(titles[index]) +
          tooltipRow(color, 'Mediaan', valueFormatter(median[index])) +
          tooltipRow(palette.deemphasis, 'Middelste helft', `${valueFormatter(low[index])} – ${valueFormatter(high[index])}`)
        );
      }),
      axisPointer: { type: 'shadow', shadowStyle: { color: palette.grid, opacity: 0.5 } },
    },
    series: [
      { type: 'bar', stack: 'range', data: low, barMaxWidth: 24, itemStyle: { color: 'transparent' }, silent: true },
      {
        name: 'Middelste helft',
        type: 'bar',
        stack: 'range',
        data: high.map((value, index) => (value == null ? null : value - low[index])),
        barMaxWidth: 24,
        itemStyle: { color, opacity: 0.28, borderRadius: 4 },
      },
      { name: 'Mediaan', type: 'scatter', data: median, symbolSize: 10, itemStyle: dot(palette, color), z: 3 },
    ],
  };
}

/**
 * A grid of cells, e.g. a park's price per weekend and round.
 * @param cells [[x, y, value, ...]] by index into xLabels and yLabels
 * @param scale 'sequential' (more is darker) or 'diverging' (below and above `center`)
 */
export function heatmap(palette, { xLabels, yLabels, cells, scale = 'sequential', min, max, legendFormatter, tooltip, topDown = false }) {
  const colors = scale === 'diverging' ? [palette.lower, palette.neutral, palette.higher] : palette.sequential;
  return {
    ...base(palette),
    grid: { left: 4, right: 12, top: 8, bottom: 56, containLabel: true },
    xAxis: categoryAxis(palette, xLabels, { splitArea: { show: false } }),
    // `topDown` lists the rows from the top, like a calendar.
    yAxis: {
      ...categoryAxis(palette, yLabels),
      axisLine: { show: false },
      inverse: topDown,
      // Faint rows, so empty cells still read as part of the grid.
      splitArea: { show: true, areaStyle: { color: ['transparent', palette.grid], opacity: 0.35 } },
    },
    visualMap: {
      type: 'continuous',
      // Cells carry more than [x, y, value] for their tooltips; the colour is the value.
      dimension: 2,
      min,
      max,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      itemWidth: 12,
      itemHeight: 180,
      calculable: false,
      inRange: { color: colors },
      // The two ends of the scale, highest first as ECharts expects.
      text: [legendFormatter(max), legendFormatter(min)],
      textGap: 8,
      textStyle: { color: palette.muted, fontSize: 12 },
    },
    tooltip: { ...base(palette).tooltip, trigger: 'item', formatter: (params) => tooltip(params.data) },
    series: [
      {
        type: 'heatmap',
        data: cells,
        itemStyle: { borderColor: palette.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: palette.ink, borderWidth: 1 } },
      },
    ],
  };
}

/**
 * Dots on two value axes, one colour per group (at most three: the providers).
 * @param groups [{ name, color, points: [{ x, y, id, title, rows }] }]
 */
export function scatter(palette, { groups, xFormatter = euroLabel, yFormatter = percentLabel, xName, yName, markY }) {
  return {
    ...base(palette),
    grid: { ...base(palette).grid, top: 40, bottom: 28 },
    legend: legend(palette, groups.map((group) => group.name)),
    xAxis: {
      ...valueAxis(palette, { formatter: xFormatter, scale: true }),
      name: xName,
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: palette.muted, fontSize: 12 },
    },
    yAxis: { ...valueAxis(palette, { formatter: yFormatter }), name: yName, nameTextStyle: { color: palette.muted, fontSize: 12, align: 'left' } },
    tooltip: {
      ...base(palette).tooltip,
      trigger: 'item',
      formatter: ({ data, color }) => tooltipTitle(data.title) + data.rows.map(([label, value]) => tooltipRow(color, label, value)).join(''),
    },
    series: groups.map((group, index) => ({
      name: group.name,
      type: 'scatter',
      data: group.points.map((point) => ({ ...point, value: [point.x, point.y] })),
      symbolSize: 10,
      itemStyle: { ...dot(palette, group.color), opacity: 0.9 },
      emphasis: { scale: 1.6 },
      markLine:
        index === 0 && markY != null
          ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: palette.axis, type: 'solid', width: 1 }, data: [{ yAxis: markY }] }
          : undefined,
    })),
  };
}

/**
 * Lines over a shared x axis; `emphasis` series stand out, the rest stay gray for context.
 * @param series [{ name, points: [[x, y]], emphasis }]
 */
export function lines(palette, { series, xType = 'time', xFormatter, valueFormatter = euroLabel, tooltipTitleOf, step = false }) {
  const xAxis = xType === 'time' ? timeAxis(palette) : { ...valueAxis(palette, { formatter: xFormatter }), splitLine: { show: false } };
  const shown = series.filter((item) => item.emphasis !== false);
  return {
    ...base(palette),
    legend: shown.length > 1 ? legend(palette, shown.map((item) => item.name)) : undefined,
    grid: { ...base(palette).grid, top: shown.length > 1 ? 36 : 16 },
    xAxis,
    yAxis: valueAxis(palette, { formatter: valueFormatter, scale: true, integer: valueFormatter === countLabel }),
    tooltip: axisTooltip(palette, (params) => {
      const rows = params
        .filter((param) => series[param.seriesIndex].emphasis !== false && param.value?.[1] != null)
        .map((param) => tooltipRow(param.color, param.seriesName, valueFormatter(param.value[1])));
      const x = params[0]?.value?.[0];
      return tooltipTitle(tooltipTitleOf ? tooltipTitleOf(x) : formatTimestamp(x)) + rows.join('');
    }),
    series: series.map((item, index) => {
      const color = item.emphasis === false ? palette.deemphasis : (item.color ?? palette.series[index % palette.series.length]);
      return {
        name: item.name,
        type: 'line',
        step: step ? 'end' : false,
        data: item.points,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 8,
        showSymbol: item.emphasis !== false && item.points.length <= 40,
        lineStyle: { width: item.emphasis === false ? 1 : 2, color, cap: 'round', join: 'round' },
        itemStyle: dot(palette, color),
        areaStyle: item.area ? { color, opacity: 0.1 } : undefined,
        z: item.emphasis === false ? 1 : 3,
        silent: item.emphasis === false,
      };
    }),
  };
}

/**
 * How a measure moves as arrival comes closer: every observation as a faint dot, and the weekly median as a line with
 * the middle half around it. The x axis runs from far ahead to the arrival day.
 * @param points [{ days, value, title }]; curve [{ from, value, low, high, count }]
 */
export function leadChart(palette, { points, curve, name, valueFormatter, reference }) {
  const color = palette.series[0];
  return {
    ...base(palette),
    legend: legend(palette, [name, 'Middelste helft', 'Losse metingen']),
    grid: { ...base(palette).grid, bottom: 28 },
    xAxis: {
      ...valueAxis(palette, { formatter: (days) => (days === 0 ? 'aankomst' : `${days} d`) }),
      inverse: true,
      min: 0,
      splitLine: { show: false },
      name: 'dagen voor aankomst',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: palette.muted, fontSize: 12 },
    },
    yAxis: valueAxis(palette, { formatter: valueFormatter, scale: true }),
    tooltip: {
      ...base(palette).tooltip,
      trigger: 'item',
      formatter: ({ seriesIndex, data }) => {
        if (seriesIndex === 3) return tooltipTitle(data.title) + tooltipRow(palette.deemphasis, 'gemeten', valueFormatter(data.value[1]));
        const week = curve[data.index];
        if (!week) return '';
        const title = week.from === 0 ? 'Laatste week voor aankomst' : `${week.from}–${week.from + 6} dagen voor aankomst`;
        return (
          tooltipTitle(title) +
          tooltipRow(color, name, valueFormatter(week.value)) +
          tooltipRow(palette.deemphasis, 'middelste helft', `${valueFormatter(week.low)} – ${valueFormatter(week.high)}`) +
          `<div style="font-size:12px;opacity:.7;margin-top:4px">${week.count} metingen</div>`
        );
      },
    },
    series: [
      { name: 'low', type: 'line', stack: 'band', data: curve.map((week) => [week.from + 3, week.low]), symbol: 'none', lineStyle: { opacity: 0 }, silent: true },
      {
        name: 'Middelste helft',
        type: 'line',
        stack: 'band',
        data: curve.map((week) => [week.from + 3, week.high - week.low]),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color, opacity: 0.14 },
        itemStyle: { color },
        silent: true,
      },
      {
        name,
        type: 'line',
        data: curve.map((week, index) => ({ value: [week.from + 3, week.value], index })),
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 2, color },
        itemStyle: dot(palette, color),
        z: 4,
        markLine:
          reference == null
            ? undefined
            : { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: palette.axis, type: 'solid', width: 1 }, data: [{ yAxis: reference }] },
      },
      {
        name: 'Losse metingen',
        type: 'scatter',
        data: points.map((point) => ({ value: [point.days, point.value], title: point.title })),
        symbolSize: 6,
        itemStyle: { color: palette.deemphasis, opacity: 0.5 },
        z: 2,
      },
    ],
  };
}

/**
 * Columns per category for a few series side by side, e.g. per hour of the day the share of prices that changed at
 * each provider.
 * @param series [{ name, color, values }]
 */
export function groupedColumns(palette, { labels, titles = labels, series, valueFormatter = percentLabel, tooltipNote }) {
  return {
    ...base(palette),
    legend: legend(palette, series.map((item) => item.name)),
    xAxis: categoryAxis(palette, labels),
    yAxis: valueAxis(palette, { formatter: valueFormatter }),
    tooltip: {
      ...axisTooltip(palette, (params) => {
        const index = params[0].dataIndex;
        const rows = series.map((item) => tooltipRow(item.color, item.name, item.values[index] == null ? '–' : valueFormatter(item.values[index])));
        const note = tooltipNote?.(index);
        return tooltipTitle(titles[index]) + rows.join('') + (note ? `<div style="font-size:12px;opacity:.7;margin-top:4px">${escapeHtml(note)}</div>` : '');
      }),
      axisPointer: { type: 'shadow', shadowStyle: { color: palette.grid, opacity: 0.5 } },
    },
    series: series.map((item) => ({
      name: item.name,
      type: 'bar',
      data: item.values,
      barMaxWidth: 12,
      barGap: '20%',
      itemStyle: { color: item.color, borderRadius: [4, 4, 0, 0] },
    })),
  };
}

const clock = (hours) => `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.round((hours % 1) * 60)).padStart(2, '0')}`;

/**
 * Every moment something happened, laid out by time of day (x) and day (y), one colour per group: whether things
 * happen at the same time each day shows as a column of dots.
 * @param groups [{ name, color, points: [{ x (hours), y (day index), size, title, rows }] }]
 */
export function dayTimeline(palette, { days, groups }) {
  return {
    ...base(palette),
    grid: { ...base(palette).grid, top: 40 },
    legend: legend(palette, groups.map((group) => group.name)),
    xAxis: {
      ...valueAxis(palette, { formatter: (hours) => clock(hours), min: 0, max: 24 }),
      interval: 3,
      splitLine: { lineStyle: { color: palette.grid } },
    },
    yAxis: { ...categoryAxis(palette, days), inverse: true, splitLine: { show: true, lineStyle: { color: palette.grid } } },
    tooltip: {
      ...base(palette).tooltip,
      trigger: 'item',
      formatter: ({ data, color }) => tooltipTitle(data.title) + data.rows.map(([label, value]) => tooltipRow(color, label, value)).join(''),
    },
    series: groups.map((group) => ({
      name: group.name,
      type: 'scatter',
      data: group.points.map((point) => ({ ...point, value: [point.x, point.y] })),
      symbolSize: (value, params) => params.data.size,
      itemStyle: { ...dot(palette, group.color), opacity: 0.85 },
      emphasis: { scale: 1.3 },
    })),
  };
}
