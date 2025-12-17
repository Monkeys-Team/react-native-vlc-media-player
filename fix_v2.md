# fix_v2.md — VLC Player Stabilite / Donma / Crash / Leak Araştırması (v2)

Bu rapor, projedeki React Native VLC player’ın (tvOS: **TVVLCKit**, iOS: **MobileVLCKit**, Android: **libVLC**) stabilite sorunlarını (donma, crash, memory leak, performans) **kod değişikliği yapmadan** tespit etmeyi amaçlar.

Kapsam:

- Repo içi kod incelemesi (iOS/tvOS/Android/JS)
- VideoLAN resmi kaynakları:
  - VLCKit issue’ları (özellikle teardown/crash)
  - VLCKit API dokümantasyonu (Context7)
  - VideoLAN wiki (VLC option format prensipleri)

> Not: Bu doküman “çözüm önerisi” içerir ama repo’da değişiklik **yapmaz**. Uygulama adımları ayrı onayla yapılmalıdır.

---

## 0) Executive Summary (En kritik riskler)

### tvOS / iOS (TVVLCKit / VLCKit)

1. **Teardown sırasında `stop()` asenkron → sporadik crash/freeze riski** (resmi kaynakla doğrulandı).
2. **Background/resign-active sırasında pause mantığı ters → state machine sapması / donma riski**.
3. **Media option formatı muhtemelen hatalı → caching/stream opsiyonları uygulanmıyor → buffering/donma**.
4. **Progress event flood (throttle yok) → RN bridge/JS thread kilidi → “UI dondu” hissi**.
5. **Nil event block çağrısı (audioTracks/subtitles) → özellikle buffering’de crash riski**.
6. **Yanlış RN property setter imzası (`NSInteger*`) → undefined behavior / crash riski**.
7. **Debug logging production path’inde açık → stutter/donma olasılığı**.

### Android (libVLC)

1. **`onSurfaceTextureUpdated` frame başına log → çok ciddi perf/donma**.
2. **initOptions/mediaOptions loop’unda `size()-1` → son opsiyon hiç uygulanmıyor**.

### JS (React Native)

1. **`source` objesinin mutate edilmesi → re-render’larda native setSource churn → stutter/donma**.
2. **Native audioTracks/subtitles event’leri JS’e map edilmiyor → native taraf block nil ise crash**.

---

## 1) Resmi Kaynaklardan Doğrulanan Kritik Bilgiler

### REF-01 — `stop()` her zaman asenkron (teardown race)

- **Kaynak:** VideoLAN / VLCKit Issue #376 “VLCMediaPlayer crashes sometimes by stop() and dealloc…”
- **Bulgular (özet):**
  - `stop()` **always asynchronous**.
  - Player/VC “Stopped” olmadan serbest bırakılırsa **crash** veya **UI freeze** görülebilir.
  - Öneri: teardown’ı **`VLCMediaPlayerStateStopped`** event’i ile senkronlamak.
- **Projeye etkisi:** ekran kapanışı / source değişimi / error akışında sporadik crash ve “dondu” semptomları.

### REF-02 — VLC option format prensibi: global `--` vs item-specific `:`

- **Kaynak:** VideoLAN Wiki “Documentation:Command_line” (sayfa “outdated” uyarısı taşısa da prensip yaygın/temel)
- **Bulgular (özet):**
  - Item-specific (media-specific) opsiyonlar genelde `:` ile verilir.
  - CLI/global opsiyonlar `--` ile verilir.
- **Projeye etkisi:** Media’ya uygulandığı sanılan caching/stream opsiyonları **hiç uygulanmıyor** olabilir.

---

## 2) Kod İncelemesi — iOS/tvOS (TVVLCKit)

Dosya: `ios/RCTVLCPlayer/RCTVLCPlayer.m`

> Satır numaraları referans içindir (repo anlık haline göre).

---

### IOS-01 — ResignActive sırasında pause mantığı ters (yüksek olasılıkla bug)

- **Severity:** Critical (donma/stabilite)
- **Semptom:** App background/interrupt olduğunda player state bozulabilir; beklenmedik “play” tetiklenebilir.
- **Açıklama:**
  - `applicationWillResignActive` içinde `_paused == NO` iken `setPaused:_paused` çağrılıyor.
  - Bu da `setPaused:NO` → `play()` akışına gidebilir.
- **Evidence:**
  - `applicationWillResignActive`: ~51-56
  - `setPaused`: ~69-80
- **Muhtemel etki:** state machine sapması, buffering loop, donma, audio session karmaşası.
- **Önerilen çözüm yaklaşımı:**
  - Resign-active’te deterministik şekilde pause.
  - Lifecycle kararını `_paused` yerine app state odaklı yapmak.
- **Yapılacaklar (doğrulama):**
  - Donma anındaki VLC state log’u + lifecycle log’u korele edilsin.

---

### IOS-02 — `stop()` asenkron + teardown race (sporadik crash/freeze)

- **Severity:** Critical (crash/freeze)
- **Semptom:** Ekrandan çıkışta / error’da / source değişiminde sporadik crash veya UI freeze.
- **Açıklama:**
  - `_release` içinde `stop()` sonrası `_player = nil` ile instance serbest kalabilir.
  - VLCKit Issue #376: `stop()` async → “Stopped” gelmeden objeyi bırakmak riskli.
- **Evidence:**
  - `_release`: ~400-418
  - REF-01
- **Önerilen çözüm yaklaşımı:**
  - Teardown’ı `VLCMediaPlayerStateStopped` görüldüğünde finalize etmek.
  - Re-entrant release’leri engelleyecek “stopping/tearingDown” state’i.
- **Yapılacaklar (doğrulama):**
  - Crash backtrace toplanıp stop/dealloc korelasyonu çıkarılsın.

---

### IOS-03 — Media initOptions uygulama formatı muhtemelen hatalı (opsiyonlar boşa gidiyor)

- **Severity:** High (buffering/donma)
- **Semptom:** Network caching/RTSP/HLS opsiyonları etkisiz → buffering/donma.
- **Açıklama:**
  - Kod `--` prefix’ini silip `network-caching=...` gibi “çıplak” string bırakıyor.
  - Media-specific opsiyonların tipik formatı `:network-caching=...`.
  - Böylece opsiyonların **ignore** edilme ihtimali yüksek.
- **Evidence:**
  - `setSource` option loop: ~169-171
  - `setResume` option loop: ~118-120
  - REF-02
- **Önerilen çözüm yaklaşımı:**
  - Platformlar arası option sözleşmesini netleştirmek:
    - iOS/tvOS: `VLCMedia addOption(":...")` formatı
    - Android: LibVLC init options vs Media options ayrımı
- **Yapılacaklar (doğrulama):**
  - App’in gönderdiği `initOptions` listeleri çıkarılsın.
  - Aynı stream’de caching etkisi ölçülsün (buffering süresi / stall sayısı).

---

### IOS-04 — Progress event flood (throttle yok) → RN bridge/JS thread donması

- **Severity:** High (donma/perf)
- **Semptom:** “Video akıyor ama UI donuyor” veya “tam donma” hissi.
- **Açıklama:**
  - `mediaPlayerTimeChanged` her tetiklendiğinde RN event gönderiliyor.
  - Throttle yok; uzun playback’te JS thread ve bridge’i boğabilir.
- **Evidence:**
  - `mediaPlayerTimeChanged` → `updateVideoProgress`: ~220-223, ~297-313
- **Önerilen çözüm yaklaşımı:**
  - Native tarafta progress event’lerini interval ile sınırlandırmak (örn 250–500ms).
  - JS tarafında `onProgress` içinde sık render tetikleyen `setState` pattern’lerini azaltmak.
- **Yapılacaklar (doğrulama):**
  - Instruments/Profiling: donma anında main vs JS thread CPU ölçümü.

---

### IOS-05 — `onVideoAudioTracks` / `onVideoSubtitles` block nil ise crash riski

- **Severity:** High (crash)
- **Semptom:** Buffering anlarında sporadik crash.
- **Açıklama:**
  - Native taraf `self.onVideoAudioTracks(...)` / `self.onVideoSubtitles(...)` bloklarını nil-check olmadan çağırıyor.
  - JS wrapper şu an bu event’leri native props’a map etmiyor (bkz JS-02).
- **Evidence:**
  - `onVideoTracks`: ~188-201
  - `onSubtitles`: ~203-218
  - Buffering state’inde çağrı: ~253-260
- **Önerilen çözüm yaklaşımı:**
  - Native tarafta block nil guard.
  - JS tarafında event mapping.
- **Yapılacaklar (doğrulama):**
  - Crash backtrace’lerde nil function pointer / EXC_BAD_ACCESS var mı bakılsın.

---

### IOS-06 — Wrong RN property setter signature (`NSInteger*` pointer)

- **Severity:** High (undefined behavior/crash)
- **Semptom:** Track/subtitle index set edilince crash veya yanlış davranış.
- **Açıklama:**
  - `RCT_EXPORT_VIEW_PROPERTY(currentAudioTrackIndex, NSInteger)` beklenen setter `NSInteger` iken kod pointer alıyor.
- **Evidence:**
  - `setCurrentAudioTrackIndex:(NSInteger*)index`: ~369-374
  - `setCurrentVideoSubTitleIndex:(NSInteger*)index`: ~376-381
- **Önerilen çözüm yaklaşımı:**
  - Setter imzaları scalar `NSInteger` olmalı.
- **Yapılacaklar (doğrulama):**
  - Bu props’ları kullanan ekranlarda crash korelasyonu incelensin.

---

### IOS-07 — Debug logging production path’inde açık

- **Severity:** Medium/High (perf)
- **Semptom:** Uzun playback’te log I/O → stutter/donma.
- **Evidence:**
  - `_player.libraryInstance.debugLogging = true;` ~153
  - `_player.libraryInstance.debugLoggingLevel = 3;` ~154
- **Önerilen çözüm yaklaşımı:**
  - Debug logging yalnızca debug build veya runtime flag ile.
- **Yapılacaklar:**
  - Donma yaşanan cihazlarda syslog miktarı ölçülsün.

---

### IOS-08 — `AVAudioSession setActive:NO` her source/resume’da

- **Severity:** Medium (audio route/interrupt)
- **Semptom:** Ses kesilmesi, background/foreground sonrası takılma.
- **Evidence:**
  - `setActive:NO ...` ~125-128 ve ~175-179
- **Önerilen çözüm yaklaşımı:**
  - Audio session yönetimi daha deterministik hale getirilmeli.
- **Yapılacaklar:**
  - tvOS audio route/interrupt senaryolarında repro ve log.

---

## 3) Kod İncelemesi — JavaScript (RN wrapper)

Dosya: `VLCPlayer.js`

---

### JS-01 — `source` objesi mutate ediliyor → re-render churn

- **Severity:** High (donma/stutter)
- **Semptom:** Parent re-render’larında native `setSource` tekrar tetiklenebilir → player churn.
- **Evidence:**
  - `source.isNetwork = ...`, `source.autoplay = ...`, `source.initOptions = ...` ~194-205
- **Önerilen çözüm yaklaşımı:**
  - `source` immutable yaklaşımı (yeni obje üret, referansı stabil tut).
  - App tarafında `onProgress` içinde throttle/debounce.
- **Yapılacaklar:**
  - App’in `onProgress` handler’ı incelensin (sık `setState` var mı?).

---

### JS-02 — Audio tracks/subtitles event’leri JS’e map edilmiyor

- **Severity:** Medium/High (feature + crash riski)
- **Semptom:** track/subtitle event’leri gelmez; native tarafta block nil ise crash.
- **Evidence:**
  - JS’de handler’lar var ama render’da nativeProps’a eklenmiyor.
- **Önerilen çözüm yaklaşımı:**
  - `onVideoAudioTracks` ve `onVideoSubtitles` native mapping.

---

## 4) Kod İncelemesi — Android (libVLC)

Dosya: `android/src/main/java/com/yuanzhou/vlc/vlcplayer/ReactVlcPlayerView.java`

---

### AND-01 — `onSurfaceTextureUpdated` frame başına log (çok kritik)

- **Severity:** Critical (perf/donma)
- **Semptom:** FPS drop, UI donma, CPU/IO spike.
- **Evidence:**
  - `onSurfaceTextureUpdated` içinde `Log.i(...)` ~665-667
- **Önerilen çözüm yaklaşımı:**
  - Log kaldırılmalı veya debug flag ile korunmalı.
- **Yapılacaklar:**
  - Android donma raporlarında logcat throughput ölçülsün.

---

### AND-02 — initOptions/mediaOptions son elemanı hep atlanıyor

- **Severity:** High (opsiyonlar uygulanmıyor)
- **Semptom:** caching/hw-decoder vb “bazen çalışmıyor”.
- **Evidence:**
  - `for (i < options.size() - 1)` ~376-380 ve ~425-428
- **Önerilen çözüm yaklaşımı:**
  - Döngü sınırı düzeltilecek.
- **Yapılacaklar:**
  - Uygulamada kullanılan opsiyon listeleri çıkarılsın; hangileri kayboluyor bakılsın.

---

## 5) “Donma” Kök Neden Hipotezleri (Öncelik)

### tvOS

1. iOS/tvOS progress event flood → RN JS thread kilidi
2. Media options yanlış format → caching etkisiz → buffering loop
3. Debug logging → perf düşüşü
4. Lifecycle pause/play bug → state corruption
5. stop async teardown race → freeze/crash (özellikle ekran exit)

### Android

1. Frame başına log
2. Opsiyonların eksik uygulanması → buffering/latency

---

## 6) Yapılacaklar Listesi (Prioritized)

### P0 — Stabilite (crash/freeze)

- [ ] **tvOS/iOS:** ResignActive pause/play mantığı doğrulansın ve düzeltilsin (IOS-01)
- [ ] **tvOS/iOS:** stop() async teardown stratejisi tasarlanıp uygulanmalı (IOS-02, REF-01)
- [ ] **iOS:** Progress event throttling planı (IOS-04)
- [ ] **iOS:** Nil event block guard + JS event mapping (IOS-05 + JS-02)
- [ ] **iOS:** Wrong setter imzaları düzeltilmeli (IOS-06)

### P1 — Performans / Donma azaltma

- [ ] **iOS:** initOptions format sözleşmesi netleşsin (`:` vs `--`) (IOS-03, REF-02)
- [ ] **iOS:** debug logging production path’inden çıkarılsın (IOS-07)
- [ ] **Android:** `onSurfaceTextureUpdated` log kaldırılmalı (AND-01)
- [ ] **Android:** options loop `size()-1` düzeltilmeli (AND-02)
- [ ] **JS:** source mutasyonu kaldırılıp immutable yaklaşım (JS-01)

---

## 7) Doğrulama / Test Planı (Kod değişmeden)

- [ ] **tvOS Instruments:** Time Profiler (donma anında main vs JS thread)
- [ ] **iOS Instruments:** Allocations + Leaks (60 dk playback, source change loop)
- [ ] **Event-rate ölçümü:** onProgress saniyede kaç kez geliyor?
- [ ] **VLC state korelasyonu:** Buffering’de takılı kalıyor mu?
- [ ] **Crash backtrace toplama:**
  - stop/dealloc ilişkisi (REF-01)
  - nil block çağrısı (IOS-05)
  - wrong setter imzası (IOS-06)

---

## 8) Kaynaklar

- VideoLAN / VLCKit Issue #376: `stop()` async; Stopped state beklenmeli
- VideoLAN Wiki “Documentation:Command_line”: item-specific option format (`:`)
- VLCKit API docs (Context7): VLCMediaPlayer / VLCMedia option ekleme referansları
