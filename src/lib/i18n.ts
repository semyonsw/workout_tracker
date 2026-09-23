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
  // The training history's three views. `Cal` is the English label's short form;
  // Russian has room for the word.
  Log: 'Журнал',
  Graphs: 'Графики',
  Cal: 'Календарь',
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
  'Category: {name}. Change it.': 'Категория: {name}. Изменить.',
  'Pick a category': 'Выберите категорию',
  MAX: 'МАКС',
  'Reps to MAX': 'Повторения до МАКС',
  'Every set starts at 0 and counts up — nothing is prefilled':
    'Каждый подход начинается с 0 и считается вверх — ничего не подставляется',
  'Off — every set plans the rep target above':
    'Выкл — каждый подход планирует цель по повторениям выше',
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
  Incomes: 'Доходы',
  'Time interval': 'Период',
  'Add expense': 'Добавить расход',
  'Add income': 'Добавить доход',
  Day: 'День',
  Week: 'Неделя',
  Month: 'Месяц',
  Year: 'Год',
  'All time': 'Всё время',
  'Tap to set what you actually have here': 'Нажмите, чтобы указать, сколько здесь на самом деле',
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
  /* --- the subsections: where the money physically is ----------------
     `Cash` and `Online` themselves are NOT here: an account's name is user data
     the moment it can be renamed, exactly like a category's, and a catalogue
     entry for one would rename it back on every render. */
  Subsection: 'Раздел',
  'Add subsection': 'Добавить раздел',
  'Edit subsection': 'Изменить раздел',
  'Its name and its glyph': 'Название и значок',
  'Archive this subsection': 'Убрать этот раздел в архив',
  'It leaves the row. Everything recorded in it stays recorded.':
    'Он исчезнет из строки. Всё, что в нём записано, останется записанным.',
  'Long press to edit the subsection': 'Долгое нажатие — изменить раздел',
  'Set what you have here.': 'Указать, сколько здесь денег.',
  'What you have': 'Сколько у вас есть',
  'This sets the balance directly. Nothing is recorded as an income, and no month, category or chart moves.':
    'Баланс задаётся напрямую. Ничего не записывается как доход, и ни месяц, ни категория, ни график не меняются.',
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

  /* --- workout settings -------------------------------------------- */
  Rest: 'Отдых',
  'Between sets': 'Между подходами',
  'Between exercises': 'Между упражнениями',
  'between sets': 'между подходами',
  'between exercises': 'между упражнениями',
  'Every set of every exercise. Setting it clears any exercise you have given a rest of its own.':
    'Каждый подход каждого упражнения. Изменение сбрасывает собственный отдых у всех упражнений.',
  'Start rest automatically': 'Запускать отдых автоматически',
  'Off: rest only runs when you start it': 'Выкл: отдых идёт, только когда вы его запустите',
  'Timer ± step': 'Шаг таймера ±',
  'The +15 on the rest and set-timer pills': 'Кнопка +15 на таймерах отдыха и подхода',
  'You rest {clock} {what}.': 'Вы отдыхаете {clock} {what}.',
  'You rest {clock} {what}. Use that as the setting.':
    'Вы отдыхаете {clock} {what}. Сделать это настройкой.',
  'Use it': 'Применить',
  'No rest': 'Без отдыха',
  'Straight to work': 'Сразу к делу',
  Silent: 'Без звука',
  '{seconds} s': '{seconds} с',
  'Timed sets': 'Подходы на время',
  'Get ready': 'Подготовка',
  'Counted in before a plank or a hang starts': 'Отсчёт перед планкой или висом',
  'Rep ladder': 'Лесенка повторов',
  'Make every exercise a rep ladder': 'Сделать лесенку повторов во всех упражнениях',
  'One max, {sets} sets — {ladder} at a max of 12':
    'Один максимум, подходов: {sets} — {ladder} при максимуме 12',
  'Every rep-counted exercise runs a ladder, and new ones start with it on. Switching this off takes back only the ladders it added — a max you set yourself, and any ladder that has earned a rep, stay exactly as they are.':
    'Каждое упражнение на повторы идёт лесенкой, и новые создаются с ней. Выключение уберёт только те лесенки, которые добавил этот переключатель: заданный вами максимум и лесенка, уже заработавшая повтор, останутся как есть.',
  'Switches the ladder on for every rep-counted exercise at once, seeded from each one’s target reps. Holds, rounds and distances are left alone — a ladder is a rep prescription.':
    'Включает лесенку сразу во всех упражнениях на повторы, отталкиваясь от их целевых повторов. Удержания, круги и дистанции не трогает — лесенка задаёт повторы.',
  Countdown: 'Обратный отсчёт',
  'Beep the last': 'Сигнал за',
  'Every countdown: rest, get ready, and a prescribed hold':
    'Любой отсчёт: отдых, подготовка и заданное удержание',
  Sound: 'Звук',
  Vibration: 'Вибрация',
  'Keep the screen on': 'Не гасить экран',
  'While a timer is running': 'Пока идёт таймер',
  'Notify when a timer ends': 'Уведомлять об окончании таймера',
  "How the beep reaches you when the app isn't open — a tick 5 s out, then the tone":
    'Как сигнал дойдёт, когда приложение закрыто: тик за 5 с, затем тон',
  'Test the beep': 'Проверить сигнал',
  'Test the countdown beep': 'Проверить сигнал отсчёта',
  'counting…': 'считаю…',
  '3 · 2 · 1 · go': '3 · 2 · 1 · пошли',
  Body: 'Тело',
  Bodyweight: 'Вес тела',
  'What makes push-ups, dips and assisted work countable':
    'То, что позволяет считать отжимания, брусья и работу с помощью',
  'Not set': 'Не задан',
  'Clear my bodyweight': 'Убрать мой вес',
  'Until this is set, a session of push-ups or dips reports no volume — the app will not guess what your body weighs. Nothing else reads it.':
    'Пока вес не задан, тренировка из отжиманий или брусьев не даёт объёма — приложение не станет его угадывать. Больше он нигде не используется.',
  'Read only when working out session volume. It is not logged, charted or compared to anything.':
    'Читается только при расчёте объёма тренировки. Он не записывается, не строит график и ни с чем не сравнивается.',
  Gym: 'Зал',
  'Gym {n}': 'Зал {n}',
  Plates: 'Блины',
  'Plates · this gym': 'Блины · этот зал',
  'Which plates this gym has, in kilograms. Only used to work out what goes on the bar; it never changes a weight you have typed.':
    'Какие блины есть в этом зале, в килограммах. Нужны только для расчёта набора на штанге и никогда не меняют введённый вами вес.',
  'Which plates your gym has, in kilograms. Only used to work out what goes on the bar; it never changes a weight you have typed.':
    'Какие блины есть в вашем зале, в килограммах. Нужны только для расчёта набора на штанге и никогда не меняют введённый вами вес.',
  '{count} sizes': 'размеров: {count}',
  'Remove {name}': 'Удалить «{name}»',
  'Add another gym': 'Добавить ещё зал',
  'A gym is a name and the plates on its rack — nothing else. Tap one to make it the current gym; the chips above then edit that gym’s plates.':
    'Зал — это название и блины на стойке, больше ничего. Нажмите на него, чтобы сделать текущим; кнопки выше тогда правят блины этого зала.',
  'Weekly sets': 'Подходов в неделю',
  '{count} sets': 'подходов: {count}',
  'Optional. Set one and the training history compares this window against it; leave it at “—” and the counts stay counts.':
    'Необязательно. Задайте цель — и история тренировок будет сравнивать период с ней; оставьте «—», и счётчики останутся просто счётчиками.',
  Units: 'Единицы',
  Kilograms: 'Килограммы',
  Pounds: 'Фунты',
  'Weight units': 'Единицы веса',
  'Display only. Every set is stored in kilograms, so switching can never change what your history says you lifted.':
    'Только отображение. Каждый подход хранится в килограммах, поэтому переключение не меняет того, что записано в истории.',
  'Workouts on disk': 'Тренировок на диске',
  'Cannot read the log': 'Не удалось прочитать журнал',
  '{onDisk} on disk · {loaded} loaded': 'на диске: {onDisk} · загружено: {loaded}',
  'Share workouts with Health Connect': 'Передавать тренировки в Health Connect',
  'On · start, end and name': 'Вкл · начало, конец и название',
  'Needs permission': 'Нужно разрешение',
  'Health Connect did not grant permission, so nothing will be shared.':
    'Health Connect не дал разрешения, поэтому ничего передаваться не будет.',
  'Delete all workout history': 'Удалить всю историю тренировок',
  'Delete all workout history?': 'Удалить всю историю тренировок?',
  'All {count} finished {workouts} go, and so do the sets in them — which is what the prefills and the overload suggestions read. This cannot be undone.':
    'Исчезнут все завершённые {workouts} ({count}) и подходы в них — именно их читают подстановки и подсказки о прогрессии. Отменить это нельзя.',
  'Delete everything': 'Удалить всё',
  'Keep my history': 'Оставить историю',
  workout: 'тренировка',
  workouts: 'тренировок',
  'Everything on this screen is about training. The daily tasks and the expenses have settings screens of their own, and the backup that carries all three is one row in the general section.':
    'Всё на этом экране — про тренировки. У ежедневных задач и расходов есть свои экраны настроек, а резервная копия, которая хранит всё сразу, — одна строка в общем разделе.',

  /* --- the workout, the library, the log and the sheets ------------ */
  'A day': 'День',
  'A line needs two sessions to have a direction. Log this exercise once more and it appears here.':
    'Линии нужны две тренировки, чтобы появилось направление. Запишите это упражнение ещё раз — и график появится здесь.',
  'A single day, or a whole month': 'Один день или целый месяц',
  'A weight cell renders on every set': 'В каждом подходе будет поле веса',
  'A whole month counts towards the month, the year and the balance, and towards no single day.':
    'Сумма за месяц идёт в месяц, в год и в баланс, но ни в один конкретный день.',
  'Abandon the hold without logging': 'Бросить удержание, не записывая',
  'Add a step': 'Добавить шаг',
  'Add an exercise to this workout': 'Добавить упражнение в тренировку',
  'Add at least one step to turn it on': 'Добавьте хотя бы один шаг, чтобы включить',
  'Add to this category': 'Добавить в эту категорию',
  'Add warm-up sets: {what}': 'Добавить разминочные подходы: {what}',
  'Add {name} to the sequence': 'Добавить «{name}» в последовательность',
  'Add {seconds} seconds': 'Добавить {seconds} с',
  'Add {unit}': 'Добавить {unit}',
  Added: 'С весом',
  'Adjust.': 'Изменить.',
  'All workouts': 'Все тренировки',
  'Amount in {currency}': 'Сумма в {currency}',
  'Archive this category': 'Архивировать категорию',
  'Archive “{name}”?': 'Архивировать «{name}»?',
  Archived: 'В архиве',
  'Archived, not deleted — its amounts stay in the month, the year and the balance.':
    'В архив, а не удалить — суммы остаются в месяце, в году и в балансе.',
  Assisted: 'С помощью',
  'Automatic backups will go to that folder from now on.':
    'Автоматические копии теперь будут сохраняться в эту папку.',
  'Backed up {name} to {folder} — {counts}.': 'Копия {name} сохранена в {folder} — {counts}.',
  'Backup every': 'Копировать каждые',
  'Balance over the same range': 'Баланс за тот же период',
  Best: 'Лучшее',
  Brutal: 'Жёстко',
  'Cancel the timer without logging': 'Отменить таймер без записи',
  'Cancel timer without logging': 'Отменить таймер без записи',
  Category: 'Категория',
  'Category glyph': 'Значок категории',
  'Category name': 'Название категории',
  Glyph: 'Значок',
  'Choose a backup folder': 'Выбрать папку для копий',
  Close: 'Закрыть',
  'Complete set': 'Отметить подход',
  'Correct a set.': 'Исправить подход.',
  'Correct the count, {count} {unit}': 'Исправить количество: {count} {unit}',
  'Correct the weight, {weight} {unit}': 'Исправить вес: {weight} {unit}',
  'Could not write to that folder. Pick it again to re-grant access.':
    'Не удалось записать в эту папку. Выберите её заново, чтобы выдать доступ.',
  "Couldn't open your log": 'Не удалось открыть журнал',
  'Count up': 'Отсчёт вверх',
  'Counted in': 'Считается в',
  'Counts down from {target} and logs the hold when it reaches zero.':
    'Отсчитывает от {target} и записывает удержание по нулю.',
  'Counts up until you stop it, and logs the time you held.':
    'Считает вверх, пока не остановите, и записывает продержанное время.',
  Create: 'Создать',
  Cue: 'Подсказка',
  Date: 'Дата',
  'Decrease {label}': 'Уменьшить «{label}»',
  'Delete it': 'Удалить',
  'Delete this amount': 'Удалить эту сумму',
  'Delete this amount?': 'Удалить эту сумму?',
  'Delete this workout': 'Удалить эту тренировку',
  'Delete {name}': 'Удалить «{name}»',
  'Delete “{title}”?': 'Удалить «{title}»?',
  'Discard the workout and restart': 'Сбросить тренировку и перезапустить',
  'Dismiss suggestion': 'Скрыть подсказку',
  'Distance per session': 'Дистанция за тренировку',
  'Done adjusting': 'Готово',
  'Done correcting': 'Готово',
  'Done editing': 'Готово',
  'Down to': 'Вниз до',
  'Duplicate this routine': 'Сделать копию программы',
  'Each one': 'Каждое',
  'Each round counts down from {target}, then logs itself.':
    'Каждый круг отсчитывает от {target} и записывается сам.',
  Earlier: 'Раньше',
  Easy: 'Легко',
  Edit: 'Изменить',
  'Edit exercise': 'Изменить упражнение',
  'Edit the exercises in {name}': 'Изменить упражнения в «{name}»',
  'Edit {name}: rest, defaults and targets':
    'Изменить «{name}»: отдых, значения по умолчанию и цели',
  'Edit {noun}': 'Изменить {noun}',
  'Elbows in, pause at the chest': 'Локти прижаты, пауза у груди',
  'Every duration, switch, target and default across all three sections goes back to how it shipped, and your bodyweight is cleared. Your exercises, routines, history, tasks and amounts are untouched.':
    'Все длительности, переключатели, цели и значения по умолчанию во всех трёх разделах вернутся к исходным, а вес тела будет очищен. Упражнения, программы, история, задачи и суммы останутся нетронутыми.',
  'Every other workout renumbers from this one — the ones before it count down, the ones after it count up. Set it once on any session and the whole log lines up, including the sessions you did before this app existed.':
    'Все остальные тренировки перенумеруются от этой: те, что раньше, идут вниз, те, что позже, — вверх. Задайте номер один раз на любой тренировке, и весь журнал выстроится, включая тренировки до появления приложения.',
  'Every set in this workout moves with it': 'Все подходы этой тренировки переедут вместе с ней',
  'Every setting is back to its default.': 'Все настройки вернулись к исходным.',
  'Every workout you have logged': 'Все записанные тренировки',
  'Every {days} days': 'Каждые {days} дн.',
  'Exercise name': 'Название упражнения',
  'Exercise since deleted': 'Упражнение удалено',
  Expense: 'Расход',
  'Expenses over time': 'Расходы по времени',
  External: 'Внешний',
  Finish: 'Завершить',
  'Finish a workout and it lands here — every set, with what you lifted and how long it took.':
    'Завершите тренировку — и она окажется здесь: каждый подход, вес и время.',
  'Finish a workout and the days you trained appear here.':
    'Завершите тренировку — и дни занятий появятся здесь.',
  'Finish and update the plan': 'Завершить и обновить план',
  'Finish this workout': 'Завершить эту тренировку',
  'Finish two workouts and both graphs draw themselves — reps and weight, session by session.':
    'Завершите две тренировки — и оба графика построятся сами: повторы и вес, тренировка за тренировкой.',
  'Finish workout': 'Завершить тренировку',
  'Finish workout?': 'Завершить тренировку?',
  'First pick is the primary — it decides which section this files under.':
    'Первый выбор — основной: он решает, в каком разделе окажется упражнение.',
  Focus: 'Фокус',
  "Follow the rest setting instead of this exercise's own":
    'Следовать настройке отдыха вместо собственной у упражнения',
  'Follow the setting instead': 'Следовать настройке',
  'Following your setting — it moves when you change it':
    'Следует вашей настройке — меняется вместе с ней',
  'Form cue': 'Подсказка по технике',
  'Give this step its own copy of {name}, so it can hold different exercises':
    'Дать этому шагу свою копию «{name}», чтобы в ней были другие упражнения',
  'Hold {seconds} seconds longer': 'Держать на {seconds} с дольше',
  Holds: 'Удержаний',
  'How did that go': 'Как прошло',
  'How far back the cluster counts reach': 'Насколько далеко назад считаются группы',
  'Import it': 'Загрузить',
  Income: 'Доход',
  'Incomes less expenses, running. It starts from what you already had, so the left edge is where the range opened rather than zero.':
    'Доходы минус расходы, нарастающим итогом. Отсчёт идёт от того, что уже было, поэтому левый край — начало периода, а не ноль.',
  'Incomes over time': 'Доходы по времени',
  'Increase {label}': 'Увеличить «{label}»',
  Increment: 'Шаг веса',
  'It comes out of this routine only. The exercise stays in your library with every set you have ever logged against it.':
    'Оно уйдёт только из этой программы. Упражнение останется в базе со всеми записанными подходами.',
  'It leaves the category, the month, the year and the balance. Nothing else changes.':
    'Сумма уйдёт из категории, из месяца, из года и из баланса. Больше ничего не изменится.',
  'It leaves the grid and the chips. Every amount in it stays in the month, the year and the balance.':
    'Категория уйдёт из сетки и из кнопок. Все её суммы останутся в месяце, в году и в балансе.',
  'Keep going': 'Продолжить',
  'Keep mine': 'Оставить свои',
  'Keep what I have': 'Оставить своё',
  'Keep {minutes} min': 'Оставить {minutes} мин',
  Ladder: 'Лесенка',
  'Ladder · max {max}': 'Лесенка · максимум {max}',
  Later: 'Позже',
  'Leave focus mode': 'Выйти из режима фокуса',
  'Lengthen {what} by {seconds} seconds': 'Увеличить «{what}» на {seconds} с',
  'Load mode': 'Тип нагрузки',
  'Long press for focus mode': 'Долгое нажатие — режим фокуса',
  'Long press to edit the category': 'Долгое нажатие — изменить категорию',
  'Make this a working set': 'Сделать рабочим подходом',
  Manual: 'Вручную',
  'Mark this set as a warm-up': 'Отметить как разминочный',
  'Meet every set and one rep is added, from the bottom up. {count} met sessions and the max becomes {max}.':
    'Выполните все подходы — и снизу добавится один повтор. Ещё {count} выполненных тренировок, и максимум станет {max}.',
  'Meet every set and the max becomes {max}.': 'Выполните все подходы — и максимум станет {max}.',
  Metres: 'Метры',
  'Money out, or money in': 'Деньги наружу или внутрь',
  'Move {name} down': 'Переместить «{name}» вниз',
  'Move {name} up': 'Переместить «{name}» вверх',
  Muscles: 'Мышцы',
  Name: 'Название',
  'Needs a folder': 'Нужна папка',
  'New best': 'Новый рекорд',
  'New {noun}': 'Новый {noun}',
  'No amounts yet': 'Пока нет сумм',
  'No completed sets yet.': 'Пока нет выполненных подходов.',
  'No file picked.': 'Файл не выбран.',
  'No folder picked, so nothing was saved.': 'Папка не выбрана, ничего не сохранено.',
  'No rest between them — rest comes after the pair': 'Между ними без отдыха — отдых после пары',
  'No weight cell renders at all': 'Поля веса не будет вовсе',
  None: 'Нет',
  'Not enough yet': 'Пока мало данных',
  'Nothing finished yet': 'Пока ничего не завершено',
  'Nothing recorded on this day. A whole-month amount is on no day at all, so it is not here either.':
    'В этот день ничего не записано. У суммы за целый месяц дня нет вовсе, поэтому здесь её тоже не будет.',
  'Nothing left to rest for': 'Отдыхать больше не за чем',
  'Nothing recorded in this range. Put something in and the line draws itself.':
    'За этот период ничего не записано. Внесите сумму — и линия построится сама.',
  'Off · no steps yet': 'Выкл · шагов пока нет',
  'Off — every set of this exercise plans the same number':
    'Выкл — во всех подходах этого упражнения одно и то же число',
  'Off — the plan is one number': 'Выкл — в плане одно число',
  'On the bar: {plates} kilograms': 'На штанге: {plates} кг',
  'One max, and every set derived from it — plus a rep every session you meet it':
    'Один максимум, и все подходы выводятся из него — плюс повтор за каждую выполненную тренировку',
  'Open focus mode on your next set': 'Открыть режим фокуса на следующем подходе',
  'Open the history for {name}': 'Открыть историю «{name}»',
  'Open {name} as a workout': 'Открыть «{name}» как тренировку',
  'Overload nudges': 'Подсказки о прогрессии',
  'Pause rest': 'Пауза отдыха',
  'Percent done, day by day': 'Процент выполнения по дням',
  'Pick at least one, or it lands in the library’s Unfiled section.':
    'Выберите хотя бы одну, иначе упражнение попадёт в раздел «Без группы».',
  'Remove exercise': 'Убрать упражнение',
  'Remove set': 'Убрать подход',
  'Remove this set from the workout': 'Убрать этот подход из тренировки',
  'Remove {name} from the sequence': 'Убрать «{name}» из последовательности',
  'Remove {name} from this routine': 'Убрать «{name}» из этой программы',
  'Remove {name} from this workout': 'Убрать «{name}» из этой тренировки',
  'Remove {name}?': 'Убрать «{name}»?',
  'Remove {unit}': 'Убрать {unit}',
  'Remove “{name}”?': 'Убрать «{name}»?',
  'Replace everything with this file?': 'Заменить всё этим файлом?',
  Reps: 'Повторы',
  'Reps per session': 'Повторов за тренировку',
  'Reps per workout': 'Повторов за тренировку',
  'Requires weight': 'Нужен вес',
  'Reset every setting?': 'Сбросить все настройки?',
  'Reset settings': 'Сбросить настройки',
  'Rest after every set, as normal': 'Отдых после каждого подхода, как обычно',
  'Rest between rounds': 'Отдых между кругами',
  'Rest between sets': 'Отдых между подходами',
  'Rest paused with {seconds} seconds left': 'Отдых на паузе, осталось {seconds} с',
  'Rest {clock}': 'Отдых {clock}',
  'Rest {what} {size} seconds longer': 'Отдых {what} на {size} с дольше',
  'Rest {what} {size} seconds shorter': 'Отдых {what} на {size} с короче',
  'Restored {counts}, and your settings.': 'Восстановлено: {counts}, а также настройки.',
  'Restored {counts}.': 'Восстановлено: {counts}.',
  'Resume rest': 'Продолжить отдых',
  Right: 'В самый раз',
  Rounds: 'Круги',
  'Same {held} for {days} days · {sessions} sessions':
    'Одно и то же ({held}) уже {days} дн · тренировок: {sessions}',
  'Save {noun}': 'Сохранить {noun}',
  'Saved {name} to {where} — {counts}.': '{name} сохранён в {where} — {counts}.',
  'Session complete': 'Тренировка завершена',
  Sessions: 'Тренировки',
  'Set inputs': 'Поля подхода',
  Sets: 'Подходы',
  'Sets per cluster': 'Подходов по группам',
  'Sets you already logged are saved. Try again first — discard the workout only if it crashes straight back to here.':
    'Записанные подходы сохранены. Сначала попробуйте ещё раз — сбрасывайте тренировку, только если сюда снова возвращает сразу.',
  'Shorten {what} by {seconds} seconds': 'Сократить «{what}» на {seconds} с',
  'Show all {count} sets.': 'Показать все подходы ({count}).',
  Skip: 'Пропустить',
  'Skip rest': 'Пропустить отдых',
  'Slide to move it · position {position} of {total}':
    'Ведите пальцем · позиция {position} из {total}',
  'Something broke': 'Что-то сломалось',
  Start: 'Начать',
  'Start a {clock} rest': 'Запустить отдых {clock}',
  'Start now': 'Начать сейчас',
  'Start now, skip the get-ready count': 'Начать сейчас, без подготовки',
  'Start the hold now, without the count-in': 'Начать удержание сейчас, без отсчёта',
  'Start the sequence over': 'Начать последовательность заново',
  'Start the {count} clock': 'Запустить таймер на {count}',
  'Start the {count} timer': 'Запустить таймер на {count}',
  Started: 'Начало',
  'Starting in {seconds}': 'Старт через {seconds}',
  'Starting in {seconds} seconds': 'Старт через {seconds} с',
  Stop: 'Стоп',
  'Stop and log {clock}': 'Остановить и записать {clock}',
  'Stop the clock and log what it read': 'Остановить таймер и записать показание',
  'Stop the timer and log this set': 'Остановить таймер и записать подход',
  'Suggests the next routine on the home screen':
    'Подсказывает следующую программу на главном экране',
  'Superset with the exercise above': 'Суперсет с упражнением выше',
  'Swipe down, or tap': 'Проведите вниз или нажмите',
  'Tap to close its sets': 'Нажмите, чтобы свернуть подходы',
  'Tap to close its sets. Long press, then slide to reorder':
    'Нажмите, чтобы свернуть подходы. Долгое нажатие и ведите, чтобы переставить',
  'The ladder is shaped to this many sets': 'Лесенка строится под это число подходов',
  'The ladder’s max is the only number this exercise needs — it derives every set.':
    'Максимум лесенки — единственное нужное число: из него выводится каждый подход.',
  'The month or the trend': 'Месяц или тренд',
  'The only set — delete the workout': 'Единственный подход — удалить тренировку',
  'The order': 'Порядок',
  'The screen below this one crashed.': 'Экран под этим аварийно завершился.',
  'This cannot be undone.': 'Отменить это нельзя.',
  'This exercise only': 'Только это упражнение',
  'This movement, in every routine that has it': 'Это движение во всех программах, где оно есть',
  'This phone has {counts}, and all of it goes.':
    'На этом телефоне: {counts} — и всё это исчезнет.',
  'This workout reads {minutes} min. Restarting the clock makes it 0, and history will record it from this moment — the sets you already logged stay exactly as they are.':
    'Тренировка идёт {minutes} мин. Перезапуск обнулит таймер, и история будет считать её с этого момента — записанные подходы останутся как есть.',
  Time: 'Время',
  'Time per session': 'Время за тренировку',
  Timer: 'Таймер',
  Took: 'Длилась',
  'Top weight per session': 'Максимальный вес за тренировку',
  'Top working weight': 'Максимальный рабочий вес',
  Trend: 'Тренд',
  'Try again': 'Попробовать снова',
  'Try {count} {unit} at the same weight': 'Попробуйте {count} {unit} с тем же весом',
  'Try {what}': 'Попробуйте {what}',
  Type: 'Ввести',
  'Type an exact value': 'Ввести точное значение',
  'Undo set': 'Отменить подход',
  'Undo the last logged set': 'Отменить последний записанный подход',
  'Up next: {name}. Adjust the weight or the count.': 'Далее: {name}. Измените вес или количество.',
  'Up to three months the line is one point a day; past that it is one a month. A whole-month amount has no day to sit on, so it only appears once the buckets are months.':
    'До трёх месяцев линия строится по дням, дальше — по месяцам. У суммы за месяц нет своего дня, поэтому она появляется, только когда деления — месяцы.',
  Use: 'Применить',
  'Spent {spent} · received {received}': 'Потрачено {spent} · получено {received}',
  'Use this sequence': 'Использовать последовательность',
  'Warm-up': 'Разминка',
  'Weight per workout': 'Вес за тренировку',
  'Weight {weight} {unit}': 'Вес {weight} {unit}',
  'What a routine plans for this exercise': 'Сколько программа планирует на это упражнение',
  'What amounts are counted in': 'В чём считаются суммы',
  'What it was for': 'На что',
  'Where it went': 'Куда ушло',
  'Which workout was this?': 'Какая это была тренировка?',
  'Whole month': 'Весь месяц',
  'Working set': 'Рабочий подход',
  'Workout name': 'Название тренировки',
  'Workout {number}': 'Тренировка {number}',
  'You type the number after the set. No clock runs.':
    'Число вводится после подхода. Таймер не идёт.',
  'Your workouts are still on disk — this is a failure to READ them, not a loss. Close the app and open it again. Settings states how many are down there, and “Export data” still works.':
    'Тренировки по-прежнему на диске: не удалось их ПРОЧИТАТЬ, они не потеряны. Закройте приложение и откройте снова. В настройках указано, сколько их там, и «Выгрузить всё» по-прежнему работает.',
  'added bodyweight': 'с весом тела',
  amount: 'сумма',
  amounts: 'сумм',
  assisted: 'с помощью',
  brutal: 'жёстко',
  'count up': 'отсчёт вверх',
  countdown: 'обратный отсчёт',
  'counting out loud · lands on a long tone': 'отсчёт вслух · заканчивается длинным тоном',
  'default {unit}': 'вес по умолчанию, {unit}',
  distance: 'дистанция',
  'distance + duration': 'дистанция + время',
  done: 'выполнено',
  missed: 'пропущено',
  unanswered: 'без ответа',
  duration: 'длительность',
  'duration only': 'только длительность',
  'each side': 'на каждую сторону',
  easy: 'легко',
  'edit exercises': 'изменить упражнения',
  'every set logged': 'все подходы записаны',
  exercise: 'упражнение',
  expense: 'расход',
  external: 'внешний',
  'get ready': 'подготовка',
  'hold · not running': 'удержание · не запущено',
  holding: 'держим',
  income: 'доход',
  'ladder reps': 'повторы лесенкой',
  'last session · {count} sessions plotted': 'последняя тренировка · точек на графике: {count}',
  'last set logged': 'последний подход записан',
  'last: {what}': 'прошлый раз: {what}',
  level: 'без изменений',
  'logs itself at the bell': 'запишется само по сигналу',
  'make it different': 'сделать другой',
  max: 'максимум',
  'meet it and the max becomes {max}': 'выполните — и максимум станет {max}',
  metres: 'метры',
  month: 'месяц',
  months: 'месяцев',
  'most on {label}, {value}': 'больше всего {label}, {value}',
  next: 'следующая',
  'next exercise': 'следующее упражнение',
  'no note': 'без заметки',
  'no rest': 'без отдыха',
  'no target, no drain line, no bell': 'без цели, без полосы, без сигнала',
  'no workout': 'тренировок нет',
  'not started': 'не начата',
  'nothing left to rest for': 'отдыхать больше не за чем',
  'of {target}': 'из {target}',
  'part of a superset': 'часть суперсета',
  paused: 'пауза',
  reps: 'повторы',
  'reps only · duration · distance + duration':
    'только повторы · длительность · дистанция + длительность',
  rest: 'отдых',
  'rest {clock}': 'отдых {clock}',
  right: 'в самый раз',
  round: 'круг',
  'round length': 'длина круга',
  rounds: 'круги',
  routine: 'программа',
  routines: 'программ',
  'same weight for {days} days': 'тот же вес уже {days} дн',
  session: 'тренировка',
  sessions: 'тренировок',
  set: 'подход',
  'set {n} of {total}': 'подход {n} из {total}',
  setting: 'настройка',
  'skip the clock to finish the workout': 'пропустите таймер, чтобы завершить тренировку',
  'suggestion waiting': 'есть подсказка',
  'supersetted with the exercise above': 'в суперсете с упражнением выше',
  'swipe down to exit': 'проведите вниз, чтобы выйти',
  'target distance': 'целевая дистанция',
  'target reps': 'целевые повторы',
  'target time': 'целевое время',
  task: 'задача',
  tasks: 'задач',
  'this exercise': 'это упражнение',
  time: 'время',
  'top {weight} {unit}': 'максимум {weight} {unit}',
  'undo last set': 'отменить последний подход',
  'unit:kg': 'кг',
  'unit:m': 'м',
  'unit:min': 'мин',
  'unit:reps': 'повт',
  'unit:round': 'круг',
  'up next': 'далее',
  'walk to a new machine · you were on {name}':
    'переход к другому снаряду · до этого было «{name}»',
  'warm-up': 'разминка',
  'weight + ladder': 'вес + лесенка',
  'weight + {noun}': 'вес + {noun}',
  'whole month': 'весь месяц',
  working: 'работа',
  'your next set is in here': 'ваш следующий подход здесь',
  '{clock} held': 'продержано {clock}',
  '{clock} left': 'осталось {clock}',
  '{count} logged sets will go with it, and nothing about them reaches your history. The exercise itself stays in your library.':
    'Записанных подходов ({count}) исчезнет вместе с ним, и в историю о них ничего не попадёт. Само упражнение останется в базе.',
  '{count} met sessions to a max of {max}': 'ещё {count} выполненных тренировок до максимума {max}',
  '{count} rounds': 'кругов: {count}',
  '{count} set is': '{count} подход',
  '{count} sets are': 'подходов: {count}',
  '{count} sets logged in this workout will be thrown away, and nothing will reach your history. Use Finish instead if you want to keep them.':
    'Записанные в этой тренировке подходы ({count}) будут выброшены, и в историю ничего не попадёт. Нажмите «Завершить», если хотите их сохранить.',
  '{count} still unlogged. They won’t be saved.': '{count} ещё не записано. Они не сохранятся.',
  '{count} to hold': 'держать {count}',
  '{count} {amounts}': '{amounts}: {count}',
  '{count} {days}': '{days}: {count}',
  '{count} {days} trained': 'тренировок по дням: {count} {days}',
  '{count} {exercises}': '{exercises}: {count}',
  '{count} {noun}': '{noun}: {count}',
  '{count} {sessions}': '{sessions}: {count}',
  '{count} {sets} logged': 'записано: {count} {sets}',
  '{count} {steps}': '{steps}: {count}',
  '{count} {workouts}': '{workouts}: {count}',
  '{date} · {count} sets. This is the record of a workout you did — deleting it also removes those sets from what the overload suggestions read.':
    '{date} · подходов: {count}. Это запись о проведённой тренировке — удаление уберёт эти подходы и из того, что читают подсказки о прогрессии.',
  '{days} days': '{days} дн.',
  '{delta} since {date}': '{delta} с {date}',
  '{done} of {total} sets': 'подходов: {done} из {total}',
  '{file} holds {counts}.': 'В файле {file}: {counts}.',
  '{minutes} min': '{minutes} мин',
  '{minutes} minutes': '{minutes} мин',
  '{name}, next up': '{name}, следующая',
  '{name}, step {position}. Make it the next one up.': '{name}, шаг {position}. Сделать следующей.',
  '{name}, {done} of {total} sets done': '{name}, выполнено подходов: {done} из {total}',
  '{noun} only': 'только {noun}',
  '{seconds} sec': '{seconds} с',
  '{seconds} seconds held': 'продержано {seconds} с',
  '{seconds} seconds left': 'осталось {seconds} с',
  '{seconds} seconds of rest left': 'отдыха осталось {seconds} с',
  '{suggestion} — apply to every remaining set':
    '{suggestion} — применить ко всем оставшимся подходам',
  '{total} over {count} {buckets} · about {average} each':
    '{total} за {count} {buckets} · примерно {average} на каждый',
  '{total} sets planned · not started': 'запланировано подходов: {total} · не начата',
  '{weight} {unit} by': '{weight} {unit} на',
  '{what} total': 'всего {what}',

  /* --- 1.9.0: the strings the screens were still printing in English --- */
  adjust: 'изменить',
  '{name} (copy)': '{name} (копия)',
  '{name} (copy {n})': '{name} (копия {n})',
  Almost: 'Почти',
  '5 seconds left.': 'Осталось 5 секунд.',
  'Set logged — rest.': 'Подход записан — отдых.',
  'Get set': 'Приготовьтесь',
  'Rest ends in 5 seconds.': 'Отдых закончится через 5 секунд.',
  'Rest over': 'Отдых окончен',
  'Next set.': 'Следующий подход.',
  'Timer finished': 'Таймер закончился',
  'Rest is over, or a timed set rang its bell.': 'Отдых окончен или прозвенел подход на время.',
  'A tick {seconds} seconds before a timer ends.': 'Сигнал за {seconds} с до конца таймера.',
  'A task, or a workout, at the time you asked to be reminded.':
    'Задача или тренировка — в то время, о котором вы просили напомнить.',
  'Add to workout': 'Добавить в тренировку',
  'Add to that workout': 'Добавить в ту тренировку',
  'Show the log or the graphs': 'Показать журнал или графики',
  'It is in {count} {routines}, and will be removed from them.':
    'Входит в {count} {routines} — и будет оттуда удалено.',
  'It is not in any routine.': 'Не входит ни в одну программу.',
  'Sets you already logged stay in your history.': 'Записанные подходы останутся в истории.',
  'It is gone': 'Его больше нет',
  'This was deleted while you were looking at it.': 'Это удалили, пока вы на него смотрели.',
  Yesterday: 'Вчера',
  '{days} {daysWord} ago': '{days} {daysWord} назад',
  '{count} sessions at {weight} {unit} without a rep. One session at {suggested} {unit} resets it.':
    '{count} тренировок на {weight} {unit} без прибавки. Одна тренировка на {suggested} {unit} это сбросит.',
  'That is not valid JSON — the file or the paste is incomplete.':
    'Это не валидный JSON — файл или вставленный текст неполный.',
  'That file holds something other than a backup.': 'В этом файле не резервная копия.',
  'That backup was written by a newer version of the app (format {version}). Update the app first.':
    'Эта копия записана более новой версией приложения (формат {version}). Сначала обновите приложение.',
  'That file has no exercises, routines or workouts in it.':
    'В этом файле нет ни упражнений, ни программ, ни тренировок.',
  'That backup is empty — there is nothing in it to restore.':
    'Эта копия пуста — восстанавливать нечего.',
  'the folder you picked': 'выбранная папка',
  'This device has no writable app folder.': 'На этом устройстве нет папки для записи.',
  'Something went wrong reaching the file system.':
    'Что-то пошло не так при обращении к файловой системе.',
  'The log could not be read, so a backup would be missing it. Nothing is lost — close the app and open it again.':
    'Журнал не удалось прочитать, поэтому копия была бы неполной. Ничего не потеряно — закройте приложение и откройте снова.',
  Random: 'Случайная',
  '{weight} set': 'подход {weight}',
  '{name} did {done} {sets}, not {planned}': '{name}: {done} {sets}, а не {planned}',
  '{head}, and {count} {others} changed too': '{head}, и ещё {count} {others} изменилось',
  '{name} · new max {max} · {plan} next time': '{name} · новый максимум {max} · дальше {plan}',
  '{name} · {plan} next time': '{name} · дальше {plan}',
  '{head}, and {count} {others} moved up too': '{head}, и ещё {count} {others} поднялось',
  other: 'другое',
  others: 'других',
  'One day at a time': 'По одному дню',
  'One line, shown on the card while you are doing this exercise. A seat height, a pin number, the thing you keep forgetting.':
    'Одна строка, видна на карточке во время упражнения. Высота сиденья, номер фиксатора — то, что вы всё время забываете.',
  'Off · the ladder owns the reps': 'Выкл · повторения задаёт лестница',
  'Off · no load to add': 'Выкл · нечего добавлять к весу',
  'Reps, time and metres swap the same two wells:':
    'Повторения, время и метры меняют одни и те же два поля:',
  'Current maximum': 'Текущий максимум',
  'No workout in progress': 'Нет активной тренировки',
  'Nothing to log': 'Нечего записывать',
  'This workout has no exercises in it right now.': 'Сейчас в этой тренировке нет упражнений.',
  'Each one holds only what its own section reads. Rest, plates and weekly targets are training; the automatic tick is the daily tasks; what amounts are counted in is the expenses.':
    'В каждом — только то, что читает его раздел. Отдых, блины и недельные цели — тренировки; автоматическая отметка — ежедневные задачи; в чём считаются суммы — расходы.',
  'A backup is plain JSON, so you can read it, keep it anywhere, and move it to another phone. It holds all three sections — training, the daily tasks and the expenses — and every setting.':
    'Копия — это обычный JSON: её можно прочитать, хранить где угодно и перенести на другой телефон. В ней все три раздела — тренировки, ежедневные задачи и расходы — и все настройки.',
  'Replace everything': 'Заменить всё',
  'makes this phone look like the file, so export first if there is anything here you would miss. A backup written by an older version carries no tasks and no amounts, and restoring one leaves both of those exactly where they are rather than emptying them. A workout in progress is not part of a backup: it carries a running clock.':
    'делает телефон таким, как файл, — поэтому сначала выгрузите то, что жалко потерять. В копии из старой версии нет ни задач, ни сумм, и восстановление такой копии оставит и то и другое как есть, а не очистит. Идущая тренировка в копию не входит: в ней работают часы.',
  'Reset every setting': 'Сбросить все настройки',
  'puts all three sections’ settings back to their defaults at once. It does not touch a single thing you have logged — not an exercise, not a routine, not an answered day, not an amount.':
    'разом возвращает настройки всех трёх разделов к исходным. Ничего из записанного это не трогает — ни упражнение, ни программу, ни отвеченный день, ни сумму.',
  'Add a set to {name}': 'Добавить подход — {name}',
  '+ Add a set': '+ Добавить подход',
  '+ Add an exercise': '+ Добавить упражнение',
  'Edit the name, date and length of {title}': 'Изменить название, дату и длительность — {title}',
  'Edit name, date and length': 'Изменить название, дату и длительность',
  'Change the number of workout {number}': 'Изменить номер тренировки {number}',
  'Set this workout’s number': 'Задать номер этой тренировки',
  'Workout number: {number}': 'Номер тренировки: {number}',
  'Set the workout number': 'Задать номер тренировки',
  'Delete the {title} workout': 'Удалить тренировку «{title}»',
  'A label, not a conversion. Every amount is stored as a plain number, so changing this changes what is printed after each figure and nothing else — no rate, no rewriting of what you already recorded. Up to four characters; points and tokens are as valid here as a currency.':
    'Это подпись, а не пересчёт. Каждая сумма хранится обычным числом, поэтому меняется только то, что печатается после цифры, — ни курса, ни переписывания записанного. До четырёх символов; баллы и токены здесь так же уместны, как валюта.',
  'Opens on': 'Открывается на',
  'The window and the direction the expenses section starts at. Both still change on that screen; this is only where it begins.':
    'Период и направление, с которых открывается раздел расходов. И то и другое по-прежнему меняется на самом экране; здесь — только начало.',
  'Which range the ⟲ in the corner of the expenses opens on.':
    'На каком диапазоне открывается ⟲ в углу расходов.',
  'There are no routines to put in a sequence yet. Make one in Routines, at the foot of the workout screen, first.':
    'Пока нет программ, которые можно поставить в последовательность. Сначала создайте программу в разделе «Программы», внизу экрана тренировки.',
  'Nothing recorded this month': 'В этом месяце ничего не записано',
  '{done} of {asked} done · {days} {dayWord}': '{done} из {asked} сделано · {days} {dayWord}',
  'The fuller the bubble, the more of that day was done. Tap one to open it and answer its tasks.':
    'Чем полнее кружок, тем больше сделано в тот день. Нажмите, чтобы открыть день и ответить на его задачи.',
  Less: 'Меньше',
  More: 'Больше',
  '{day}, nothing asked': '{day}, ничего не спрашивалось',
  '{day}, {done} of {asked}': '{day}, {done} из {asked}',
  '{from} to {to} · {done} of {asked} answered done':
    '{from} — {to} · отвечено «сделано»: {done} из {asked}',
  'A line needs two days to have a direction. Answer today and tomorrow and it draws itself.':
    'Чтобы у линии было направление, нужно два дня. Ответьте сегодня и завтра — и она нарисуется.',
  'Days that asked for nothing are left out rather than plotted as zero — a day off is not a day you failed. A task you marked missed on purpose leaves the denominator.':
    'Дни, в которые ничего не спрашивалось, не рисуются нулём, а просто выпадают — выходной это не провал. Задача, отмеченная как пропущенная намеренно, уходит из знаменателя.',
  'Max {max} · {total} reps · one rep is added every session you meet it':
    'Максимум {max} · {total} повт · по одному повторению за каждую выполненную тренировку',
  'Superset with the one above': 'Суперсет с упражнением выше',
  'Open its history': 'Открыть его историю',
  'Nothing in {window}.': 'Ничего за {window}.',
  '4 weeks': '4 недели',
  '12 weeks': '12 недель',
  All: 'Всё',
  'unit:rounds': 'кругов',
  'unit:sec': 'с',
  'My gym': 'Мой зал',
  'Morning Bible/Narek reading': 'Утреннее чтение Библии / Нарека',
  'In-Work Task Report': 'Отчёт по рабочим задачам',
  'Gym / Boxing': 'Зал / бокс',
  'Productivity/Day Tasks': 'Продуктивность / задачи дня',
  'Evening Bible reading': 'Вечернее чтение Библии',
  "Plan tomorrow's tasks": 'Запланировать задачи на завтра',
  'Book reading before sleep': 'Чтение книги перед сном',
  'Sleep before midnight': 'Лечь спать до полуночи',
  'Track expenses': 'Записать расходы',

  /* ── The Liquid Glass redesign's own strings ──────────────────────────
     The hero's nudge chip, the three counts under the day dial, the three
     doors at the top of Settings, and the keypad. */
  nudge: 'подсказка',
  nudges: 'подсказок',
  '{count} done': '{count} сделано',
  '{count} left': '{count} осталось',
  '{count} on purpose': '{count} намеренно',
  'streak kept': 'серия сохранена',
  'Rest, plates, weekly targets': 'Отдых, блины, недельные цели',
  'The automatic tick': 'Автоматическая отметка',
  'Automatic backups are off': 'Автокопии выключены',
  'Nothing you have logged is touched.': 'Ничего из записанного не трогается.',
  Amount: 'Сумма',
  'Type an amount first': 'Сначала введите сумму',
  'Delete the last digit': 'Удалить последнюю цифру',
  Saved: 'Сохранено',
  'Written down': 'Записано',
};

/** Test hook: the strings this build can translate. Not read by the app. */
export function translatedKeys(): string[] {
  return Object.keys(RU);
}
