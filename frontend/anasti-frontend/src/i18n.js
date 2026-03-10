import { ref } from 'vue'

const STORAGE_KEY = 'anasti-locale'

const messages = {
  en: {
    app: {
      eyebrow: 'Anasti Control Surface',
      headline: 'Import raw data, route it through the gateway, and inspect analysis without storing datasets.',
      heroCopy:
        'Auth goes straight to the auth service. Every collector and analysis request goes through the API gateway with the bearer token.',
      gateway: 'Gateway',
      auth: 'Auth',
      session: 'Session',
      authenticated: 'Authenticated',
      anonymous: 'Anonymous',
    },
    steps: {
      step1: 'Step 1',
      step2: 'Step 2',
      step3: 'Step 3',
    },
    auth: {
      title: 'Authenticate',
      email: 'Email',
      password: 'Password',
      emailPlaceholder: 'analyst@anasti.dev',
      passwordPlaceholder: 'Use your auth password',
      sending: 'Sending…',
      enterWorkspace: 'Enter workspace',
      createAccount: 'Create account',
      clearToken: 'Clear token',
      login: 'Login',
      register: 'Register',
      loggedIn: 'Logged in as {email}.',
      registered: 'Registered as {email}.',
      sessionCleared: 'Session cleared.',
    },
    import: {
      title: 'Import Dataset',
      json: 'JSON',
      file: 'File',
      sql: 'SQL',
      jsonPayload: 'JSON payload',
      fileSource: 'File source',
      fileHint: 'Supported: CSV, JSON, XML, XLSX, XLS.',
      dbType: 'DB type',
      host: 'Host',
      port: 'Port',
      database: 'Database / path',
      username: 'Username',
      password: 'Password',
      query: 'Query',
      importButton: 'Import through gateway',
      importing: 'Importing…',
      chooseFileError: 'Choose a file before importing.',
      unsupportedFile: 'Unsupported file type. Use CSV, JSON, XML, XLSX or XLS.',
      sourceJson: 'JSON payload',
      sourceSql: 'SQL source',
      sourceFile: 'file upload',
      importedStatus: 'Imported {rows} rows from {source}.',
    },
    analysis: {
      title: 'Run Analysis',
      targetField: 'Target field for grouping',
      noGrouping: 'No grouping',
      analyze: 'Run analysis',
      analyzing: 'Analyzing…',
      needDataset: 'Import a dataset before running analysis.',
      completed: 'Analysis completed for {rows} rows.',
    },
    feedback: {
      authFirst: 'Authenticate first.',
      requestFailed: 'Request failed.',
      initial: 'Connect auth, import a dataset, then run analysis through the gateway.',
    },
    results: {
      dataset: 'Dataset',
      preview: 'Preview',
      rows: '{count} rows',
      emptyDataset: 'No dataset loaded yet.',
      analysis: 'Analysis',
      summary: 'Summary',
      analyzed: '{count} analyzed',
      numericFields: 'Numeric fields',
      mean: 'Mean',
      meanHelp: 'Average value (sum divided by count).',
      median: 'Median',
      medianHelp: 'Middle value when sorted.',
      std: 'Std',
      stdHelp: 'How spread out the values are.',
      range: 'Range {min} to {max}',
      rangeHelp: 'Smallest and largest values.',
      categoricalFields: 'Categorical fields',
      categoricalHelp: 'Counts by unique values in a column.',
      unique: 'Unique',
      top: 'Top',
      correlation: 'Correlation matrix',
      correlationHelp: 'Shows how fields change together, including non-numeric fields.',
      field: 'Field',
      targetGroups: 'Target groups',
      groupDefault: 'Groups',
      groupBuckets: {
        hour: 'By hour',
        weekday: 'By weekday',
        month: 'By month',
      },
      weekdays: {
        0: 'Mon',
        1: 'Tue',
        2: 'Wed',
        3: 'Thu',
        4: 'Fri',
        5: 'Sat',
        6: 'Sun',
      },
      months: {
        1: 'Jan',
        2: 'Feb',
        3: 'Mar',
        4: 'Apr',
        5: 'May',
        6: 'Jun',
        7: 'Jul',
        8: 'Aug',
        9: 'Sep',
        10: 'Oct',
        11: 'Nov',
        12: 'Dec',
      },
      rowsLabel: 'Rows',
      numericFieldsLabel: 'Numeric fields',
      categoriesLabel: 'categories',
      analysisEmpty: 'Analysis results will appear here.',
    },
    language: {
      label: 'Language',
      en: 'English',
      ru: 'Russian',
    },
  },
  ru: {
    app: {
      eyebrow: 'Anasti Control Surface',
      headline: 'Импортируйте сырые данные, пропустите их через шлюз и изучите анализ без хранения датасетов.',
      heroCopy:
        'Авторизация идет напрямую в auth сервис. Все запросы на сбор и анализ проходят через API gateway с bearer токеном.',
      gateway: 'Gateway',
      auth: 'Auth',
      session: 'Сессия',
      authenticated: 'Аутентифицирован',
      anonymous: 'Аноним',
    },
    steps: {
      step1: 'Шаг 1',
      step2: 'Шаг 2',
      step3: 'Шаг 3',
    },
    auth: {
      title: 'Авторизация',
      email: 'Email',
      password: 'Пароль',
      emailPlaceholder: 'analyst@anasti.dev',
      passwordPlaceholder: 'Введите пароль',
      sending: 'Отправка…',
      enterWorkspace: 'Войти',
      createAccount: 'Создать аккаунт',
      clearToken: 'Очистить токен',
      login: 'Вход',
      register: 'Регистрация',
      loggedIn: 'Выполнен вход: {email}.',
      registered: 'Аккаунт создан: {email}.',
      sessionCleared: 'Сессия очищена.',
    },
    import: {
      title: 'Импорт датасета',
      json: 'JSON',
      file: 'Файл',
      sql: 'SQL',
      jsonPayload: 'JSON данные',
      fileSource: 'Источник файла',
      fileHint: 'Поддерживаются: CSV, JSON, XML, XLSX, XLS.',
      dbType: 'Тип БД',
      host: 'Хост',
      port: 'Порт',
      database: 'База / путь',
      username: 'Пользователь',
      password: 'Пароль',
      query: 'Запрос',
      importButton: 'Импорт через шлюз',
      importing: 'Импорт…',
      chooseFileError: 'Выберите файл перед импортом.',
      unsupportedFile: 'Неподдерживаемый тип. Используйте CSV, JSON, XML, XLSX или XLS.',
      sourceJson: 'JSON данные',
      sourceSql: 'SQL источник',
      sourceFile: 'загрузка файла',
      importedStatus: 'Импортировано {rows} строк из {source}.',
    },
    analysis: {
      title: 'Запуск анализа',
      targetField: 'Поле для группировки',
      noGrouping: 'Без группировки',
      analyze: 'Запустить анализ',
      analyzing: 'Анализ…',
      needDataset: 'Сначала импортируйте датасет.',
      completed: 'Анализ завершен для {rows} строк.',
    },
    feedback: {
      authFirst: 'Сначала авторизуйтесь.',
      requestFailed: 'Запрос не выполнен.',
      initial: 'Подключите auth, импортируйте датасет и запустите анализ через шлюз.',
    },
    results: {
      dataset: 'Датасет',
      preview: 'Предпросмотр',
      rows: '{count} строк',
      emptyDataset: 'Датасет пока не загружен.',
      analysis: 'Анализ',
      summary: 'Сводка',
      analyzed: '{count} обработано',
      numericFields: 'Числовые поля',
      mean: 'Среднее значение',
      meanHelp: 'Обычное среднее: сумма значений / количество.',
      median: 'Медиана',
      medianHelp: 'Значение посередине отсортированного списка.',
      std: 'Разброс',
      stdHelp: 'Показывает, насколько значения далеки друг от друга.',
      range: 'Диапазон {min} – {max}',
      rangeHelp: 'Минимальное и максимальное значения.',
      categoricalFields: 'Категориальные поля',
      categoricalHelp: 'Сколько раз встречается каждое значение.',
      unique: 'Уникальные',
      top: 'Топ',
      correlation: 'Матрица корреляций',
      correlationHelp: 'Показывает, как поля изменяются вместе, включая нечисловые.',
      field: 'Поле',
      targetGroups: 'Целевые группы',
      groupDefault: 'Группы',
      groupBuckets: {
        hour: 'По часам',
        weekday: 'По дням недели',
        month: 'По месяцам',
      },
      weekdays: {
        0: 'Пн',
        1: 'Вт',
        2: 'Ср',
        3: 'Чт',
        4: 'Пт',
        5: 'Сб',
        6: 'Вс',
      },
      months: {
        1: 'Январь',
        2: 'Февраль',
        3: 'Март',
        4: 'Апрель',
        5: 'Май',
        6: 'Июнь',
        7: 'Июль',
        8: 'Август',
        9: 'Сентябрь',
        10: 'Октябрь',
        11: 'Ноябрь',
        12: 'Декабрь',
      },
      rowsLabel: 'Строк',
      numericFieldsLabel: 'Числовые поля',
      categoriesLabel: 'категории',
      analysisEmpty: 'Результаты анализа появятся здесь.',
    },
    language: {
      label: 'Язык',
      en: 'English',
      ru: 'Русский',
    },
  },
}

const fallbackLocale = 'en'

function loadLocale() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && messages[stored]) {
    return stored
  }
  return fallbackLocale
}

const locale = ref(loadLocale())

function setLocale(next) {
  if (!messages[next]) {
    return
  }
  locale.value = next
  localStorage.setItem(STORAGE_KEY, next)
}

function resolveMessage(currentLocale, key) {
  const parts = key.split('.')
  let value = messages[currentLocale]
  for (const part of parts) {
    value = value?.[part]
  }
  if (value) {
    return value
  }
  let fallback = messages[fallbackLocale]
  for (const part of parts) {
    fallback = fallback?.[part]
  }
  return fallback || key
}

function interpolate(text, params) {
  if (!params) {
    return text
  }
  return text.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}

function t(key, params) {
  const message = resolveMessage(locale.value, key)
  return typeof message === 'string' ? interpolate(message, params) : key
}

export function useI18n() {
  return {
    locale,
    setLocale,
    t,
    availableLocales: Object.keys(messages),
  }
}
