<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { useI18n } from './i18n'

const { locale, setLocale, t, availableLocales } = useI18n()

const authBaseUrl = (import.meta.env.VITE_AUTH_URL || 'http://localhost:8001').replace(/\/$/, '')
const gatewayBaseUrl = (import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8000').replace(/\/$/, '')
const tokenStorageKey = 'anasti-auth'

const authMode = ref('login')
const activeImporter = ref('jsonText')
const loading = ref(false)
const importLoading = ref(false)
const analysisLoading = ref(false)
const statusMessage = ref(t('feedback.initial'))
const errorMessage = ref('')

const authForm = reactive({
  email: '',
  password: '',
})

const sqlForm = reactive({
  db_type: 'sqlite',
  host: '',
  port: '',
  database: '',
  username: '',
  password: '',
  query: 'SELECT * FROM users LIMIT 25',
})

const jsonText = ref(
  JSON.stringify(
    [
      { city: 'Moscow', segment: 'A', age: 21, salary: 1000, score: 71 },
      { city: 'SPB', segment: 'B', age: 25, salary: 1200, score: 80 },
      { city: 'Moscow', segment: 'A', age: 23, salary: 1100, score: 75 },
    ],
    null,
    2,
  ),
)
const selectedFile = ref(null)
const datasetColumns = ref({})
const datasetRows = ref([])
const analysisResult = ref(null)
const targetField = ref('')

const authState = reactive(loadStoredAuth())

const isAuthenticated = computed(() => Boolean(authState.accessToken))
const availableColumns = computed(() => {
  const rows = datasetRows.value
  if (!rows.length) {
    return []
  }
  return Object.keys(rows[0])
})
const numericSummaryEntries = computed(() =>
  analysisResult.value ? Object.entries(analysisResult.value.summary.numeric || {}) : [],
)
const categoricalSummaryEntries = computed(() =>
  analysisResult.value ? Object.entries(analysisResult.value.summary.categorical || {}) : [],
)
const correlationEntries = computed(() =>
  analysisResult.value ? Object.entries(analysisResult.value.summary.correlation || {}) : [],
)
const selectedNumericField = ref('')
const selectedCategoricalField = ref('')
const selectedCorrelationField = ref('')
const previewRows = computed(() => datasetRows.value.slice(0, 8))
const previewColumns = computed(() => availableColumns.value)
const numberLocale = computed(() => (locale.value === 'ru' ? 'ru-RU' : 'en-US'))
const numericColumns = computed(() =>
  availableColumns.value.filter((column) => {
    const numericValues = datasetRows.value
      .map((row) => asNumber(row[column]))
      .filter((value) => Number.isFinite(value))
    return numericValues.length > 1
  }),
)

const chartPalette = ['#ff6b3d', '#1c7ed6', '#f59f00', '#20c997', '#e64980', '#5c7cfa', '#fab005', '#12b886']
const chartConfig = reactive({
  scatterX: '',
  scatterY: '',
  pieCategory: '',
  pieValue: '',
  pieMode: 'count',
})
const chartRefs = {
  scatter: ref(null),
  pie: ref(null),
}
const chartInstances = reactive({
  scatter: null,
  pie: null,
})

const scatterSeries = computed(() => {
  if (!chartConfig.scatterX || !chartConfig.scatterY) {
    return {
      points: [],
      xMin: 0,
      xMax: 0,
      yMin: 0,
      yMax: 0,
      xType: 'value',
      yType: 'value',
      xCategories: [],
      yCategories: [],
      trend: null,
    }
  }

  const xInfo = buildAxisInfo(chartConfig.scatterX)
  const yInfo = buildAxisInfo(chartConfig.scatterY)

  const points = []
  const numericPoints = []

  for (const row of datasetRows.value) {
    const xRaw = row[chartConfig.scatterX]
    const yRaw = row[chartConfig.scatterY]
    const xVal = xInfo.type === 'value' ? asNumber(xRaw) : formatValue(xRaw)
    const yVal = yInfo.type === 'value' ? asNumber(yRaw) : formatValue(yRaw)

    if (xInfo.type === 'value' && !Number.isFinite(xVal)) {
      continue
    }
    if (yInfo.type === 'value' && !Number.isFinite(yVal)) {
      continue
    }
    if (xInfo.type === 'category' && xVal === '—') {
      continue
    }
    if (yInfo.type === 'category' && yVal === '—') {
      continue
    }

    points.push([xVal, yVal])
    if (xInfo.type === 'value' && yInfo.type === 'value') {
      numericPoints.push([xVal, yVal])
    }
  }

  if (!points.length) {
    return {
      points: [],
      xMin: 0,
      xMax: 0,
      yMin: 0,
      yMax: 0,
      xType: xInfo.type,
      yType: yInfo.type,
      xCategories: xInfo.categories,
      yCategories: yInfo.categories,
      trend: null,
    }
  }

  const xMin = xInfo.type === 'value' ? Math.min(...numericPoints.map((point) => point[0])) : 0
  const xMax = xInfo.type === 'value' ? Math.max(...numericPoints.map((point) => point[0])) : 0
  const yMin = yInfo.type === 'value' ? Math.min(...numericPoints.map((point) => point[1])) : 0
  const yMax = yInfo.type === 'value' ? Math.max(...numericPoints.map((point) => point[1])) : 0

  const trend = xInfo.type === 'value' && yInfo.type === 'value' ? buildTrendline(numericPoints) : null

  return {
    points,
    xMin,
    xMax,
    yMin,
    yMax,
    xType: xInfo.type,
    yType: yInfo.type,
    xCategories: xInfo.categories,
    yCategories: yInfo.categories,
    trend,
  }
})

const pieData = computed(() => {
  if (!chartConfig.pieCategory) {
    return { slices: [], total: 0 }
  }

  const bucket = new Map()
  const useSum = chartConfig.pieMode === 'sum' && chartConfig.pieValue

  for (const row of datasetRows.value) {
    const label = formatValue(row[chartConfig.pieCategory])
    if (label === '—') {
      continue
    }
    const current = bucket.get(label) || 0
    if (useSum) {
      const numeric = asNumber(row[chartConfig.pieValue])
      if (Number.isFinite(numeric)) {
        bucket.set(label, current + numeric)
      }
    } else {
      bucket.set(label, current + 1)
    }
  }

  const series = Array.from(bucket.entries())
    .map(([label, value]) => ({ label, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)

  const total = series.reduce((sum, item) => sum + item.value, 0)
  if (!total) {
    return { slices: [], total: 0 }
  }

  const slices = series.map((item, index) => ({
    ...item,
    color: chartPalette[index % chartPalette.length],
  }))

  return { slices, total }
})

watch(availableColumns, (columns) => {
  if (!columns.length) {
    targetField.value = ''
    chartConfig.pieCategory = ''
    chartConfig.scatterX = ''
    chartConfig.scatterY = ''
    return
  }

  if (!columns.includes(targetField.value)) {
    targetField.value =
      columns.find((column) => {
        const sample = datasetRows.value
          .map((row) => row[column])
          .filter((value) => value !== null && value !== undefined)
        const uniqueCount = new Set(sample).size
        return uniqueCount > 1 && uniqueCount <= Math.min(sample.length, 12)
      }) || ''
  }

  if (!columns.includes(chartConfig.pieCategory)) {
    chartConfig.pieCategory = columns[0] || ''
  }

  if (!columns.includes(chartConfig.scatterX)) {
    chartConfig.scatterX = columns[0] || ''
  }
  if (!columns.includes(chartConfig.scatterY)) {
    chartConfig.scatterY = columns[1] || columns[0] || ''
  }
  if (chartConfig.scatterX === chartConfig.scatterY && columns.length > 1) {
    chartConfig.scatterY = columns.find((column) => column !== chartConfig.scatterX) || columns[0]
  }
})

watch(numericSummaryEntries, (entries) => {
  if (!entries.length) {
    selectedNumericField.value = ''
    return
  }
  if (!entries.find(([key]) => key === selectedNumericField.value)) {
    selectedNumericField.value = entries[0][0]
  }
})

watch(categoricalSummaryEntries, (entries) => {
  if (!entries.length) {
    selectedCategoricalField.value = ''
    return
  }
  if (!entries.find(([key]) => key === selectedCategoricalField.value)) {
    selectedCategoricalField.value = entries[0][0]
  }
})

watch(correlationEntries, (entries) => {
  if (!entries.length) {
    selectedCorrelationField.value = ''
    return
  }
  if (!entries.find(([key]) => key === selectedCorrelationField.value)) {
    selectedCorrelationField.value = entries[0][0]
  }
})

watch(numericColumns, (columns) => {
  if (!columns.length) {
    chartConfig.pieValue = ''
    if (chartConfig.pieMode === 'sum') {
      chartConfig.pieMode = 'count'
    }
    return
  }

  if (!columns.includes(chartConfig.pieValue)) {
    chartConfig.pieValue = columns[0]
  }
})

const groupOptions = computed(() => {
  const groups = analysisResult.value?.groups
  if (!groups) {
    return []
  }
  const values = Object.values(groups)
  if (!values.length) {
    return []
  }

  if (values[0]?.rows) {
    return Object.entries(groups).map(([groupName, details]) => ({
      key: `default:${groupName}`,
      label: formatGroupKey('default', groupName),
      details,
    }))
  }

  return Object.entries(groups).flatMap(([bucket, bucketGroups]) => {
    const bucketLabel = t(`results.groupBuckets.${bucket}`) || bucket
    return Object.entries(bucketGroups).map(([groupName, details]) => ({
      key: `${bucket}:${groupName}`,
      label: `${bucketLabel}: ${formatGroupKey(bucket, groupName)}`,
      details,
    }))
  })
})
const selectedGroupKeys = ref([])
const selectedGroups = computed(() => groupOptions.value.filter((option) => selectedGroupKeys.value.includes(option.key)))
const selectedGroupLabels = computed(() => selectedGroups.value.map((group) => group.label).join(', '))
const selectedGroupRows = computed(() =>
  selectedGroups.value.flatMap((group) => group.details?.rows || []),
)
const selectedGroupRowCount = computed(() => selectedGroupRows.value.length)
const groupSelectionSummary = ref(null)
const groupSelectionLoading = ref(false)
const groupNumericEntries = computed(() =>
  groupSelectionSummary.value ? Object.entries(groupSelectionSummary.value.numeric || {}) : [],
)
const groupCategoricalEntries = computed(() =>
  groupSelectionSummary.value ? Object.entries(groupSelectionSummary.value.categorical || {}) : [],
)
const groupCorrelationEntries = computed(() =>
  groupSelectionSummary.value ? Object.entries(groupSelectionSummary.value.correlation || {}) : [],
)
const selectedGroupNumericField = ref('')
const selectedGroupCategoricalField = ref('')
const selectedGroupCorrelationField = ref('')

watch(groupOptions, (options) => {
  if (!options.length) {
    selectedGroupKeys.value = []
    return
  }
  const availableKeys = options.map((option) => option.key)
  const nextKeys = selectedGroupKeys.value.filter((key) => availableKeys.includes(key))
  if (!nextKeys.length) {
    selectedGroupKeys.value = [options[0].key]
    return
  }
  if (nextKeys.length !== selectedGroupKeys.value.length) {
    selectedGroupKeys.value = nextKeys
  }
})

watch(selectedGroupKeys, async () => {
  if (!selectedGroupRows.value.length) {
    groupSelectionSummary.value = null
    return
  }

  groupSelectionLoading.value = true
  try {
    const data = rowsToDatasetMap(selectedGroupRows.value)
    const response = await gatewayFetch('/analysis/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        target: null,
      }),
    })
    groupSelectionSummary.value = response.summary
  } catch {
    groupSelectionSummary.value = null
  } finally {
    groupSelectionLoading.value = false
  }
})

watch(groupNumericEntries, (entries) => {
  if (!entries.length) {
    selectedGroupNumericField.value = ''
    return
  }
  if (!entries.find(([key]) => key === selectedGroupNumericField.value)) {
    selectedGroupNumericField.value = entries[0][0]
  }
})

watch(groupCategoricalEntries, (entries) => {
  if (!entries.length) {
    selectedGroupCategoricalField.value = ''
    return
  }
  if (!entries.find(([key]) => key === selectedGroupCategoricalField.value)) {
    selectedGroupCategoricalField.value = entries[0][0]
  }
})

watch(groupCorrelationEntries, (entries) => {
  if (!entries.length) {
    selectedGroupCorrelationField.value = ''
    return
  }
  if (!entries.find(([key]) => key === selectedGroupCorrelationField.value)) {
    selectedGroupCorrelationField.value = entries[0][0]
  }
})

const handleResize = () => {
  Object.values(chartInstances).forEach((instance) => {
    if (instance) {
      instance.resize()
    }
  })
}

onMounted(() => {
  nextTick(() => {
    renderScatterChart()
    renderPieChart()
  })
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  destroyChart('scatter')
  destroyChart('pie')
})

watch(scatterSeries, () => nextTick(renderScatterChart), { deep: true })
watch(pieData, () => nextTick(renderPieChart), { deep: true })
watch(
  () => [chartConfig.scatterX, chartConfig.scatterY],
  () => nextTick(renderScatterChart),
)
watch(
  () => [chartConfig.pieCategory, chartConfig.pieValue, chartConfig.pieMode],
  () => nextTick(renderPieChart),
)

watch(locale, () => {
  if (!errorMessage.value) {
    statusMessage.value = t('feedback.initial')
  }
  nextTick(() => {
    renderScatterChart()
    renderPieChart()
  })
})

function loadStoredAuth() {
  try {
    const parsed = JSON.parse(localStorage.getItem(tokenStorageKey) || '{}')
    return {
      accessToken: parsed.accessToken || '',
      refreshToken: parsed.refreshToken || '',
      tokenType: parsed.tokenType || 'bearer',
      email: parsed.email || '',
    }
  } catch {
    return {
      accessToken: '',
      refreshToken: '',
      tokenType: 'bearer',
      email: '',
    }
  }
}

function persistAuth() {
  localStorage.setItem(tokenStorageKey, JSON.stringify(authState))
}

function resetMessages() {
  errorMessage.value = ''
  statusMessage.value = ''
}

function setStatus(key, params = {}) {
  statusMessage.value = t(key, params)
}

function setError(key, params = {}) {
  errorMessage.value = t(key, params)
}

async function submitAuth() {
  resetMessages()
  loading.value = true

  try {
    const path = authMode.value === 'login' ? '/auth/login' : '/auth/register'
    const response = await fetch(`${authBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: authForm.email,
        password: authForm.password,
      }),
    })

    const payload = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeError(payload))
    }

    authState.accessToken = payload.access_token
    authState.refreshToken = payload.refresh_token
    authState.tokenType = payload.token_type || 'bearer'
    authState.email = authForm.email
    persistAuth()
    setStatus(authMode.value === 'login' ? 'auth.loggedIn' : 'auth.registered', {
      email: authForm.email,
    })
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

function logout() {
  authState.accessToken = ''
  authState.refreshToken = ''
  authState.tokenType = 'bearer'
  authState.email = ''
  persistAuth()
  setStatus('auth.sessionCleared')
}

async function importDataset() {
  resetMessages()
  importLoading.value = true
  analysisResult.value = null

  try {
    let response

    if (activeImporter.value === 'jsonText') {
      const parsed = JSON.parse(jsonText.value)
      response = await gatewayFetch('/collector/import/json-parser/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
    } else if (activeImporter.value === 'sql') {
      response = await gatewayFetch('/collector/import/sql-parser/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          db_type: sqlForm.db_type,
          host: sqlForm.host || null,
          port: sqlForm.port ? Number(sqlForm.port) : null,
          database: sqlForm.database || null,
          username: sqlForm.username || null,
          password: sqlForm.password || null,
          query: sqlForm.query,
        }),
      })
    } else {
      if (!selectedFile.value) {
        setError('import.chooseFileError')
        return
      }

      const endpoint = resolveFileEndpoint(selectedFile.value.name)
      if (!endpoint) {
        setError('import.unsupportedFile')
        return
      }

      const formData = new FormData()
      formData.append('file', selectedFile.value)
      response = await gatewayFetch(endpoint, {
        method: 'POST',
        body: formData,
      })
    }

    datasetColumns.value = response
    datasetRows.value = columnarToRows(response)
    setStatus('import.importedStatus', {
      rows: datasetRows.value.length,
      source: importSourceLabel(activeImporter.value),
    })
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    importLoading.value = false
  }
}

async function analyzeDataset() {
  resetMessages()
  analysisLoading.value = true

  try {
    if (!datasetRows.value.length) {
      setError('analysis.needDataset')
      return
    }

    const data = rowsToDatasetMap(datasetRows.value)
    analysisResult.value = await gatewayFetch('/analysis/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        target: targetField.value || null,
      }),
    })
    setStatus('analysis.completed', { rows: datasetRows.value.length })
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    analysisLoading.value = false
  }
}

async function gatewayFetch(path, options = {}) {
  if (!authState.accessToken) {
    throw new Error(t('feedback.authFirst'))
  }

  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${authState.accessToken}`)

  const response = await fetch(`${gatewayBaseUrl}${path}`, {
    ...options,
    headers,
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(normalizeError(payload))
  }

  return payload
}

function resolveFileEndpoint(filename) {
  const normalized = filename.toLowerCase()
  if (normalized.endsWith('.csv')) {
    return '/collector/import/csv-parser/csv'
  }
  if (normalized.endsWith('.json')) {
    return '/collector/import/json-parser/file'
  }
  if (normalized.endsWith('.xml')) {
    return '/collector/import/xml-parser/xml'
  }
  if (normalized.endsWith('.xlsx') || normalized.endsWith('.xls')) {
    return '/collector/import/xlsx-parser/xlsx'
  }
  return null
}

function columnarToRows(payload) {
  const columns = Object.keys(payload || {})
  const rowCount = columns.reduce((max, key) => Math.max(max, payload[key]?.length || 0), 0)

  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const row = {}
    for (const column of columns) {
      row[column] = payload[column]?.[rowIndex] ?? null
    }
    return row
  })
}

function rowsToDatasetMap(rows) {
  return Object.fromEntries(rows.map((row, index) => [String(index + 1), row]))
}

async function readJson(response) {
  const text = await response.text()
  return text ? JSON.parse(text) : {}
}

function normalizeError(payload) {
  if (typeof payload === 'string') {
    return payload
  }
  return payload?.detail || payload?.message || t('feedback.requestFailed')
}

function importSourceLabel(source) {
  if (source === 'jsonText') {
    return t('import.sourceJson')
  }
  if (source === 'sql') {
    return t('import.sourceSql')
  }
  return t('import.sourceFile')
}

function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return value
  }
  return new Intl.NumberFormat(numberLocale.value, { maximumFractionDigits: 3 }).format(value)
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') {
    return NaN
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/\s/g, '').replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : NaN
  }
  return NaN
}

function buildAxisInfo(column) {
  const values = datasetRows.value.map((row) => row[column]).filter((value) => value !== null && value !== undefined)
  if (!values.length) {
    return { type: 'value', categories: [] }
  }

  const numericValues = values.map((value) => asNumber(value)).filter((value) => Number.isFinite(value))
  const nonNumericCount = values.filter((value) => !Number.isFinite(asNumber(value))).length

  if (numericValues.length && nonNumericCount === 0) {
    return { type: 'value', categories: [] }
  }

  const seen = new Set()
  const categories = []
  for (const value of values) {
    const label = formatValue(value)
    if (label === '—' || seen.has(label)) {
      continue
    }
    seen.add(label)
    categories.push(label)
  }

  return { type: 'category', categories }
}

function buildTrendline(points) {
  if (!points.length) {
    return null
  }

  const finite = points.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
  if (finite.length < 2) {
    return null
  }

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (const [x, y] of finite) {
    sumX += x
    sumY += y
    sumXY += x * y
    sumXX += x * x
  }
  const n = finite.length
  const denominator = n * sumXX - sumX * sumX
  if (denominator === 0) {
    return null
  }
  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n
  const xMin = Math.min(...finite.map((point) => point[0]))
  const xMax = Math.max(...finite.map((point) => point[0]))

  return [
    [xMin, slope * xMin + intercept],
    [xMax, slope * xMax + intercept],
  ]
}

function truncateLabel(value, max = 15) {
  if (value === null || value === undefined) {
    return ''
  }
  const text = String(value)
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max - 1)}…`
}

function axisLabelOptions(isCategory) {
  if (!isCategory) {
    return undefined
  }
  return {
    interval: 0,
    rotate: 45,
    margin: 14,
    align: 'right',
    verticalAlign: 'middle',
    hideOverlap: true,
    width: 120,
    overflow: 'truncate',
    formatter: (value) => truncateLabel(value),
  }
}

function destroyChart(name) {
  if (chartInstances[name]) {
    chartInstances[name].dispose()
    chartInstances[name] = null
  }
}

function initChart(name) {
  const el = chartRefs[name]?.value
  if (!el) {
    return null
  }

  if (chartInstances[name] && chartInstances[name].getDom() !== el) {
    destroyChart(name)
  }

  if (!chartInstances[name]) {
    chartInstances[name] = echarts.init(el)
  }

  return chartInstances[name]
}

function renderScatterChart() {
  if (!scatterSeries.value.points.length) {
    destroyChart('scatter')
    return
  }

  const instance = initChart('scatter')
  if (!instance) {
    return
  }

  const isXCategory = scatterSeries.value.xType === 'category'
  const isYCategory = scatterSeries.value.yType === 'category'

  instance.setOption(
    {
      tooltip: { trigger: 'item' },
      grid: {
        left: isYCategory ? 120 : 48,
        right: 24,
        top: 24,
        bottom: isXCategory ? 110 : 36,
      },
      xAxis: {
        type: scatterSeries.value.xType,
        name: chartConfig.scatterX,
        nameGap: 22,
        nameLocation: 'middle',
        data: scatterSeries.value.xType === 'category' ? scatterSeries.value.xCategories : undefined,
        axisLabel: axisLabelOptions(isXCategory),
      },
      yAxis: {
        type: scatterSeries.value.yType,
        name: chartConfig.scatterY,
        nameGap: 30,
        nameLocation: 'middle',
        data: scatterSeries.value.yType === 'category' ? scatterSeries.value.yCategories : undefined,
        axisLabel: axisLabelOptions(isYCategory),
      },
      series: [
        {
          type: 'scatter',
          data: scatterSeries.value.points,
          symbolSize: 8,
          itemStyle: { color: '#1c7ed6' },
        },
        ...(scatterSeries.value.trend
          ? [
              {
                type: 'line',
                data: scatterSeries.value.trend,
                showSymbol: false,
                lineStyle: { width: 2, type: 'dashed', color: '#ff6b3d' },
              },
            ]
          : []),
      ],
    },
    true,
  )
}

function renderPieChart() {
  if (!pieData.value.slices.length) {
    destroyChart('pie')
    return
  }

  const instance = initChart('pie')
  if (!instance) {
    return
  }

  instance.setOption(
    {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['30%', '70%'],
          label: { show: false },
          labelLine: { show: false },
          data: pieData.value.slices.map((slice) => ({
            name: slice.label,
            value: slice.value,
            itemStyle: { color: slice.color },
          })),
        },
      ],
    },
    true,
  )
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return '—'
  }
  if (value instanceof Date) {
    return formatDate(value)
  }
  if (typeof value === 'string') {
    const parsed = parseDateString(value)
    if (parsed) {
      return formatDate(parsed)
    }
  }
  return value
}

function parseDateString(value) {
  const hasDateMarkers = /[T:\-\.]/.test(value)
  if (!hasDateMarkers) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

function formatDate(date) {
  const pad = (num) => String(num).padStart(2, '0')
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const day = pad(date.getDate())
  const month = pad(date.getMonth() + 1)
  const year = date.getFullYear()
  return `${hours}:${minutes} ${day}.${month}.${year}`
}

function formatGroupKey(bucket, key) {
  if (bucket === 'hour') {
    return `${key}:00`
  }
  if (bucket === 'weekday') {
    return t(`results.weekdays.${key}`)
  }
  if (bucket === 'month') {
    return t(`results.months.${key}`)
  }
  return key
}
</script>

<template>
  <div class="shell">
    <section class="hero-panel">
      <div class="hero-top">
        <p class="eyebrow">{{ t('app.eyebrow') }}</p>
        <label class="lang-switch">
          <span>{{ t('language.label') }}</span>
          <select :value="locale" @change="setLocale($event.target.value)">
            <option v-for="lang in availableLocales" :key="lang" :value="lang">
              {{ t(`language.${lang}`) }}
            </option>
          </select>
        </label>
      </div>
      <h1>{{ t('app.headline') }}</h1>
      <p class="hero-copy">
        {{ t('app.heroCopy') }}
      </p>

      <div class="hero-grid">
        <article class="stat-card">
          <span class="stat-label">{{ t('app.gateway') }}</span>
          <strong>{{ gatewayBaseUrl }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">{{ t('app.auth') }}</span>
          <strong>{{ authBaseUrl }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">{{ t('app.session') }}</span>
          <strong>{{ isAuthenticated ? authState.email || t('app.authenticated') : t('app.anonymous') }}</strong>
        </article>
      </div>
    </section>

    <section class="workspace-grid">
      <article class="panel auth-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">{{ t('steps.step1') }}</p>
            <h2>{{ t('auth.title') }}</h2>
          </div>
        </div>

        <form class="stack" @submit.prevent="submitAuth">
          <label class="field">
            <span>{{ t('auth.email') }}</span>
            <input v-model="authForm.email" autocomplete="email" :placeholder="t('auth.emailPlaceholder')" type="email" />
          </label>
          <label class="field">
            <span>{{ t('auth.password') }}</span>
            <input
              v-model="authForm.password"
              autocomplete="current-password"
              :placeholder="t('auth.passwordPlaceholder')"
              type="password"
            />
          </label>

          <div class="action-row">
            <button class="primary-button" :disabled="loading" type="submit">
              {{ loading ? t('auth.sending') : authMode === 'login' ? t('auth.enterWorkspace') : t('auth.createAccount') }}
            </button>
            <button class="ghost-button" :disabled="!isAuthenticated" type="button" @click="logout">
              {{ t('auth.clearToken') }}
            </button>
          </div>

          <div class="chip-row">
            <button
              class="chip"
              :class="{ active: authMode === 'login' }"
              type="button"
              @click="authMode = 'login'"
            >
              {{ t('auth.login') }}
            </button>
            <button
              class="chip"
              :class="{ active: authMode === 'register' }"
              type="button"
              @click="authMode = 'register'"
            >
              {{ t('auth.register') }}
            </button>
          </div>
        </form>
      </article>

      <article class="panel import-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">{{ t('steps.step2') }}</p>
            <h2>{{ t('import.title') }}</h2>
          </div>
          <div class="chip-row">
            <button
              class="chip"
              :class="{ active: activeImporter === 'jsonText' }"
              type="button"
              @click="activeImporter = 'jsonText'"
            >
              {{ t('import.json') }}
            </button>
            <button
              class="chip"
              :class="{ active: activeImporter === 'file' }"
              type="button"
              @click="activeImporter = 'file'"
            >
              {{ t('import.file') }}
            </button>
            <button
              class="chip"
              :class="{ active: activeImporter === 'sql' }"
              type="button"
              @click="activeImporter = 'sql'"
            >
              {{ t('import.sql') }}
            </button>
          </div>
        </div>

        <div v-if="activeImporter === 'jsonText'" class="stack">
          <label class="field">
            <span>{{ t('import.jsonPayload') }}</span>
            <textarea v-model="jsonText" rows="12" spellcheck="false" />
          </label>
        </div>

        <div v-else-if="activeImporter === 'file'" class="stack">
          <label class="field">
            <span>{{ t('import.fileSource') }}</span>
            <input
              accept=".csv,.json,.xml,.xlsx,.xls"
              type="file"
              @change="selectedFile = $event.target.files?.[0] || null"
            />
          </label>
          <p class="hint">{{ t('import.fileHint') }}</p>
        </div>

        <div v-else class="stack sql-grid">
          <label class="field">
            <span>{{ t('import.dbType') }}</span>
            <select v-model="sqlForm.db_type">
              <option value="sqlite">SQLite</option>
              <option value="postgresql">PostgreSQL</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('import.host') }}</span>
            <input v-model="sqlForm.host" placeholder="localhost" type="text" />
          </label>
          <label class="field">
            <span>{{ t('import.port') }}</span>
            <input v-model="sqlForm.port" placeholder="5432" type="text" />
          </label>
          <label class="field">
            <span>{{ t('import.database') }}</span>
            <input v-model="sqlForm.database" placeholder="/tmp/data.db or app" type="text" />
          </label>
          <label class="field">
            <span>{{ t('import.username') }}</span>
            <input v-model="sqlForm.username" placeholder="postgres" type="text" />
          </label>
          <label class="field">
            <span>{{ t('import.password') }}</span>
            <input v-model="sqlForm.password" placeholder="secret" type="password" />
          </label>
          <label class="field field-wide">
            <span>{{ t('import.query') }}</span>
            <textarea v-model="sqlForm.query" rows="6" spellcheck="false" />
          </label>
        </div>

        <div class="action-row">
          <button class="primary-button" :disabled="importLoading || !isAuthenticated" type="button" @click="importDataset">
            {{ importLoading ? t('import.importing') : t('import.importButton') }}
          </button>
        </div>
      </article>

      <article class="panel analysis-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">{{ t('steps.step3') }}</p>
            <h2>{{ t('analysis.title') }}</h2>
          </div>
        </div>

        <div class="stack">
          <label class="field">
            <span>{{ t('analysis.targetField') }}</span>
            <select v-model="targetField">
              <option value="">{{ t('analysis.noGrouping') }}</option>
              <option v-for="column in availableColumns" :key="column" :value="column">
                {{ column }}
              </option>
            </select>
          </label>

          <div class="action-row">
            <button
              class="primary-button"
              :disabled="analysisLoading || !datasetRows.length || !isAuthenticated"
              type="button"
              @click="analyzeDataset"
            >
              {{ analysisLoading ? t('analysis.analyzing') : t('analysis.analyze') }}
            </button>
          </div>
        </div>
      </article>
    </section>

    <section class="feedback-strip" :class="{ error: errorMessage }">
      <p>{{ errorMessage || statusMessage }}</p>
    </section>

    <section class="results-grid">
      <article class="panel preview-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">{{ t('results.dataset') }}</p>
            <h2>{{ t('results.preview') }}</h2>
          </div>
          <strong class="badge">{{ t('results.rows', { count: datasetRows.length }) }}</strong>
        </div>

        <div v-if="previewRows.length" class="table-shell">
          <table>
            <thead>
              <tr>
                <th v-for="column in previewColumns" :key="column">{{ column }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in previewRows" :key="index">
                <td v-for="column in previewColumns" :key="column">{{ formatValue(row[column]) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-state">{{ t('results.emptyDataset') }}</p>
      </article>

      <article class="panel summary-panel group-summary-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">{{ t('results.analysis') }}</p>
            <h2>{{ t('results.summary') }}</h2>
          </div>
          <strong class="badge">{{ t('results.analyzed', { count: analysisResult?.summary?.row_count || 0 }) }}</strong>
        </div>

        <div v-if="analysisResult" class="summary-stack">
          <section class="metric-group">
            <h3>{{ t('results.numericFields') }}</h3>
            <p class="helper">{{ t('results.numericHelp') }}</p>
            <label class="field">
              <span>{{ t('results.numericSelect') }}</span>
              <select v-model="selectedNumericField">
                <option v-for="[column] in numericSummaryEntries" :key="column" :value="column">
                  {{ column }}
                </option>
              </select>
            </label>
            <div class="metric-grid">
              <article
                v-for="[column, values] in numericSummaryEntries.filter(([key]) => key === selectedNumericField)"
                :key="column"
                class="metric-card"
              >
                <h4>{{ column }}</h4>
                <p>{{ t('results.mean') }} {{ formatNumber(values.mean) }}</p>
                <p class="helper">{{ t('results.meanHelp') }}</p>
                <p>{{ t('results.median') }} {{ formatNumber(values.median) }}</p>
                <p class="helper">{{ t('results.medianHelp') }}</p>
                <p>{{ t('results.std') }} {{ formatNumber(values.std) }}</p>
                <p class="helper">{{ t('results.stdHelp') }}</p>
                <p>
                  {{
                    t('results.range', {
                      min: formatNumber(values.min),
                      max: formatNumber(values.max),
                    })
                  }}
                </p>
                <p class="helper">{{ t('results.rangeHelp') }}</p>
              </article>
            </div>
          </section>

          <section class="metric-group">
            <h3>{{ t('results.categoricalFields') }}</h3>
            <p class="helper">{{ t('results.categoricalHelp') }}</p>
            <label class="field">
              <span>{{ t('results.categoricalSelect') }}</span>
              <select v-model="selectedCategoricalField">
                <option v-for="[column] in categoricalSummaryEntries" :key="column" :value="column">
                  {{ column }}
                </option>
              </select>
            </label>
            <div class="metric-grid">
              <article
                v-for="[column, values] in categoricalSummaryEntries.filter(([key]) => key === selectedCategoricalField)"
                :key="column"
                class="metric-card"
              >
                <h4>{{ column }}</h4>
                <p>{{ t('results.unique') }} {{ values.unique_values.length }}</p>
                <p>
                  {{ t('results.top') }}:
                  {{
                    values.top_values
                      .map((item) => `${formatValue(item.value)} (${item.count})`)
                      .join(', ')
                  }}
                </p>
              </article>
            </div>
          </section>

          <section class="metric-group">
            <h3>{{ t('results.correlation') }}</h3>
            <p class="helper">{{ t('results.correlationHelp') }}</p>
            <label class="field">
              <span>{{ t('results.correlationSelect') }}</span>
              <select v-model="selectedCorrelationField">
                <option v-for="[column] in correlationEntries" :key="column" :value="column">
                  {{ column }}
                </option>
              </select>
            </label>
            <div class="table-shell compact">
              <table>
                <thead>
                  <tr>
                    <th>{{ t('results.field') }}</th>
                    <th v-for="[column] in correlationEntries" :key="column">{{ column }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="[rowKey, rowValues] in correlationEntries.filter(([key]) => key === selectedCorrelationField)"
                    :key="rowKey"
                  >
                    <th>{{ rowKey }}</th>
                    <td v-for="[column] in correlationEntries" :key="column">
                      {{ formatNumber(rowValues[column]) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

        </div>
        <p v-else class="empty-state">{{ t('results.analysisEmpty') }}</p>
      </article>

      <article class="panel summary-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">{{ t('results.analysis') }}</p>
            <h2>{{ t('results.targetGroups') }}</h2>
          </div>
          <strong class="badge">{{ selectedGroupRowCount }}</strong>
        </div>

        <div v-if="groupOptions.length" class="summary-stack">
          <section class="metric-group">
            <div class="group-checkboxes">
              <label v-for="option in groupOptions" :key="option.key" class="checkbox-chip">
                <input v-model="selectedGroupKeys" type="checkbox" :value="option.key" />
                <span>{{ option.label }}</span>
              </label>
            </div>

            <div v-if="selectedGroupKeys.length" class="summary-stack">
              <article class="metric-card">
                <h4>{{ selectedGroupLabels || t('results.targetGroups') }}</h4>
                <p>{{ t('results.rowsLabel') }} {{ selectedGroupRowCount }}</p>
                <p v-if="groupSelectionLoading" class="helper">{{ t('analysis.analyzing') }}</p>
              </article>

              <template v-if="groupSelectionSummary">
                <section class="metric-group">
                  <h3>{{ t('results.numericFields') }}</h3>
                  <p class="helper">{{ t('results.numericHelp') }}</p>
                  <label class="field">
                    <span>{{ t('results.numericSelect') }}</span>
                    <select v-model="selectedGroupNumericField">
                      <option v-for="[column] in groupNumericEntries" :key="column" :value="column">
                        {{ column }}
                      </option>
                    </select>
                  </label>
                  <div class="metric-grid">
                    <article
                      v-for="[column, values] in groupNumericEntries.filter(
                        ([key]) => key === selectedGroupNumericField,
                      )"
                      :key="column"
                      class="metric-card"
                    >
                      <h4>{{ column }}</h4>
                      <p>{{ t('results.mean') }} {{ formatNumber(values.mean) }}</p>
                      <p class="helper">{{ t('results.meanHelp') }}</p>
                      <p>{{ t('results.median') }} {{ formatNumber(values.median) }}</p>
                      <p class="helper">{{ t('results.medianHelp') }}</p>
                      <p>{{ t('results.std') }} {{ formatNumber(values.std) }}</p>
                      <p class="helper">{{ t('results.stdHelp') }}</p>
                      <p>
                        {{
                          t('results.range', {
                            min: formatNumber(values.min),
                            max: formatNumber(values.max),
                          })
                        }}
                      </p>
                      <p class="helper">{{ t('results.rangeHelp') }}</p>
                    </article>
                  </div>
                </section>

                <section class="metric-group">
                  <h3>{{ t('results.categoricalFields') }}</h3>
                  <p class="helper">{{ t('results.categoricalHelp') }}</p>
                  <label class="field">
                    <span>{{ t('results.categoricalSelect') }}</span>
                    <select v-model="selectedGroupCategoricalField">
                      <option v-for="[column] in groupCategoricalEntries" :key="column" :value="column">
                        {{ column }}
                      </option>
                    </select>
                  </label>
                  <div class="metric-grid">
                    <article
                      v-for="[column, values] in groupCategoricalEntries.filter(
                        ([key]) => key === selectedGroupCategoricalField,
                      )"
                      :key="column"
                      class="metric-card"
                    >
                      <h4>{{ column }}</h4>
                      <p>{{ t('results.unique') }} {{ values.unique_values.length }}</p>
                      <p>
                        {{ t('results.top') }}:
                        {{
                          values.top_values
                            .map((item) => `${formatValue(item.value)} (${item.count})`)
                            .join(', ')
                        }}
                      </p>
                    </article>
                  </div>
                </section>

                <section class="metric-group">
                  <h3>{{ t('results.correlation') }}</h3>
                  <p class="helper">{{ t('results.correlationHelp') }}</p>
                  <label class="field">
                    <span>{{ t('results.correlationSelect') }}</span>
                    <select v-model="selectedGroupCorrelationField">
                      <option v-for="[column] in groupCorrelationEntries" :key="column" :value="column">
                        {{ column }}
                      </option>
                    </select>
                  </label>
                  <div class="table-shell compact">
                    <table>
                      <thead>
                        <tr>
                          <th>{{ t('results.field') }}</th>
                          <th v-for="[column] in groupCorrelationEntries" :key="column">{{ column }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="[rowKey, rowValues] in groupCorrelationEntries.filter(
                            ([key]) => key === selectedGroupCorrelationField,
                          )"
                          :key="rowKey"
                        >
                          <th>{{ rowKey }}</th>
                          <td v-for="[column] in groupCorrelationEntries" :key="column">
                            {{ formatNumber(rowValues[column]) }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </template>
            </div>
          </section>
        </div>
        <p v-else class="empty-state">{{ t('results.analysisEmpty') }}</p>
      </article>
    </section>

    <section class="charts-grid">
      <article class="panel chart-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">{{ t('charts.kicker') }}</p>
            <h2>{{ t('charts.title') }}</h2>
          </div>
          <strong class="badge">{{ t('charts.rows', { count: datasetRows.length }) }}</strong>
        </div>

        <div v-if="datasetRows.length" class="chart-grid">
          <article class="chart-card">
            <div class="chart-head">
              <h3>{{ t('charts.scatterTitle') }}</h3>
              <p class="helper">{{ t('charts.scatterHelp') }}</p>
            </div>

            <div class="chart-controls">
              <label class="field">
                <span>{{ t('charts.scatterX') }}</span>
                <select v-model="chartConfig.scatterX">
                  <option v-for="column in availableColumns" :key="column" :value="column">
                    {{ column }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span>{{ t('charts.scatterY') }}</span>
                <select v-model="chartConfig.scatterY">
                  <option v-for="column in availableColumns" :key="column" :value="column">
                    {{ column }}
                  </option>
                </select>
              </label>
            </div>

            <div class="chart-visual">
              <div v-if="scatterSeries.points.length" :ref="chartRefs.scatter" class="chart-canvas" />
              <p v-else class="empty-state">{{ t('charts.noNumeric') }}</p>
            </div>

            <div v-if="scatterSeries.points.length && scatterSeries.xType === 'value' && scatterSeries.yType === 'value'" class="chart-meta">
              <span>
                {{ t('charts.rangeX', { min: formatNumber(scatterSeries.xMin), max: formatNumber(scatterSeries.xMax) }) }}
              </span>
              <span>
                {{ t('charts.rangeY', { min: formatNumber(scatterSeries.yMin), max: formatNumber(scatterSeries.yMax) }) }}
              </span>
            </div>
          </article>

          <article class="chart-card">
            <div class="chart-head">
              <h3>{{ t('charts.pieTitle') }}</h3>
              <p class="helper">{{ t('charts.pieHelp') }}</p>
            </div>

            <div class="chart-controls">
              <label class="field">
                <span>{{ t('charts.pieCategory') }}</span>
                <select v-model="chartConfig.pieCategory">
                  <option v-for="column in availableColumns" :key="column" :value="column">
                    {{ column }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span>{{ t('charts.pieMode') }}</span>
                <select v-model="chartConfig.pieMode">
                  <option value="count">{{ t('charts.pieCount') }}</option>
                  <option value="sum">{{ t('charts.pieSum') }}</option>
                </select>
              </label>
              <label class="field">
                <span>{{ t('charts.pieValue') }}</span>
                <select v-model="chartConfig.pieValue" :disabled="chartConfig.pieMode !== 'sum'">
                  <option v-for="column in numericColumns" :key="column" :value="column">
                    {{ column }}
                  </option>
                </select>
              </label>
            </div>

            <div class="chart-visual">
              <div v-if="pieData.slices.length" :ref="chartRefs.pie" class="chart-canvas" />
              <p v-else class="empty-state">{{ t('charts.noCategory') }}</p>
            </div>

          </article>
        </div>

        <p v-else class="empty-state">{{ t('charts.empty') }}</p>
      </article>
    </section>
  </div>
</template>
