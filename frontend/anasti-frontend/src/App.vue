<script setup>
import { computed, reactive, ref, watch } from 'vue'
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
const groupedBuckets = computed(() => {
  const groups = analysisResult.value?.groups
  if (!groups) {
    return []
  }
  const values = Object.values(groups)
  if (!values.length) {
    return []
  }

  if (values[0]?.rows) {
    return [
      {
        label: t('results.groupDefault'),
        groups: Object.entries(groups),
        bucket: 'default',
      },
    ]
  }

  return Object.entries(groups).map(([bucket, bucketGroups]) => ({
    label: t(`results.groupBuckets.${bucket}`) || bucket,
    groups: Object.entries(bucketGroups),
    bucket,
  }))
})
const previewRows = computed(() => datasetRows.value.slice(0, 8))
const previewColumns = computed(() => availableColumns.value.slice(0, 8))
const numberLocale = computed(() => (locale.value === 'ru' ? 'ru-RU' : 'en-US'))

watch(availableColumns, (columns) => {
  if (!columns.length) {
    targetField.value = ''
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
})

watch(locale, () => {
  if (!errorMessage.value) {
    statusMessage.value = t('feedback.initial')
  }
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

      <article class="panel summary-panel">
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
            <div class="metric-grid">
              <article v-for="[column, values] in numericSummaryEntries" :key="column" class="metric-card">
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
            <div class="metric-grid">
              <article v-for="[column, values] in categoricalSummaryEntries" :key="column" class="metric-card">
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
            <div class="table-shell compact">
              <table>
                <thead>
                  <tr>
                    <th>{{ t('results.field') }}</th>
                    <th v-for="[column] in correlationEntries" :key="column">{{ column }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="[rowKey, rowValues] in correlationEntries" :key="rowKey">
                    <th>{{ rowKey }}</th>
                    <td v-for="[column] in correlationEntries" :key="column">
                      {{ formatNumber(rowValues[column]) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section v-if="groupedBuckets.length" class="metric-group">
            <h3>{{ t('results.targetGroups') }}</h3>
            <div v-for="bucket in groupedBuckets" :key="bucket.label" class="group-bucket">
              <h4 class="bucket-title">{{ bucket.label }}</h4>
              <div class="metric-grid">
                <article v-for="[groupName, details] in bucket.groups" :key="groupName" class="metric-card">
                  <h4>{{ formatGroupKey(bucket.bucket, groupName) }}</h4>
                  <p>{{ t('results.rowsLabel') }} {{ details.rows.length }}</p>
                  <p>
                    {{ t('results.numericFieldsLabel') }} {{ Object.keys(details.summary.numeric || {}).length }},
                    {{ t('results.categoriesLabel') }} {{ Object.keys(details.summary.categorical || {}).length }}
                  </p>
                </article>
              </div>
            </div>
          </section>
        </div>
        <p v-else class="empty-state">{{ t('results.analysisEmpty') }}</p>
      </article>
    </section>
  </div>
</template>
