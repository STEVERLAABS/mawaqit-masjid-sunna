/* =========================================================
 * واجهة الهاتف — مواقيت الصلاة لمسجد السنة، المحمدية
 * الحساب محلي داخل المتصفح بمكتبة adhan
 * ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  if (typeof adhan === 'undefined' || typeof SITE_CONFIG === 'undefined') {
    document.body.innerHTML =
      '<main style="padding:3rem 1.5rem;text-align:center;font-family:system-ui;color:#fbf8ed;background:#08271d;min-height:100vh">' +
      '<h1>تعذّر تحميل مواقيت الصلاة</h1><p>تحقق من ملفات الموقع ثم أعد المحاولة.</p></main>';
    return;
  }

  const TZ = SITE_CONFIG.timeZone;
  const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const ADHAN_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const DAY_MS = 86400000;

  const timeFmt = new Intl.DateTimeFormat('fr-DZ', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ
  });
  const timeFmtSec = new Intl.DateTimeFormat('fr-DZ', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TZ
  });
  const gregFmt = new Intl.DateTimeFormat('ar-DZ', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ
  });
  const hijriFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ
  });
  const monthFmt = new Intl.DateTimeFormat('ar-DZ', {
    month: 'long', year: 'numeric', timeZone: TZ
  });
  const weekdayFmt = new Intl.DateTimeFormat('ar-DZ', {
    weekday: 'long', timeZone: TZ
  });
  const dayNumFmt = new Intl.DateTimeFormat('ar-DZ', {
    day: 'numeric', month: 'numeric', timeZone: TZ
  });
  const clockPartsFmt = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: TZ
  });
  const hijriNumFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
    day: 'numeric', month: 'numeric', year: 'numeric', timeZone: TZ
  });

  let todayTimes = null;
  let todayDateKey = '';
  let viewMonth = new Date();
  let toastTimer = null;
  let adhanAudio = null;
  let lastFiredInstance = '';
  let lastRemindedInstance = '';

  function partsFor(date) {
    return clockPartsFmt.formatToParts(date).reduce(function (acc, part) {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
  }

  function dateKey(date) {
    const p = partsFor(date);
    return p.year + '-' + p.month + '-' + p.day;
  }

  function hijriParts(date) {
    const parts = hijriNumFmt.formatToParts(date);
    const get = function (type) {
      const part = parts.find(function (item) { return item.type === type; });
      return part ? parseInt(part.value, 10) : 0;
    };
    return { day: get('day'), month: get('month'), year: get('year') };
  }

  function fmt(date) {
    return timeFmt.format(date);
  }

  function atTime(base, hours, minutes) {
    const p = partsFor(base);
    return new Date(
      p.year + '-' + p.month + '-' + p.day + 'T' +
      String(hours).padStart(2, '0') + ':' +
      String(minutes).padStart(2, '0') + ':00+01:00'
    );
  }

  function calculationParameters() {
    const method = adhan.CalculationMethod[SITE_CONFIG.calculationMethod];
    const params = method ? method() : adhan.CalculationMethod.MuslimWorldLeague();
    params.madhab = SITE_CONFIG.madhab === 'hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
    return params;
  }

  function timesFor(date) {
    const coords = new adhan.Coordinates(SITE_CONFIG.latitude, SITE_CONFIG.longitude);
    const t = new adhan.PrayerTimes(coords, date, calculationParameters());
    return {
      fajr: t.fajr,
      sunrise: t.sunrise,
      dhuhr: t.dhuhr,
      asr: t.asr,
      maghrib: t.maghrib,
      isha: t.isha
    };
  }

  function isFriday(date) {
    return weekdayFmt.format(date) === 'الجمعة';
  }

  function jumuaTime(date) {
    if (!SITE_CONFIG.jumua || !SITE_CONFIG.jumua.time) return null;
    const parts = SITE_CONFIG.jumua.time.split(':');
    return atTime(date, parseInt(parts[0], 10), parseInt(parts[1], 10));
  }

  function timeForDisplay(key, date, times) {
    if (key === 'dhuhr' && isFriday(date) && SITE_CONFIG.jumua) {
      return SITE_CONFIG.jumua.time;
    }
    return fmt(times[key]);
  }

  function renderHeader() {
    const now = new Date();
    $('header-clock').textContent = timeFmt.format(now);
    $('date-hijri').textContent = hijriFmt.format(now) + ' هـ';
    $('date-gregorian').textContent = gregFmt.format(now);
  }

  function renderToday() {
    const now = new Date();
    todayDateKey = dateKey(now);
    todayTimes = timesFor(now);

    const grid = $('times-grid');
    grid.innerHTML = '';
    PRAYER_KEYS.forEach(function (key) {
      const card = document.createElement('article');
      card.className = 'prayer-card';
      card.id = 'card-' + key;
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', SITE_CONFIG.prayerNames[key] + '، ' + timeForDisplay(key, now, todayTimes));
      card.innerHTML =
        '<span class="prayer-icon" aria-hidden="true">' + SITE_CONFIG.prayerIcons[key] + '</span>' +
        '<span class="prayer-name">' + SITE_CONFIG.prayerNames[key] + '</span>' +
        '<strong class="prayer-time">' + timeForDisplay(key, now, todayTimes) + '</strong>';
      grid.appendChild(card);
    });

    const jumuaNote = $('jumua-note');
    jumuaNote.textContent = SITE_CONFIG.jumua && SITE_CONFIG.jumua.note
      ? '🕌 ' + SITE_CONFIG.jumua.note
      : '';
    jumuaNote.hidden = !jumuaNote.textContent;

    renderSunnahTimes(now);
    updateRamadan(now);
  }

  function renderSunnahTimes(now) {
    const row = $('sunnah-row');
    try {
      const coords = new adhan.Coordinates(SITE_CONFIG.latitude, SITE_CONFIG.longitude);
      const prayerTimes = new adhan.PrayerTimes(coords, now, calculationParameters());
      const sunnah = new adhan.SunnahTimes(prayerTimes);
      row.innerHTML =
        '<div class="sunnah-chip"><span>منتصف الليل</span><strong>' + fmt(sunnah.middleOfTheNight) + '</strong></div>' +
        '<div class="sunnah-chip"><span>الثلث الأخير</span><strong>' + fmt(sunnah.lastThirdOfTheNight) + '</strong></div>' +
        '<div class="sunnah-chip qiyam-chip"><span>وقت القيام الأفضل</span><strong>من ' +
        fmt(sunnah.lastThirdOfTheNight) + ' حتى ' + fmt(todayTimes.fajr) + '</strong></div>';
    } catch (error) {
      row.innerHTML = '<p class="sunnah-chip">تعذّر حساب أوقات قيام الليل الآن.</p>';
    }
  }

  function nextPrayerInfo(now) {
    const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    for (let i = 0; i < order.length; i += 1) {
      const key = order[i];
      let time = todayTimes[key];
      let name = SITE_CONFIG.prayerNames[key];

      if (key === 'dhuhr' && isFriday(now)) {
        const fridayTime = jumuaTime(now);
        if (fridayTime) {
          time = fridayTime;
          name = 'الجمعة';
        }
      }

      if (time > now) return { key: key, name: name, time: time, isTomorrow: false };
    }

    const tomorrow = new Date(now.getTime() + DAY_MS);
    const tomorrowTimes = timesFor(tomorrow);
    return {
      key: 'fajr',
      name: SITE_CONFIG.prayerNames.fajr,
      time: tomorrowTimes.fajr,
      isTomorrow: true
    };
  }

  function effectivePrayerTimes(now) {
    const result = Object.assign({}, todayTimes);
    if (isFriday(now)) {
      const fridayTime = jumuaTime(now);
      if (fridayTime) result.dhuhr = fridayTime;
    }
    return result;
  }

  function markCurrentAndNext(now, next) {
    document.querySelectorAll('.prayer-card').forEach(function (card) {
      card.classList.remove('current', 'next-flash');
    });

    const nextCard = $('card-' + next.key);
    if (nextCard) nextCard.classList.add('next-flash');

    const effective = effectivePrayerTimes(now);
    const reverse = ['isha', 'maghrib', 'asr', 'dhuhr', 'sunrise', 'fajr'];
    for (let i = 0; i < reverse.length; i += 1) {
      const key = reverse[i];
      if (effective[key] <= now) {
        const currentCard = $('card-' + key);
        if (currentCard) currentCard.classList.add('current');
        break;
      }
    }
  }

  function updateRamadan(now) {
    const chip = $('ramadan-chip');
    const h = hijriParts(now);
    if (h.month === 9) {
      chip.textContent = '🌙 رمضان مبارك — اليوم ' + h.day + ' من رمضان ' + h.year + ' هـ';
      chip.hidden = false;
    } else {
      chip.hidden = true;
    }
  }

  function updateLive() {
    const now = new Date();
    if (dateKey(now) !== todayDateKey) {
      renderHeader();
      renderToday();
      renderCalendar();
    } else {
      $('header-clock').textContent = timeFmt.format(now);
      updateRamadan(now);
    }

    const next = nextPrayerInfo(now);
    const difference = Math.max(0, next.time.getTime() - now.getTime());
    const hours = Math.floor(difference / 3600000);
    const minutes = Math.floor((difference % 3600000) / 60000);
    const seconds = Math.floor((difference % 60000) / 1000);

    $('next-prayer-name').textContent = next.name + (next.isTomorrow ? ' (غداً)' : '');
    $('next-prayer-time').textContent = fmt(next.time);
    $('countdown').textContent =
      String(hours).padStart(2, '0') + ':' +
      String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0');

    markCurrentAndNext(now, next);
    checkAdhan(now);
  }

  function renderCalendar() {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const now = new Date();
    const nowKey = dateKey(now);

    $('month-label').textContent = monthFmt.format(new Date(year, month, 1, 12));
    $('table-head').innerHTML =
      '<tr><th scope="col">التاريخ</th><th scope="col">اليوم</th>' +
      PRAYER_KEYS.map(function (key) {
        return '<th scope="col">' + SITE_CONFIG.prayerNames[key] + '</th>';
      }).join('') + '</tr>';

    const body = $('table-body');
    body.innerHTML = '';
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day, 12);
      const times = timesFor(date);
      const row = document.createElement('tr');
      if (dateKey(date) === nowKey) row.className = 'today';
      row.setAttribute('data-date', date.toISOString());
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', 'نسخ مواقيت ' + weekdayFmt.format(date) + '، ' + dayNumFmt.format(date));
      row.innerHTML =
        '<td class="day-col">' + dayNumFmt.format(date) + '</td>' +
        '<td>' + weekdayFmt.format(date) + '</td>' +
        PRAYER_KEYS.map(function (key) {
          return '<td>' + timeForDisplay(key, date, times) + '</td>';
        }).join('');
      body.appendChild(row);
    }
  }

  function copyToClipboard(value) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value);
    }
    return new Promise(function (resolve, reject) {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (error) {
        reject(error);
      }
      document.body.removeChild(input);
    });
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2400);
  }

  function isAdhanUnlocked() {
    try {
      return localStorage.getItem('adhan-unlocked') === '1';
    } catch (error) {
      return false;
    }
  }

  function refreshSoundUi() {
    const button = $('enable-sound');
    const hint = $('sound-hint');
    if (isAdhanUnlocked()) {
      button.hidden = true;
      hint.textContent = 'الأذان مفعّل لهذا الجهاز';
    } else {
      button.hidden = false;
      hint.textContent = 'فعّله مرة واحدة لسماع الأذان';
    }
  }

  function initAdhanAudio() {
    if (adhanAudio || !(window.Audio || window.webkitAudio)) return;
    adhanAudio = new Audio(SITE_CONFIG.adhan.file);
    adhanAudio.volume = typeof SITE_CONFIG.adhan.volume === 'number' ? SITE_CONFIG.adhan.volume : 0.9;
    adhanAudio.addEventListener('ended', hideAdhanBanner);
    adhanAudio.addEventListener('error', hideAdhanBanner);
  }

  function unlockAdhan() {
    initAdhanAudio();
    if (!adhanAudio) {
      showToast('المتصفح لا يدعم تشغيل الصوت.');
      return;
    }

    const play = adhanAudio.play();
    if (!play || !play.then) {
      showToast('تعذّر تفعيل الصوت، أعد المحاولة.');
      return;
    }

    play.then(function () {
      adhanAudio.pause();
      adhanAudio.currentTime = 0;
      try { localStorage.setItem('adhan-unlocked', '1'); } catch (error) {}
      refreshSoundUi();
      showToast('تم تفعيل صوت الأذان.');
    }).catch(function () {
      showToast('تعذّر تفعيل الصوت، أعد المحاولة.');
    });
  }

  function showAdhanBanner(message) {
    $('adhan-banner-text').textContent = message;
    $('adhan-banner').hidden = false;
  }

  function hideAdhanBanner() {
    $('adhan-banner').hidden = true;
  }

  function fireAdhan(prayerName) {
    showAdhanBanner('🕌 حان الآن وقت صلاة ' + prayerName + ' — الله أكبر');
    const play = adhanAudio.play();
    if (play && play.catch) {
      play.catch(function () {
        try { localStorage.removeItem('adhan-unlocked'); } catch (error) {}
        refreshSoundUi();
      });
    }
  }

  function speakTakbir() {
    if (!window.speechSynthesis) return false;
    try {
      const utterance = new SpeechSynthesisUtterance('الله أكبر');
      utterance.lang = 'ar';
      utterance.rate = 0.8;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      return false;
    }
  }

  function checkTakbirReminder(now) {
    if (!SITE_CONFIG.takbir || !SITE_CONFIG.takbir.enabled || !todayTimes) return;
    const effective = effectivePrayerTimes(now);
    const beforeMs = (SITE_CONFIG.takbir.beforeMinutes || 5) * 60000;

    for (let i = 0; i < ADHAN_PRAYERS.length; i += 1) {
      const key = ADHAN_PRAYERS[i];
      const difference = now.getTime() - (effective[key].getTime() - beforeMs);
      const instance = dateKey(now) + '|reminder|' + key;
      if (difference >= 0 && difference < 30000 && lastRemindedInstance !== instance) {
        lastRemindedInstance = instance;
        const spoken = speakTakbir();
        showAdhanBanner(
          '⏳ بعد ' + SITE_CONFIG.takbir.beforeMinutes + ' دقائق: صلاة ' +
          SITE_CONFIG.prayerNames[key] + (spoken ? ' — الله أكبر' : '')
        );
        setTimeout(function () {
          if (!$('adhan-banner').hidden && adhanAudio && adhanAudio.paused) hideAdhanBanner();
        }, 40000);
        return;
      }
    }
  }

  function checkAdhan(now) {
    if (!isAdhanUnlocked() || !todayTimes) return;
    initAdhanAudio();
    if (!adhanAudio) return;

    checkTakbirReminder(now);
    const effective = effectivePrayerTimes(now);
    for (let i = 0; i < ADHAN_PRAYERS.length; i += 1) {
      const key = ADHAN_PRAYERS[i];
      const difference = now.getTime() - effective[key].getTime();
      const instance = dateKey(now) + '|adhan|' + key;
      if (difference >= 0 && difference < 30000 && lastFiredInstance !== instance) {
        lastFiredInstance = instance;
        fireAdhan(SITE_CONFIG.prayerNames[key]);
        return;
      }
    }
  }

  const ADHKAR_STORAGE_KEY = 'mawaqit-adhkar-counts';
  let adhkarCounts = {};

  function loadAdhkarCounts() {
    try {
      const saved = JSON.parse(localStorage.getItem(ADHKAR_STORAGE_KEY));
      if (saved && typeof saved === 'object') adhkarCounts = saved;
    } catch (error) {}
  }

  function saveAdhkarCounts() {
    try { localStorage.setItem(ADHKAR_STORAGE_KEY, JSON.stringify(adhkarCounts)); } catch (error) {}
  }

  function renderAdhkarPanel(key) {
    const panel = $('adhkar-panel');
    panel.innerHTML = '';
    document.querySelectorAll('#adhkar-tabs .tab-btn').forEach(function (button) {
      const selected = button.getAttribute('data-panel') === key;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });

    (ADHKAR[key] || []).forEach(function (dhikr, index) {
      const id = key + '-' + index;
      const count = Math.min(adhkarCounts[id] || 0, dhikr.count);
      const complete = count >= dhikr.count;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'dhikr-card' + (complete ? ' done' : '');
      card.setAttribute('aria-label', dhikr.text + '، ' + count + ' من ' + dhikr.count);
      card.innerHTML =
        '<p class="dhikr-text">' + dhikr.text + '</p>' +
        (dhikr.note ? '<span class="dhikr-note">' + dhikr.note + '</span>' : '') +
        '<span class="dhikr-badge">' + (complete ? '✓ ' : '') + count + ' / ' + dhikr.count + '</span>';
      card.addEventListener('click', function () {
        if (count < dhikr.count) {
          adhkarCounts[id] = count + 1;
          saveAdhkarCounts();
          renderAdhkarPanel(key);
        }
      });
      panel.appendChild(card);
    });
  }

  function setupCalendar() {
    $('prev-month').addEventListener('click', function () {
      viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
      renderCalendar();
    });

    $('next-month').addEventListener('click', function () {
      viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
      renderCalendar();
    });

    function copyCalendarRow(row) {
      const text = Array.from(row.cells).map(function (cell) {
        return cell.textContent.trim();
      }).join(' — ');
      copyToClipboard(text).then(function () {
        showToast('تم نسخ أوقات اليوم.');
      }).catch(function () {
        showToast('تعذّر نسخ الأوقات.');
      });
    }

    $('prayer-table').addEventListener('click', function (event) {
      const row = event.target.closest('tr[data-date]');
      if (row) copyCalendarRow(row);
    });

    $('prayer-table').addEventListener('keydown', function (event) {
      const row = event.target.closest('tr[data-date]');
      if (!row || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      copyCalendarRow(row);
    });
  }

  function setupAdhkar() {
    document.querySelectorAll('#adhkar-tabs .tab-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        renderAdhkarPanel(button.getAttribute('data-panel'));
      });
    });
  }

  function updateNavigation() {
    const ids = ['today', 'prayers', 'calendar', 'adhkar'];
    let current = 'today';
    ids.forEach(function (id) {
      const section = $(id);
      if (section && section.getBoundingClientRect().top <= 150) current = id;
    });
    document.querySelectorAll('.nav-item').forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('data-nav') === current);
    });
  }

  function setupNavigation() {
    let queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function () {
        updateNavigation();
        queued = false;
      });
    }, { passive: true });

    document.querySelectorAll('.nav-item').forEach(function (link) {
      link.addEventListener('click', function () {
        const selected = link.getAttribute('data-nav');
        document.querySelectorAll('.nav-item').forEach(function (item) {
          item.classList.toggle('active', item.getAttribute('data-nav') === selected);
        });
      });
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  function init() {
    renderHeader();
    renderToday();
    renderCalendar();
    loadAdhkarCounts();
    renderAdhkarPanel('morning');
    refreshSoundUi();
    setupCalendar();
    setupAdhkar();
    setupNavigation();
    updateLive();

    $('enable-sound').addEventListener('click', unlockAdhan);
    $('stop-adhan').addEventListener('click', function () {
      if (adhanAudio) {
        adhanAudio.pause();
        adhanAudio.currentTime = 0;
      }
      hideAdhanBanner();
    });

    setInterval(updateLive, 1000);
    registerServiceWorker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
