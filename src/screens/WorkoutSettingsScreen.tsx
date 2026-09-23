/**
 * WorkoutSettingsScreen — every duration the app counts, and the two switches
 * that decide whether it can be heard.
 *
 * ONE OF THREE, reached from the section row in `SettingsHomeScreen`. Settings
 * used to be one screen holding everything: the rest timers, the plates, the
 * weekly targets, and underneath them eight rows of export and import belonging
 * to three different logs. Nothing on it was wrong and all of it was in one pile,
 * so finding the rest step meant scrolling past the backup folder. Each section
 * now owns its own settings, and the general ones — one export, one import, one
 * reset — are the section list's own screen.
 *
 * What makes a setting belong HERE is that a workout reads it. That is why the
 * sound, the vibration and the screen-on switches are on this screen rather than
 * in the general section despite sounding device-wide: every one of them is about
 * a countdown, and the countdown only runs in a session.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ SETTINGS                                     │
 *   │ REST                                         │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Between sets            2:00   ( − )( + )│ │
 *   │ │ Between exercises       2:30   ( − )( + )│ │
 *   │ │ Start rest automatically         [ ●━ ]  │ │
 *   │ │ Timer ± step              15 s ( − )( + )│ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ │ You rest 2:38 between sets.      Use it  │ │
 *   │ COUNTDOWN                                    │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Beep the last            5 s   ( − )( + )│ │
 *   │ │ Sound                            [ ●━ ]  │ │
 *   │ │ Test the beep                        ▶   │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ BODY                                         │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Bodyweight              82 kg  ( − )( + )│ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ PLATES                                       │
 *   │ (25)(20)(15)(10)( 5 )(2.5)(1.25) 0.5         │
 *   └──────────────────────────────────────────────┘
 *
 * WHY ± CHIPS AND NOT A KEYPAD. This is the same decision `QuickAdjust` makes on
 * a set row, for the same reason: nobody types "135" seconds. Rest is nudged in
 * fifteens from a number that was already close, and the two chips are the same
 * 44 dp targets the rest of the app uses. Held down they repeat — no, they don't,
 * and deliberately: the ranges are small enough that a tap count is honest and a
 * repeat would overshoot.
 *
 * WHY `TEST THE BEEP` IS A ROW. The whole point of the count-in is that it
 * reaches someone who isn't looking at the phone, which means the failure mode is
 * silent: a muted media stream, a denied audio focus, a switch left off. Finding
 * that out at 0:05 of a two-minute plank is finding it out too late. One tap here
 * proves the thing works before it matters.
 *
 * THREE SECTIONS THAT ARE NOT DURATIONS, and what each is for. `Body` holds the
 * one number that makes bodyweight and assisted work countable — without it a
 * session of push-ups reports no volume at all, and the app will not guess.
 * `Plates` holds what is on the rack, which is the other half of the
 * `20 + 2×10 + 2×2.5` line under a barbell lift's weight cell (the bar itself is
 * a fact about the movement, so it lives on the exercise). Both are read in
 * exactly one place each, and both say so on screen.
 *
 * AND ONE ROW THAT MEASURES RATHER THAN ASKS. Under each rest stepper, once there
 * is enough data: "You rest 2:38 between sets." with one tap to adopt it. The
 * timer has always known when a rest began and when the next ✓ landed; this is
 * that number, as a median so one interrupted workout does not move it. It
 * appears only when it disagrees with the setting by more than one nudge, so a tap
 * always does something, and it disappears when they agree — there is nothing to
 * dismiss because it is not asking for anything.
 *
 * Every number is clamped by `settingsStore`, so a row cannot hand a `NaN` to a
 * deadline; this screen only ever asks for a nudge.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from '../components/Pressable';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { ScreenHeader } from '../components/ScreenHeader';
import { TimeWheel } from '../components/TimeWheel';
import {
  Kicker,
  ListCard,
  Segmented,
  SelectChip,
  Separator,
  SettingRow,
  StepperRow,
  SwitchRow,
  TextButton,
} from '../components/primitives';
import { useLanguage, usePlural, useT, type Translate } from '../hooks/useT';
import { parseClockTime, weekdayLabels } from '../lib/days';
import { notificationsGranted } from '../lib/notify';
import type { Weekday } from '../lib/tasks';
import { bumpRestBetweenSets, setRestBetweenSets } from '../state/restSync';
import { LADDER_SETS, describeLadder, ladderForMax } from '../lib/repLadder';
import { commit, countFinal, countTick, tap } from '../lib/feedback';
import { restMedians } from '../lib/restHistory';
import { formatClock, formatWeight, kgToLb, lbToKg, unitLabel, weightSteps } from '../lib/units';
import { useLibrary } from '../state/libraryStore';
import {
  platesInForce,
  SETTING_LIMITS,
  useSettings,
  type NumericSetting,
} from '../state/settingsStore';
import { MAX_GYMS } from '../lib/gyms';
import { CLUSTERS, clusterLabel } from '../lib/muscles';
import {
  healthConnectState,
  requestHealthConnect,
  type HealthConnectState,
} from '../lib/healthConnect';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { palette } from '../theme/tokens';
import type { UnitSystem } from '../types/models';

/**
 * Where the bodyweight row starts from when it has never been set.
 *
 * A visible starting point for the ± chips, not a default: it is stored only once
 * the user taps the row, and what they see immediately is the number they are
 * adjusting. `sanitizeSettings` still has no fallback — an unset bodyweight stays
 * unset everywhere else in the app.
 */
const BODYWEIGHT_START_KG = 70;

/**
 * The plate sizes this screen offers, heaviest first.
 *
 * A superset of the default list: 25 down to 1.25 is what a metric gym stocks, and
 * 0.5 is the change plate some of them have. Fixed rather than free-form because a
 * plate is a physical object with a stamped size — a keypad here would let somebody
 * enter 7 kg and then wonder why nothing loads (see `platesFor` on why a
 * non-canonical set fails).
 */
const PLATE_SIZES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];

/**
 * The clusters, in the order the library files them.
 *
 * `CLUSTERS` from `lib/muscles.ts` rather than a literal here, so a cluster added
 * to the type appears in this list without anybody remembering to add it.
 */
const CLUSTER_ROWS = CLUSTERS;

/**
 * The two unit systems, named in the user's language.
 *
 * A function rather than a constant because the labels are translated, and a
 * module-level array would be frozen in whichever language the app started in.
 */
function unitOptions(t: Translate): readonly { value: UnitSystem; label: string }[] {
  return [
    { value: 'metric', label: t('Kilograms') },
    { value: 'imperial', label: t('Pounds') },
  ];
}

/**
 * A duration as the user thinks about it.
 *
 * Clock form once it passes a minute, because "2:30" is how anyone says a rest,
 * and plain seconds below that, because "0:45" is a stopwatch reading rather than
 * a length. Zero is a word: `0 s` for a setting that is switched off reads like a
 * value that failed to load.
 */
function formatSeconds(seconds: number, t: Translate, zeroLabel = 'Off'): string {
  if (seconds <= 0) return t(zeroLabel);
  if (seconds < 60) return t('{seconds} s', { seconds });
  return formatClock(seconds);
}

export function WorkoutSettingsScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const countedWorkouts = usePlural();
  const settings = useSettings();
  /**
   * The bulk half of `Make every exercise a rep ladder`. The flag lives in
   * Settings, the ladders live on the exercises, and this row is the one place
   * that keeps the two in step — see `libraryStore.setLadderOnAllExercises` for
   * what it will and will not touch.
   */
  const setLadderOnAllExercises = useLibrary((s) => s.setLadderOnAllExercises);
  const clearHistory = useWorkoutHistory((s) => s.clearHistory);
  const workouts = useWorkoutHistory((s) => s.workouts);
  const workoutCount = workouts.length;
  /*
   * Counted from the DATABASE, once per render of this screen, rather than from the
   * array above — the whole point is to be able to disagree with it. Cheap: one
   * `COUNT(*)` over an indexed table, on a screen nobody opens mid-set.
   */
  const onDisk = useWorkoutHistory((s) => s.countOnDisk)();
  /*
   * What the user ACTUALLY rests, from the timer's own measurements. Null until
   * there are enough samples to mean anything — see `restHistory.ts` — and the
   * rows below render nothing at all in that case rather than hedging.
   */
  const measured = useMemo(() => restMedians(workouts), [workouts]);
  /** The whole log, held while the sheet asks. The only sheet on this screen. */
  const [confirming, setConfirming] = useState<'history' | null>(null);
  /** One line, for the one thing on this screen that can be refused elsewhere. */
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Whether Health Connect is installed, granted, or not there at all.
   *
   * Checked once when this screen opens, because the answer can change outside the
   * app — the user can revoke the permission in Android's own settings, or uninstall
   * Health Connect — and a row that reported a stale `On` would be lying about where
   * their training data goes. `unavailable` hides the row entirely: an app that
   * offers a switch for something not installed sends people looking for it.
   */
  const [healthConnect, setHealthConnect] = useState<HealthConnectState>('unavailable');
  useEffect(() => {
    let alive = true;
    void healthConnectState().then((state) => {
      if (alive) setHealthConnect(state);
    });
    return () => {
      alive = false;
    };
  }, []);
  /** Which gym's plate row is open for editing. Null = just the switcher. */
  const [editingGymId, setEditingGymId] = useState<string | null>(null);

  /*
   * The plates in force. `platesInForce` resolves a dangling `activeGymId` rather
   * than trusting it, so the chips can never render against a gym that was deleted.
   */
  const activePlates = platesInForce(settings);
  const gymBeingEdited = settings.gyms.find((gym) => gym.id === editingGymId) ?? null;

  const bump = (key: NumericSetting, direction: 1 | -1) => {
    tap();
    settings.bumpNumber(key, SETTING_LIMITS[key].step * direction);
  };

  /*
   * The between-sets rest does NOT go through `bump`. It is the one setting that
   * has to reach outside this store to be true — every exercise carrying a rest of
   * its own goes back to following it, in the library and in a workout already
   * running. `state/restSync.ts` owns that, and it is called here for the same
   * reason `setLadderOnAllExercises` is: a setting that edits the library is a
   * decision, and the screen is where the user makes it.
   */
  const bumpBetweenSets = (direction: 1 | -1) => {
    tap();
    bumpRestBetweenSets(SETTING_LIMITS.restSecondsBetweenSets.step * direction);
  };

  /**
   * ± on the bodyweight, in the user's own units.
   *
   * THE FIRST TAP SEEDS, it does not nudge. Nudging from "not set" has to start
   * somewhere, and starting from zero would walk up from 20 kg while
   * `BODYWEIGHT_START_KG` puts the number on screen in one tap where it can be
   * read and corrected. It is a starting point the user is looking at, not a
   * guess the app acts on: nothing is stored until this row is touched, and
   * `Clear my bodyweight` puts it back.
   */
  const bumpBodyweight = (direction: 1 | -1) => {
    tap();
    if (settings.bodyweightKg == null) {
      settings.setBodyweightKg(BODYWEIGHT_START_KG);
      return;
    }
    const { coarse } = weightSteps(settings.unitSystem);
    const display =
      settings.unitSystem === 'imperial' ? kgToLb(settings.bodyweightKg) : settings.bodyweightKg;
    const next = Number((display + coarse * direction).toFixed(2));
    settings.setBodyweightKg(settings.unitSystem === 'imperial' ? lbToKg(next) : next);
  };

  /**
   * Turn sharing on (asking for the permission) or off.
   *
   * Off is unconditional and instant — withdrawing consent must never depend on a
   * dialog resolving. On requires the grant, and a denied dialog leaves the switch
   * off rather than on-and-broken.
   */
  const toggleHealthConnect = async () => {
    tap();
    // The line below the card is about the LAST attempt. Leaving a "did not grant
    // permission" under a switch that is now on would be the screen contradicting
    // itself, so every attempt starts by clearing it.
    setNotice(null);
    if (settings.shareToHealthConnect) {
      settings.setShareToHealthConnect(false);
      return;
    }

    const state = await healthConnectState();
    if (state === 'ready') {
      settings.setShareToHealthConnect(true);
      setHealthConnect('ready');
      return;
    }

    const granted = await requestHealthConnect();
    setHealthConnect(granted ? 'ready' : state);
    settings.setShareToHealthConnect(granted);
    if (!granted) {
      setNotice(t('Health Connect did not grant permission, so nothing will be shared.'));
    }
  };

  const asking = confirming != null;

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={asking ? { opacity: 0.28 } : undefined}>
        <ScreenHeader kicker={t('Workout settings')} onBack={onBack} bordered={false} />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!asking}
        >
          {/* ---------------------------------------------------------- */}
          <Kicker className="mx-lg mb-sm mt-md">{t('Rest')}</Kicker>
          <ListCard className="mx-lg">
            <StepperRow
              label={t('Between sets')}
              value={formatSeconds(settings.restSecondsBetweenSets, t, 'No rest')}
              hint={t(
                'Every set of every exercise. Setting it clears any exercise you have given a rest of its own.',
              )}
              onDecrease={() => bumpBetweenSets(-1)}
              onIncrease={() => bumpBetweenSets(1)}
            />
            <MeasuredRestRow
              measuredSeconds={measured.betweenSets}
              settingSeconds={settings.restSecondsBetweenSets}
              what={t('between sets')}
              onAdopt={() => setRestBetweenSets(measured.betweenSets ?? 0)}
            />
            <Separator />
            <StepperRow
              label={t('Between exercises')}
              value={formatSeconds(settings.restSecondsBetweenExercises, t, 'No rest')}
              onDecrease={() => bump('restSecondsBetweenExercises', -1)}
              onIncrease={() => bump('restSecondsBetweenExercises', 1)}
            />
            <MeasuredRestRow
              measuredSeconds={measured.betweenExercises}
              settingSeconds={settings.restSecondsBetweenExercises}
              what={t('between exercises')}
              onAdopt={() =>
                settings.setNumber('restSecondsBetweenExercises', measured.betweenExercises ?? 0)
              }
            />
            <Separator />
            <SwitchRow
              label={t('Start rest automatically')}
              hint={t('Off: rest only runs when you start it')}
              value={settings.autoStartRest}
              onChange={(v) => settings.setFlag('autoStartRest', v)}
            />
            <Separator />
            <StepperRow
              label={t('Timer ± step')}
              hint={t('The +15 on the rest and set-timer pills')}
              value={formatSeconds(settings.adjustStepSeconds, t)}
              onDecrease={() => bump('adjustStepSeconds', -1)}
              onIncrease={() => bump('adjustStepSeconds', 1)}
            />
          </ListCard>

          {/* ---------------------------------------------------------- */}
          <Kicker className="mx-lg mb-sm mt-xxl">{t('Timed sets')}</Kicker>
          <ListCard className="mx-lg">
            <StepperRow
              label={t('Get ready')}
              hint={t('Counted in before a plank or a hang starts')}
              value={formatSeconds(settings.prepareSeconds, t, 'Straight to work')}
              onDecrease={() => bump('prepareSeconds', -1)}
              onIncrease={() => bump('prepareSeconds', 1)}
            />
          </ListCard>

          {/* ----------------------------------------------------------
              REP LADDER — one switch, and it edits the LIBRARY.

              Everything else on this screen is a number the app reads later. This
              one reaches out and changes every rep-counted exercise you have, which
              is exactly what makes it worth having: the ladder is per-exercise
              because a max is per-movement, and turning it on thirty times through
              thirty create screens is how a good scheme goes unused.

              It is reversible, and the line under it says what "off" gives back:
              the ladders this switch added and nothing else. A max you set yourself
              and a ladder that has earned a rep are facts, and a setting does not
              get to delete a fact. */}
          <Kicker className="mx-lg mb-sm mt-xxl">{t('Rep ladder')}</Kicker>
          <ListCard className="mx-lg">
            <SwitchRow
              label={t('Make every exercise a rep ladder')}
              hint={t('One max, {sets} sets — {ladder} at a max of 12', {
                sets: LADDER_SETS,
                ladder: describeLadder(ladderForMax(12, LADDER_SETS)),
              })}
              value={settings.ladderAllExercises}
              onChange={(v) => {
                settings.setFlag('ladderAllExercises', v);
                setLadderOnAllExercises(v);
              }}
            />
          </ListCard>
          <Text className="mx-lg mt-sm text-label text-ink-faint">
            {settings.ladderAllExercises
              ? t(
                  'Every rep-counted exercise runs a ladder, and new ones start with it on. Switching this off takes back only the ladders it added — a max you set yourself, and any ladder that has earned a rep, stay exactly as they are.',
                )
              : t(
                  'Switches the ladder on for every rep-counted exercise at once, seeded from each one’s target reps. Holds, rounds and distances are left alone — a ladder is a rep prescription.',
                )}
          </Text>

          {/* ---------------------------------------------------------- */}
          <Kicker className="mx-lg mb-sm mt-xxl">{t('Countdown')}</Kicker>
          <ListCard className="mx-lg">
            <StepperRow
              label={t('Beep the last')}
              hint={t('Every countdown: rest, get ready, and a prescribed hold')}
              value={formatSeconds(settings.beepSeconds, t, 'Silent')}
              onDecrease={() => bump('beepSeconds', -1)}
              onIncrease={() => bump('beepSeconds', 1)}
            />
            <Separator />
            <SwitchRow
              label={t('Sound')}
              value={settings.soundEnabled}
              onChange={(v) => settings.setFlag('soundEnabled', v)}
            />
            <Separator />
            <SwitchRow
              label={t('Vibration')}
              value={settings.hapticsEnabled}
              onChange={(v) => settings.setFlag('hapticsEnabled', v)}
            />
            <Separator />
            <SwitchRow
              label={t('Keep the screen on')}
              hint={t('While a timer is running')}
              value={settings.keepAwakeEnabled}
              onChange={(v) => settings.setFlag('keepAwakeEnabled', v)}
            />
            <Separator />
            <SwitchRow
              label={t('Notify when a timer ends')}
              hint={t(
                "How the beep reaches you when the app isn't open — a tick 5 s out, then the tone",
              )}
              value={settings.notifyOnTimerEnd}
              onChange={(v) => settings.setFlag('notifyOnTimerEnd', v)}
            />
            <Separator />
            <TestBeepRow />
          </ListCard>

          {/* ----------------------------------------------------------
              THE WORKOUT SCHEDULE — the only thing in this app that speaks first.

              Every other notification here is a TIMER: the user started a rest,
              the phone tells them it is over. This one arrives without being
              asked, on a day the user may not have opened the app at all, and
              that is the whole point — a training plan you have to remember to
              look at is a training plan you stop following in week three.

              WEEKDAYS AND NOT THE SEQUENCE, and it is worth being explicit about
              why, because the sequence looks like the obvious source. It advances
              when you TRAIN (`advanceSequence`), so reading it would mean the
              nudge arrives after the thing it was nudging you towards. A reminder
              has to fire on a day you have NOT trained yet, which is a fact about
              the week and not about the queue. */}
          <WorkoutReminder />

          {/* ----------------------------------------------------------
              BODY — one number, and it is opt-in.

              This is what makes bodyweight and assisted work COUNTABLE, and it is
              the only thing it does. A +40 kg dip moves a body plus forty; a
              −20 kg assisted pull-up moves a body minus twenty; a push-up moves a
              body. Without this number the app cannot weigh any of them, so it
              leaves them out of session volume and drops the volume figure from
              the history line rather than printing one that undercounts.

              It is NOT a weigh-in log, a target, or a chart. There is one value,
              it is the current one, and nothing tracks it over time — that is a
              different app, and this one has no opinion about anybody's weight.
              Nudged by the app's own coarse weight step (2 kg / 5 lb) because
              bodyweight to the nearest couple of kilos is all volume needs, and
              because a once-ever setting nudged in half-kilos is forty taps. */}
          <Kicker className="mx-lg mb-sm mt-xxl">{t('Body')}</Kicker>
          <ListCard className="mx-lg">
            <StepperRow
              label={t('Bodyweight')}
              hint={t('What makes push-ups, dips and assisted work countable')}
              value={
                settings.bodyweightKg == null
                  ? t('Not set')
                  : `${formatWeight(settings.bodyweightKg, settings.unitSystem)} ${unitLabel(settings.unitSystem, lang)}`
              }
              onDecrease={() => bumpBodyweight(-1)}
              onIncrease={() => bumpBodyweight(1)}
            />
            {settings.bodyweightKg != null ? (
              <>
                <Separator />
                <TextButton
                  label={t('Clear my bodyweight')}
                  onPress={() => {
                    tap();
                    settings.setBodyweightKg(undefined);
                  }}
                />
              </>
            ) : null}
          </ListCard>
          <Text className="mx-lg mt-sm text-label text-ink-faint">
            {settings.bodyweightKg == null
              ? t(
                  'Until this is set, a session of push-ups or dips reports no volume — the app will not guess what your body weighs. Nothing else reads it.',
                )
              : t(
                  'Read only when working out session volume. It is not logged, charted or compared to anything.',
                )}
          </Text>

          {/* ----------------------------------------------------------
              PLATES — what is on the rack behind you.

              A fact about the GYM, not about any one lift, which is why the bar
              weight lives on the exercise instead. Read in exactly one place: the
              `20 + 2×10 + 2×2.5` line under the weight cell of an exercise that
              declares a bar, so switching a size off here removes it from every
              breakdown the app draws. It informs and never rounds — a target these
              plates cannot make shows no line at all rather than the nearest
              loadable weight. */}
          {/* WHERE YOU ARE TRAINING. One row of chips, and it only appears once
              there is more than one gym — a lifter with a single rack should not
              have to know this feature exists. Switching changes which plate list
              every barbell breakdown is drawn from, live. */}
          {settings.gyms.length > 1 ? (
            <>
              <Kicker tone="green" className="mx-lg mb-sm mt-xxl">
                {t('Gym')} · {settings.gyms.find((g) => g.id === settings.activeGymId)?.name ?? ''}
              </Kicker>
              <View className="mx-lg flex-row flex-wrap">
                {settings.gyms.map((gym) => (
                  <SelectChip
                    key={gym.id}
                    label={t(gym.name)}
                    selected={gym.id === settings.activeGymId}
                    onPress={() => {
                      tap();
                      settings.setActiveGym(gym.id);
                    }}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Kicker className="mx-lg mb-sm mt-xxl">
            {settings.gyms.length > 1 ? t('Plates · this gym') : t('Plates')}
          </Kicker>
          <View className="mx-lg flex-row flex-wrap">
            {PLATE_SIZES_KG.map((plate) => (
              <SelectChip
                key={plate}
                label={String(plate)}
                selected={activePlates.includes(plate)}
                onPress={() => {
                  tap();
                  settings.togglePlate(plate);
                }}
              />
            ))}
          </View>
          <Text className="mx-lg text-label text-ink-faint">
            {settings.gyms.length > 1
              ? t(
                  'Which plates this gym has, in kilograms. Only used to work out what goes on the bar; it never changes a weight you have typed.',
                )
              : t(
                  'Which plates your gym has, in kilograms. Only used to work out what goes on the bar; it never changes a weight you have typed.',
                )}
          </Text>

          {/* ADDING A SECOND GYM is what makes the switcher appear. Seeded from
              the plates you already have, because a second rack is nearly always
              the same one minus the heavy plates. */}
          <ListCard className="mx-lg mt-lg">
            {settings.gyms.map((gym, index) => (
              <View key={gym.id}>
                {index > 0 ? <Separator inset={0} /> : null}
                <SettingRow
                  label={t(gym.name)}
                  value={t('{count} sizes', { count: gym.platesKg.length })}
                  valueTone="faint"
                  onPress={
                    settings.gyms.length > 1
                      ? () => {
                          tap();
                          settings.setActiveGym(gym.id);
                          setEditingGymId(gym.id === editingGymId ? null : gym.id);
                        }
                      : undefined
                  }
                />
              </View>
            ))}
            {gymBeingEdited && settings.gyms.length > 1 ? (
              <>
                <Separator inset={0} />
                <TextButton
                  label={t('Remove {name}', { name: gymBeingEdited.name })}
                  onPress={() => {
                    tap();
                    settings.removeGym(gymBeingEdited.id);
                    setEditingGymId(null);
                  }}
                />
              </>
            ) : null}
            {settings.gyms.length < MAX_GYMS ? (
              <>
                <Separator inset={0} />
                <TextButton
                  label={t('Add another gym')}
                  tone="green"
                  onPress={() => {
                    tap();
                    settings.addGym(t('Gym {n}', { n: settings.gyms.length + 1 }));
                  }}
                />
              </>
            ) : null}
          </ListCard>
          <Text className="mx-lg mt-sm text-label text-ink-faint">
            {t(
              'A gym is a name and the plates on its rack — nothing else. Tap one to make it the current gym; the chips above then edit that gym’s plates.',
            )}
          </Text>

          {/* ----------------------------------------------------------
              WEEKLY SETS PER MUSCLE GROUP — targets, and every one optional.

              `lib/balance.ts` counts sets per cluster and refuses to score them:
              "a count, not a score". That refusal is right about somebody else's
              model of your recovery, and it is the reason there is no MEV/MRV
              band imported from a textbook here. It is not right about a number
              YOU chose — a target you typed is a fact about your plan, and
              comparing this week against it is arithmetic you would otherwise do
              in your head.

              So: nothing is set by default, `—` means no opinion, and where a
              target exists the training history's row reads `14 / 16` and its bar
              measures against it instead of against the busiest cluster. Nothing
              turns red, nothing warns, and going over is not an error. */}
          <Kicker className="mx-lg mb-sm mt-xxl">{t('Weekly sets')}</Kicker>
          <ListCard className="mx-lg">
            {CLUSTER_ROWS.map((cluster, index) => {
              const target = settings.weeklySetTargets[cluster];
              return (
                <View key={cluster}>
                  {index > 0 ? <Separator /> : null}
                  <StepperRow
                    label={clusterLabel(cluster, lang)}
                    value={target == null ? '—' : t('{count} sets', { count: target })}
                    onDecrease={() => {
                      tap();
                      /*
                       * Stepping below zero CLEARS the target rather than pinning
                       * it at 0, which is how the control is switched off without a
                       * second affordance. Zero itself is a real answer — "I am not
                       * training legs this block" — so it is one step above off.
                       */
                      if (target == null) return;
                      settings.setWeeklyTarget(cluster, target <= 0 ? undefined : target - 1);
                    }}
                    onIncrease={() => {
                      tap();
                      // The first tap on `+` starts at a number rather than at 1:
                      // nobody's weekly target for a muscle group is one set, and
                      // ten taps to reach a plausible one is a control nobody uses.
                      settings.setWeeklyTarget(cluster, target == null ? 12 : target + 1);
                    }}
                  />
                </View>
              );
            })}
          </ListCard>
          <Text className="mx-lg mt-sm text-label text-ink-faint">
            {t(
              'Optional. Set one and the training history compares this window against it; leave it at “—” and the counts stay counts.',
            )}
          </Text>

          {/* ---------------------------------------------------------- */}
          <Kicker className="mx-lg mb-sm mt-xxl">{t('Units')}</Kicker>
          <View className="mx-lg">
            <Segmented
              options={unitOptions(t)}
              value={settings.unitSystem}
              onChange={settings.setUnitSystem}
              accessibilityLabel={t('Weight units')}
            />
            <Text className="mt-sm text-label text-ink-faint">
              {t(
                'Display only. Every set is stored in kilograms, so switching can never change what your history says you lifted.',
              )}
            </Text>
          </View>

          {/* ----------------------------------------------------------
              WHAT IS ACTUALLY ON DISK, stated as a fact.

              The log lives in SQLite (`historyDb.ts`) and the app holds a copy of
              it in memory. Those two can disagree in exactly one direction — a read
              that failed leaves the copy empty while the file is untouched — and
              when they do, every screen shows an empty history and it looks
              precisely like a year of training being deleted. One line here is the
              difference between that and knowing better: it counts the rows in the
              file, not the array on screen, and it says so when the two do not
              match.

              The BACKUP rows are not here any more. A backup is not a training
              setting — it carries the tasks and the money too — so it lives once,
              in the general section, beside the one export and the one import.
              See `screens/SettingsHomeScreen.tsx`. */}
          <View className="mx-lg mt-xxl overflow-hidden rounded-surface border border-hairline bg-surface">
            <SettingRow
              label={t('Workouts on disk')}
              value={
                onDisk == null
                  ? t('Cannot read the log')
                  : onDisk === workoutCount
                    ? `${onDisk}`
                    : t('{onDisk} on disk · {loaded} loaded', { onDisk, loaded: workoutCount })
              }
              valueTone={onDisk == null || onDisk !== workoutCount ? 'muted' : 'faint'}
            />
            {/*
              HEALTH CONNECT — the one thing this app sends anywhere.

              Off until it is switched on, and switching it on asks for the
              permission then and there rather than at launch or at `Finish`: a
              dialog in front of somebody who has just finished a workout is the app
              interrupting the one moment it should get out of the way.

              The row says WHAT LEAVES, because that is the only question worth
              answering here — a session's start, end and name, and nothing else.
              There is no per-set record type in Health Connect, so exporting the
              sets is not something this could do even if it wanted to.
            */}
            {healthConnect !== 'unavailable' ? (
              <>
                <Separator inset={0} />
                <SettingRow
                  label={t('Share workouts with Health Connect')}
                  value={
                    !settings.shareToHealthConnect
                      ? t('Off')
                      : healthConnect === 'ready'
                        ? t('On · start, end and name')
                        : t('Needs permission')
                  }
                  valueTone={
                    settings.shareToHealthConnect && healthConnect !== 'ready' ? 'muted' : 'faint'
                  }
                  onPress={() => void toggleHealthConnect()}
                />
              </>
            ) : null}
            {/* Last, and only when there is something to lose. One workout at a
                time is deleted from the history screen; this is the whole log. */}
            {workoutCount > 0 ? (
              <>
                <Separator inset={0} />
                <TextButton
                  label={t('Delete all workout history')}
                  onPress={() => setConfirming('history')}
                />
              </>
            ) : null}
          </View>

          {notice ? <Text className="mx-lg mt-md text-label text-ink-muted">{notice}</Text> : null}

          <Text className="mx-lg mt-md text-label text-ink-faint">
            {t(
              'Everything on this screen is about training. The daily tasks and the expenses have settings screens of their own, and the backup that carries all three is one row in the general section.',
            )}
          </Text>
        </ScrollView>
      </View>

      {confirming === 'history' ? (
        <ConfirmSheet
          title={t('Delete all workout history?')}
          body={t(
            'All {count} finished {workouts} go, and so do the sets in them — which is what the prefills and the overload suggestions read. This cannot be undone.',
            {
              count: workoutCount,
              // `few` is a Russian-only form, so it is the Russian word — the
              // same shape the streak rows already use.
              workouts: countedWorkouts(workoutCount, {
                one: t('workout'),
                few: 'тренировки',
                many: t('workouts'),
              }),
            },
          )}
          confirmLabel={t('Delete everything')}
          cancelLabel={t('Keep my history')}
          onConfirm={() => {
            clearHistory();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * "You rest 2:38 between sets" — and one tap to make that the setting.
 *
 * Measured by the rest timer itself: the store has always known when a rest began
 * and when the next ✓ landed, and `SetHistory.restTakenSeconds` has always had a
 * field for it. `restMedians` is the median rather than the mean, so one workout
 * interrupted by a phone call does not move it.
 *
 * FOUR THINGS IT DOES NOT DO, and each of them is why it can be trusted:
 *
 *  • It does not appear without the data. Below `MIN_REST_SAMPLES` recorded rests
 *    the median swings on one interruption, and a suggestion that changes every
 *    workout is one nobody trusts twice.
 *  • It does not appear when it agrees with the setting, or agrees within one nudge
 *    of the ± chips. A row whose tap would change nothing is a row that trains
 *    people to ignore rows.
 *  • It does not nag. One line, `ink-muted`, no icon, no dot, and it disappears the
 *    moment the setting matches — there is no dismissing it because there is
 *    nothing to dismiss.
 *  • It does not judge. "You rest 2:38" is a measurement of what happened, not a
 *    comparison with what should have. Resting longer than you planned is not a
 *    failure, it is information about the plan.
 */
function MeasuredRestRow({
  measuredSeconds,
  settingSeconds,
  what,
  onAdopt,
}: {
  measuredSeconds: number | null;
  settingSeconds: number;
  /** "between sets" / "between exercises" — the tail of the sentence. */
  what: string;
  onAdopt: () => void;
}) {
  const t = useT();

  if (measuredSeconds == null) return null;
  // Within one nudge of the chips is agreement. See the note above.
  if (Math.abs(measuredSeconds - settingSeconds) < SETTING_LIMITS.restSecondsBetweenSets.step) {
    return null;
  }

  return (
    <Pressable
      onPress={() => {
        commit();
        onAdopt();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('You rest {clock} {what}. Use that as the setting.', {
        clock: formatClock(measuredSeconds),
        what,
      })}
      style={pressedStyle}
      className="min-h-[44px] flex-row items-center px-lg pb-md"
    >
      <Text className="flex-1 pr-md text-label tabular-nums text-ink-muted">
        {t('You rest {clock} {what}.', { clock: formatClock(measuredSeconds), what })}
      </Text>
      <Text className="text-label font-semibold text-green-bright">{t('Use it')}</Text>
    </Pressable>
  );
}

/**
 * Plays the two tones a real countdown uses — three ticks, then the long one — so
 * what you hear here is exactly what you'll hear at 0:03 of a rest.
 *
 * Driven by timeouts rather than by the real hook because there is no countdown
 * to attach to; this is the one place in the app where a cue is faked, and it is
 * faked from the same two sounds so it cannot mislead.
 */
function TestBeepRow() {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  /*
   * The three pending tones, so leaving Settings mid-sequence takes them with it.
   * They used to be collected into a `const timers` that was immediately thrown
   * away with `void timers` under a comment saying there was nothing to clean up
   * — which left the last one to fire `countFinal()` and set state on a screen
   * the user had already walked away from, two seconds after they left.
   */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  const play = () => {
    if (playing) return;
    setPlaying(true);
    countTick();
    timers.current = [
      setTimeout(() => countTick(), 700),
      setTimeout(() => countTick(), 1400),
      setTimeout(() => {
        countFinal();
        setPlaying(false);
      }, 2100),
    ];
  };

  return (
    <Pressable
      onPress={play}
      accessibilityRole="button"
      accessibilityLabel={t('Test the countdown beep')}
      style={pressedStyle}
      className="h-row flex-row items-center px-lg"
    >
      <Text className="flex-1 text-body font-medium text-ink">{t('Test the beep')}</Text>
      <Text className="mr-md text-label text-ink-faint">
        {playing ? t('counting…') : t('3 · 2 · 1 · go')}
      </Text>
      <Icon name="play" size={16} color={palette.greenBright} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */

/**
 * "Remind me to train" — a switch, the days, and the wheel.
 *
 * Its own component rather than another block inside a 900-line screen, because
 * it owns three things nothing else here does: a permission it has to ask about,
 * a set of days, and a picker that is 220px tall when it is open.
 *
 * ── IT STATES WHEN NOTHING WILL COME OF IT ────────────────────────────────
 *
 * The worst state this feature has is a switch that is ON behind a notification
 * permission the user denied at install: every control looks right, the schedule
 * is armed, and nothing ever arrives. Nothing in the app can fix that — the
 * permission is the phone's, not ours — so the honest thing is to say so, here,
 * where the switch is. Checked when the section mounts rather than subscribed,
 * because a permission changes in Settings and coming back to this screen is
 * what re-mounts it.
 *
 * ── THE WHEEL IS FOLDED AWAY ──────────────────────────────────────────────
 *
 * Under the switch, and only while the switch is on. A 24-hour picker sitting
 * open under an off switch is 220px of a control that does nothing, in a screen
 * that is already long.
 */
function WorkoutReminder() {
  const t = useT();
  const lang = useLanguage();
  const enabled = useSettings((s) => s.workoutReminderEnabled);
  const days = useSettings((s) => s.workoutReminderDays);
  const time = useSettings((s) => s.workoutReminderTime);
  const setEnabled = useSettings((s) => s.setWorkoutReminderEnabled);
  const toggleDay = useSettings((s) => s.toggleWorkoutReminderDay);
  const setTime = useSettings((s) => s.setWorkoutReminderTime);

  /** Null while it is still being asked. Nothing is said until there is an answer. */
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void notificationsGranted().then((ok) => {
      if (alive) setGranted(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const at = parseClockTime(time) ?? { hour: 18, minute: 0 };

  return (
    <>
      <Kicker className="mx-lg mb-sm mt-xxl">{t('Workout reminder')}</Kicker>
      <ListCard className="mx-lg">
        <SwitchRow
          label={t('Remind me to train')}
          hint={t('A notification at the time you set, on the days you picked.')}
          value={enabled}
          onChange={setEnabled}
        />
      </ListCard>

      {enabled ? (
        <>
          <Kicker className="mx-lg mb-sm mt-lg">{t('On which days')}</Kicker>
          <View className="mx-lg flex-row flex-wrap">
            {weekdayLabels(lang).map((label, index) => {
              const weekday = index as Weekday;
              return (
                <SelectChip
                  key={label + index}
                  label={label}
                  selected={days.includes(weekday)}
                  onPress={() => {
                    tap();
                    toggleDay(weekday);
                  }}
                />
              );
            })}
          </View>

          <Kicker className="mx-lg mb-sm mt-lg">{t('At what time')}</Kicker>
          <View className="mx-lg">
            <TimeWheel hour={at.hour} minute={at.minute} onChange={setTime} />
          </View>
        </>
      ) : null}

      {enabled && granted === false ? (
        <Text className="mx-lg mt-md text-label text-ink-faint">
          {t('Notifications are switched off for this app, so nothing will arrive.')}
        </Text>
      ) : null}
    </>
  );
}
