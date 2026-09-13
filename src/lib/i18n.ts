/**
 * Two languages, one catalogue, and the English string is the key.
 *
 *   t('Add task', 'ru')  →  'Добавить задачу'
 *   t('Add task', 'en')  →  'Add task'
 *   t('Whatever', 'ru')  →  'Whatever'        ← no entry, so the source survives
 *
 * ── WHY THE KEY IS THE ENGLISH SENTENCE AND NOT `tasks.add` ────────────────
 *
 * A symbolic key buys namespacing and costs the thing that matters here: a
 * missing entry renders as `tasks.add` on somebody's phone. With the sentence as
 * the key, a string nobody has translated yet renders in English — which is
 * ugly and true, rather than broken. That is the right failure mode for an app
 * whose translation arrives one screen at a time, and it is what made it safe to
 * wrap the screens in the order they are used rather than all at once.
 *
 * It also means the code still READS: `t('Nothing asked for today')` says what
 * will be on screen, so a reviewer does not have to hold a key table in their
 * head to know what a screen says.
 *
 * ── PLURALS ARE SPELLED OUT, NOT COMPUTED ─────────────────────────────────
 *
 * Russian has three plural forms (1 день, 2 дня, 5 дней) where English has two,
 * so a `count === 1 ? a : b` at the call site cannot be translated — the branch
 * itself is wrong in the target language. `plural(n, lang, forms)` takes all
 * three and picks by the language's own rule, and `RU_PLURAL` is that rule: the
 * standard one/few/many split every Slavic counter needs.
 *
 * ── INTERPOLATION ─────────────────────────────────────────────────────────
 *
 * `{name}` placeholders, filled from a plain object. Word ORDER differs between
 * the two languages and a concatenation at the call site freezes English order
 * into the layout — so anything with a value in the middle of it is one string
 * with a hole in it, not three strings glued together.
 *
 * Everything here is pure: no store, no React. `hooks/useT.ts` is the three
 * lines that subscribe a component to the setting.
 */

export type Language = 'ru' | 'en';

export const LANGUAGES: readonly Language[] = ['ru', 'en'];

/** What the toggle in the corner of Settings prints. Two letters, each own script. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  ru: 'РУ',
  en: 'EN',
};

/** Spoken by a screen reader, in the language being offered. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  ru: 'Русский',
  en: 'English',
};

/** A language this build knows, or Russian — the default this app ships in. */
export function usableLanguage(value: unknown): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : 'ru';
}

/**
 * The three Russian plural forms, picked by the standard rule.
 *
 *   1, 21, 31 …        → one    (день)
 *   2–4, 22–24 …       → few    (дня)
 *   0, 5–20, 25–30 …   → many   (дней)
 */
export function ruPluralForm(n: number): 'one' | 'few' | 'many' {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}

export interface PluralForms {
  one: string;
  few?: string;
  many: string;
}

/**
 * The right form of a counted noun, in either language.
 *
 * English reads `one` at exactly 1 and `many` otherwise; Russian reads all three.
 * `few` is optional so an English-shaped pair can be passed without inventing a
 * form the language does not have.
 */
export function plural(n: number, lang: Language, forms: PluralForms): string {
  if (lang !== 'ru') return Math.abs(n) === 1 ? forms.one : forms.many;
  const form = ruPluralForm(n);
  if (form === 'one') return forms.one;
  if (form === 'few') return forms.few ?? forms.many;
  return forms.many;
}

export type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

/**
 * The one read path. English in, the user's language out.
 *
 * An unknown string comes back unchanged rather than throwing or rendering a
 * key — see the file header.
 */
export function t(key: string, lang: Language, vars?: Vars): string {
  if (lang === 'en') return fill(key, vars);
  return fill(RU[key] ?? key, vars);
}

/**
 * A word the app needs TWICE, in two senses.
 *
 * `Back` is the chevron in a header and it is the muscle group, and in Russian
 * those are `Назад` and `Спина` — two different words for one English string, so
 * the string alone cannot be the key. The namespace disambiguates
 * (`muscle:Back`), and the English half is unaffected: `en` returns the bare
 * word, and a Russian entry that does not exist falls through to the un-namespaced
 * catalogue and then to the word itself, so the fallback is still a real word and
 * never a key with a colon in it.
 */
export function term(namespace: string, word: string, lang: Language): string {
  if (lang === 'en') return word;
  return RU[`${namespace}:${word}`] ?? RU[word] ?? word;
}

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

/**
 * English → Russian. Grouped by where the string is read, not alphabetically,
 * because the thing you want when you are translating is every string on one
 * screen at once.
 */
const RU: Record<string, string> = {
  /* --- the tab bar and the section corners ------------------------- */
  Workout: 'Тренировка',
  Tasks: 'Задачи',
  Expenses: 'Расходы',
  Settings: 'Настройки',
  'Daily tasks': 'Ежедневные задачи',
  History: 'История',
  'Training history': 'История тренировок',
  'Task history': 'История задач',
  'Expense history': 'История расходов',
  Routines: 'Программы',
  'Exercise library': 'База упражнений',
  'Open the routines': 'Открыть программы',
  'Open the exercise library': 'Открыть базу упражнений',
  Language: 'Язык',
  'Application language': 'Язык приложения',

  /* --- the workout section ----------------------------------------- */
  'In progress': 'Идёт сейчас',
  'Back to the workout': 'Вернуться к тренировке',
  Sequence: 'Последовательность',
  Today: 'Сегодня',
  'Other routines': 'Другие программы',
  'Start a workout': 'Начать тренировку',
  Recent: 'Недавние',
  'Set up': 'Настройка',
  'Nothing to open': 'Нечего открыть',
  'Put some exercises in a routine — the list glyph in the corner of this screen — and it shows up here, ready to open.':
    'Добавьте упражнения в программу — значок списка в углу этого экрана — и она появится здесь, готовая к запуску.',
  '{done} of {total} sets · {minutes} min': '{done} из {total} подходов · {minutes} мин',
  '{exercises} exercises · {sets} sets': 'упражнений: {exercises} · подходов: {sets}',
  'Open {name}': 'Открыть «{name}»',
  'nudge waiting': 'подсказка ждёт',
  'nudges waiting': 'подсказок ждёт',
  'Deleted routine': 'Удалённая программа',
  'Edit the sequence.': 'Изменить последовательность.',
  'next up': 'следующая',
  'Training sequence': 'Последовательность тренировок',
  'Off · no order set': 'Выкл · порядок не задан',
  On: 'Вкл',
  Off: 'Выкл',
  step: 'шаг',
  steps: 'шагов',
  min: 'мин',
  sets: 'подходов',
  exercises: 'упражнений',
  'New routine': 'Новая программа',
  'Edit routine': 'Изменить программу',
  'Routine name': 'Название программы',
  Save: 'Сохранить',
  Cancel: 'Отмена',
  Drop: 'Отпустить',
  Back: 'Назад',
  'Add routine': 'Добавить программу',
  'Add exercise': 'Добавить упражнение',
  'Delete routine': 'Удалить программу',
  Exercises: 'Упражнения',

  /* --- the dice ---------------------------------------------------- */
  'Random routine': 'Случайная программа',
  'Roll a random routine. Long press to choose what goes in it.':
    'Собрать случайную программу. Удержание — выбрать, из чего.',
  'Build a random routine': 'Собрать случайную программу',
  'Muscle groups': 'Группы мышц',
  'How many exercises': 'Сколько упражнений',
  'Sets each': 'Подходов в каждом',
  Roll: 'Собрать',
  'Rolling…': 'Собираем…',
  'Pick at least one group.': 'Выберите хотя бы одну группу.',
  'There is nothing in the library for those groups yet.':
    'В базе пока нет упражнений для этих групп.',
  'Nothing to roll — the library is empty.': 'Нечего собирать — база упражнений пуста.',
  '{n} exercises to draw from': 'упражнений на выбор: {n}',
  "Each exercise's own number": 'Как задано у каждого упражнения',
  /* --- the library's two levels ------------------------------------ */
  /*
   * The clusters and the fourteen groups. Capitalised, because that is the shape
   * `clusterLabel` and `muscleLabel` hand over — the stored value is the
   * lower-case union member and stays English, since it is an identifier.
   */
  Push: 'Жим',
  Pull: 'Тяга',
  Legs: 'Ноги',
  Core: 'Пресс',
  Cardio: 'Кардио',
  Skill: 'Навык',
  'muscle:Chest': 'Грудь',
  // Namespaced, because `Back` is also the chevron in every header — see `term`.
  'muscle:Back': 'Спина',
  'muscle:Shoulders': 'Плечи',
  'muscle:Traps': 'Трапеции',
  'muscle:Neck': 'Шея',
  'muscle:Biceps': 'Бицепс',
  'muscle:Triceps': 'Трицепс',
  'muscle:Forearms': 'Предплечья',
  'muscle:Core': 'Пресс',
  'muscle:Quads': 'Квадрицепс',
  'muscle:Hamstrings': 'Бицепс бедра',
  'muscle:Glutes': 'Ягодицы',
  'muscle:Calves': 'Икры',
  'muscle:Cardio': 'Кардио',
  'muscle:Calisthenics': 'Калистеника',
  Unfiled: 'Без группы',
  Library: 'База',
  'New exercise': 'Новое упражнение',
  'Recently used': 'Недавние',
  'Search exercises, muscles, days': 'Поиск: упражнения, мышцы, дни',
  'Search exercises': 'Поиск упражнений',
  'Create “{name}”': 'Создать «{name}»',
  'Add exercise to {muscle}': 'Добавить упражнение — {muscle}',

  /* --- the daily tasks --------------------------------------------- */
  'Add task': 'Добавить задачу',
  'New task': 'Новая задача',
  'Edit task': 'Изменить задачу',
  'Task name': 'Название задачи',
  'What are you asking yourself to do?': 'Что вы просите себя сделать?',
  'Asks on': 'Спрашивает',
  'Every day': 'Каждый день',
  'Chosen days': 'Выбранные дни',
  'Just once': 'Один раз',
  Never: 'Никогда',
  Once: 'Один раз',
  'A one-day task. It asks on that day and never again.':
    'Задача на один день. Спросит в этот день и больше никогда.',
  'Starts on': 'Начинается с',
  'Which day': 'В какой день',
  'The day it first asks. Days before it stay exactly as you left them.':
    'День, когда она спросит впервые. Более ранние дни останутся такими, как были.',
  'Give it a name.': 'Дайте ей название.',
  'Pick at least one day.': 'Выберите хотя бы один день.',
  'Nothing asked for today': 'На сегодня ничего не запланировано',
  'Nothing is scheduled for this day.': 'На этот день ничего не запланировано.',
  'Coming up': 'Впереди',
  '{done} of {total} done': 'сделано {done} из {total}',
  'Long press a row, then slide. The others open a gap where it will land.':
    'Удержите строку и ведите. Остальные раздвинутся там, где она встанет.',
  'The day before': 'Предыдущий день',
  'The day after': 'Следующий день',
  'The month before': 'Предыдущий месяц',
  'The month after': 'Следующий месяц',
  Moving: 'Перемещение',
  'Slide to move it · position {at} of {of}': 'Ведите, чтобы переместить · место {at} из {of}',
  'Drop it here': 'Отпустить здесь',
  Done: 'Сделано',
  'Missed on purpose': 'Пропущено намеренно',
  'Not answered': 'Без ответа',
  'Tap to change.': 'Нажмите, чтобы изменить.',
  'Open the month.': 'Открыть месяц.',
  'Long press, then slide to reorder': 'Удержите и ведите, чтобы переставить',
  'missed on purpose': 'пропущено намеренно',
  auto: 'авто',
  'in a row': 'подряд',
  Streak: 'Серия',
  'This month': 'В этом месяце',
  'of {asked}': 'из {asked}',
  day: 'день',
  days: 'дней',
  Note: 'Заметка',
  'What happened that day': 'Что произошло в этот день',
  'Archive this task': 'Архивировать задачу',
  'It leaves the day list. Every day you already answered stays where it is.':
    'Она уйдёт из списка дня. Все уже отвеченные дни останутся на месте.',
  'Archive it': 'Архивировать',
  'Keep it': 'Оставить',
  'Filled is done, outlined is missed, faint is unanswered. Blank days were never asked for.':
    'Залитый — сделано, контур — пропущено, бледный — без ответа. Пустые дни никогда не спрашивались.',
  since: 'с',

  /* --- reminders --------------------------------------------------- */
  Reminder: 'Напоминание',
  'Remind me': 'Напоминать',
  'Remind me about this': 'Напоминать об этом',
  'At what time': 'Во сколько',
  'The phone will ask on the days this task asks.':
    'Телефон напомнит в те дни, когда задача спрашивает.',
  'Time to train': 'Пора тренироваться',
  'Workout reminder': 'Напоминание о тренировке',
  'Remind me to train': 'Напоминать о тренировке',
  'On which days': 'В какие дни',
  'A notification at the time you set, on the days you picked.':
    'Уведомление в заданное время, в выбранные дни.',
  Hours: 'Часы',
  Minutes: 'Минуты',
  'Notifications are switched off for this app, so nothing will arrive.':
    'Уведомления для приложения выключены, поэтому ничего не придёт.',
  Reminders: 'Напоминания',
  'Reminds at {time}': 'Напомнит в {time}',
  'No reminder': 'Без напоминания',

  /* --- the session ------------------------------------------------- */
  'Start workout': 'Начать тренировку',
  'Stop and exit': 'Остановить и выйти',
  'Restart clock': 'Сбросить время',
  'Restart the clock?': 'Сбросить время?',
  'Restart it': 'Сбросить',
  'Remove it': 'Убрать',
  'Add an exercise': 'Добавить упражнение',
  'Stop and exit without saving?': 'Выйти без сохранения?',
  'Throw it away': 'Удалить',
  'Keep logging': 'Продолжить запись',
  'Full days': 'Полные дни',

  /* --- the expenses ------------------------------------------------ */
  'Overall balance': 'Общий баланс',
  Incomes: 'Доходы',
  'Time interval': 'Период',
  'Add expense': 'Добавить расход',
  'Add income': 'Добавить доход',
  Day: 'День',
  Week: 'Неделя',
  Month: 'Месяц',
  Year: 'Год',
  'All time': 'Всё время',
  '3 months': '3 месяца',
  'Change the time interval.': 'Сменить период.',
  year: 'год',
  'Everything recorded': 'Всё, что записано',
  'Edit category': 'Изменить категорию',
  'Its name, its glyph and everything recorded in it': 'Название, значок и всё, что в ней записано',
  'Add an income here': 'Добавить сюда доход',
  'Add an expense here': 'Добавить сюда расход',
  'A tap on the tile adds an expense': 'Нажатие на плитку добавляет расход',
  'A tap on the tile adds an income': 'Нажатие на плитку добавляет доход',
  'Add category': 'Добавить категорию',
  Add: 'Добавить',
  'The window before': 'Предыдущий период',
  'The window after': 'Следующий период',

  /* --- settings ---------------------------------------------------- */
  Sections: 'Разделы',
  'Workout settings': 'Настройки тренировок',
  'Daily tasks settings': 'Настройки ежедневных задач',
  'Expenses settings': 'Настройки расходов',
  Answering: 'Ответы',
  'Let the app tick what it knows': 'Разрешить приложению отмечать то, что оно знает',
  'Finishing a workout ticks the training task; recording an amount ticks the expense one':
    'Завершение тренировки отмечает задачу о зале; запись суммы — задачу о расходах',
  'History opens on': 'История открывается на',
  'Both rows are still ordinary tasks — you can tick them, skip them, and change what they say. This only means something else usually gets there first.':
    'Обе строки остаются обычными задачами — их можно отметить, пропустить и переименовать. Это лишь значит, что обычно кто-то другой успевает первым.',
  'Every task waits for you. Nothing in the app answers a row on its own, and marks already given stay exactly as they are.':
    'Каждая задача ждёт вас. Приложение ничего не отмечает само, а уже поставленные отметки остаются как есть.',
  'Which range the ⟲ in the corner of the daily tasks opens on. The chips on that screen still change it while you are reading.':
    'На каком диапазоне открывается ⟲ в углу ежедневных задач. Кнопки на том экране всё так же меняют его во время просмотра.',
  'Everything, in one file': 'Всё в одном файле',
  'Export everything': 'Выгрузить всё',
  'Replace everything from a file': 'Заменить всё из файла',
  'Reset every setting to its default': 'Сбросить все настройки',
  'Back up now': 'Сделать копию сейчас',
  'Last backup': 'Последняя копия',
  'Back up automatically': 'Копировать автоматически',
};

/** Test hook: the strings this build can translate. Not read by the app. */
export function translatedKeys(): string[] {
  return Object.keys(RU);
}
