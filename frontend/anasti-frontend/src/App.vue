<script setup>
import { computed, reactive, ref, watch } from 'vue'

const authBaseUrl = (import.meta.env.VITE_AUTH_URL || 'http://localhost:8001').replace(/\/$/, '')
const gatewayBaseUrl = (import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8000').replace(/\/$/, '')
const tokenStorageKey = 'anasti-auth'

const authMode = ref('login')
const activeImporter = ref('jsonText')
const loading = ref(false)
const importLoading = ref(false)
const analysisLoading = ref(false)
const statusMessage = ref('Connect auth, import a dataset, then run analysis through the gateway.')
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
const groupedEntries = computed(() =>
  analysisResult.value?.groups ? Object.entries(analysisResult.value.groups) : [],
)
const previewRows = computed(() => datasetRows.value.slice(0, 8))
const previewColumns = computed(() => availableColumns.value.slice(0, 8))

watch(availableColumns, (columns) => {
  if (!columns.length) {
    targetField.value = ''
    return
  }

  if (!columns.includes(targetField.value)) {
    targetField.value = columns.find((column) => {
      const sample = datasetRows.value
        .map((row) => row[column])
        .filter((value) => value !== null && value !== undefined)
      const uniqueCount = new Set(sample).size
      return uniqueCount > 1 && uniqueCount <= Math.min(sample.length, 12)
    }) || ''
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
    statusMessage.value = `${authMode.value === 'login' ? 'Logged in' : 'Registered'} as ${authForm.email}.`
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
  statusMessage.value = 'Session cleared.'
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
        throw new Error('Choose a file before importing.')
      }

      const formData = new FormData()
      formData.append('file', selectedFile.value)
      response = await gatewayFetch(resolveFileEndpoint(selectedFile.value.name), {
        method: 'POST',
        body: formData,
      })
    }

    datasetColumns.value = response
    datasetRows.value = columnarToRows(response)
    statusMessage.value = `Imported ${datasetRows.value.length} rows from ${importSourceLabel(activeImporter.value)}.`
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
      throw new Error('Import a dataset before running analysis.')
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
    statusMessage.value = `Analysis completed for ${datasetRows.value.length} rows.`
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    analysisLoading.value = false
  }
}

async function gatewayFetch(path, options = {}) {
  if (!authState.accessToken) {
    throw new Error('Authenticate first.')
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
  throw new Error('Unsupported file type. Use CSV, JSON, XML, XLSX or XLS.')
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
  return payload?.detail || payload?.message || 'Request failed.'
}

function importSourceLabel(source) {
  if (source === 'jsonText') {
    return 'JSON payload'
  }
  if (source === 'sql') {
    return 'SQL source'
  }
  return 'file upload'
}

function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return value
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
}
</script>

<template>
  <div class="shell">
    <section class="hero-panel">
      <p class="eyebrow">Anasti Control Surface</p>
      <h1>Import raw data, route it through the gateway, and inspect analysis without storing datasets.</h1>
      <p class="hero-copy">
        Auth goes straight to the auth service. Every collector and analysis request goes through the API
        gateway with the bearer token.
      </p>

      <div class="hero-grid">
        <article class="stat-card">
          <span class="stat-label">Gateway</span>
          <strong>{{ gatewayBaseUrl }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">Auth</span>
          <strong>{{ authBaseUrl }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">Session</span>
          <strong>{{ isAuthenticated ? authState.email || 'Authenticated' : 'Anonymous' }}</strong>
        </article>
      </div>
    </section>

    <section class="workspace-grid">
      <article class="panel auth-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Step 1</p>
            <h2>Authenticate</h2>
          </div>
          <div class="chip-row">
            <button
              class="chip"
              :class="{ active: authMode === 'login' }"
              type="button"
              @click="authMode = 'login'"
            >
              Login
            </button>
            <button
              class="chip"
              :class="{ active: authMode === 'register' }"
              type="button"
              @click="authMode = 'register'"
            >
              Register
            </button>
          </div>
        </div>

        <form class="stack" @submit.prevent="submitAuth">
          <label class="field">
            <span>Email</span>
            <input v-model="authForm.email" autocomplete="email" placeholder="analyst@anasti.dev" type="email" />
          </label>
          <label class="field">
            <span>Password</span>
            <input
              v-model="authForm.password"
              autocomplete="current-password"
              placeholder="Use your auth password"
              type="password"
            />
          </label>

          <div class="action-row">
            <button class="primary-button" :disabled="loading" type="submit">
              {{ loading ? 'Sending…' : authMode === 'login' ? 'Enter workspace' : 'Create account' }}
            </button>
            <button class="ghost-button" :disabled="!isAuthenticated" type="button" @click="logout">
              Clear token
            </button>
          </div>
        </form>
      </article>

      <article class="panel import-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Step 2</p>
            <h2>Import Dataset</h2>
          </div>
          <div class="chip-row">
            <button
              class="chip"
              :class="{ active: activeImporter === 'jsonText' }"
              type="button"
              @click="activeImporter = 'jsonText'"
            >
              JSON
            </button>
            <button
              class="chip"
              :class="{ active: activeImporter === 'file' }"
              type="button"
              @click="activeImporter = 'file'"
            >
              File
            </button>
            <button
              class="chip"
              :class="{ active: activeImporter === 'sql' }"
              type="button"
              @click="activeImporter = 'sql'"
            >
              SQL
            </button>
          </div>
        </div>

        <div v-if="activeImporter === 'jsonText'" class="stack">
          <label class="field">
            <span>JSON payload</span>
            <textarea v-model="jsonText" rows="12" spellcheck="false" />
          </label>
        </div>

        <div v-else-if="activeImporter === 'file'" class="stack">
          <label class="field">
            <span>File source</span>
            <input
              accept=".csv,.json,.xml,.xlsx,.xls"
              type="file"
              @change="selectedFile = $event.target.files?.[0] || null"
            />
          </label>
          <p class="hint">Supported: CSV, JSON, XML, XLSX, XLS.</p>
        </div>

        <div v-else class="stack sql-grid">
          <label class="field">
            <span>DB type</span>
            <select v-model="sqlForm.db_type">
              <option value="sqlite">SQLite</option>
              <option value="postgresql">PostgreSQL</option>
            </select>
          </label>
          <label class="field">
            <span>Host</span>
            <input v-model="sqlForm.host" placeholder="localhost" type="text" />
          </label>
          <label class="field">
            <span>Port</span>
            <input v-model="sqlForm.port" placeholder="5432" type="text" />
          </label>
          <label class="field">
            <span>Database / path</span>
            <input v-model="sqlForm.database" placeholder="/tmp/data.db or app" type="text" />
          </label>
          <label class="field">
            <span>Username</span>
            <input v-model="sqlForm.username" placeholder="postgres" type="text" />
          </label>
          <label class="field">
            <span>Password</span>
            <input v-model="sqlForm.password" placeholder="secret" type="password" />
          </label>
          <label class="field field-wide">
            <span>Query</span>
            <textarea v-model="sqlForm.query" rows="6" spellcheck="false" />
          </label>
        </div>

        <div class="action-row">
          <button class="primary-button" :disabled="importLoading || !isAuthenticated" type="button" @click="importDataset">
            {{ importLoading ? 'Importing…' : 'Import through gateway' }}
          </button>
        </div>
      </article>

      <article class="panel analysis-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Step 3</p>
            <h2>Run Analysis</h2>
          </div>
        </div>

        <div class="stack">
          <label class="field">
            <span>Target field for grouping</span>
            <select v-model="targetField">
              <option value="">No grouping</option>
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
              {{ analysisLoading ? 'Analyzing…' : 'Run analysis' }}
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
            <p class="panel-kicker">Dataset</p>
            <h2>Preview</h2>
          </div>
          <strong class="badge">{{ datasetRows.length }} rows</strong>
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
                <td v-for="column in previewColumns" :key="column">{{ row[column] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-state">No dataset loaded yet.</p>
      </article>

      <article class="panel summary-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Analysis</p>
            <h2>Summary</h2>
          </div>
          <strong class="badge">{{ analysisResult?.summary?.row_count || 0 }} analyzed</strong>
        </div>

        <div v-if="analysisResult" class="summary-stack">
          <section class="metric-group">
            <h3>Numeric fields</h3>
            <div class="metric-grid">
              <article v-for="[column, values] in numericSummaryEntries" :key="column" class="metric-card">
                <h4>{{ column }}</h4>
                <p>Mean {{ formatNumber(values.mean) }}</p>
                <p>Median {{ formatNumber(values.median) }}</p>
                <p>Std {{ formatNumber(values.std) }}</p>
                <p>Range {{ formatNumber(values.min) }} to {{ formatNumber(values.max) }}</p>
              </article>
            </div>
          </section>

          <section class="metric-group">
            <h3>Categorical fields</h3>
            <div class="metric-grid">
              <article v-for="[column, values] in categoricalSummaryEntries" :key="column" class="metric-card">
                <h4>{{ column }}</h4>
                <p>Unique {{ values.unique_values.length }}</p>
                <p>
                  Top:
                  {{ values.top_values.map((item) => `${item.value} (${item.count})`).join(', ') }}
                </p>
              </article>
            </div>
          </section>

          <section class="metric-group">
            <h3>Correlation matrix</h3>
            <div class="table-shell compact">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
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

          <section v-if="groupedEntries.length" class="metric-group">
            <h3>Target groups</h3>
            <div class="metric-grid">
              <article v-for="[groupName, details] in groupedEntries" :key="groupName" class="metric-card">
                <h4>{{ groupName }}</h4>
                <p>Rows {{ details.rows.length }}</p>
                <p>
                  Numeric fields {{ Object.keys(details.summary.numeric || {}).length }},
                  categories {{ Object.keys(details.summary.categorical || {}).length }}
                </p>
              </article>
            </div>
          </section>
        </div>
        <p v-else class="empty-state">Analysis results will appear here.</p>
      </article>
    </section>
  </div>
</template>
