# Derinlemesine Analiz Raporu: VLC Player Stabilite Sorunlari

## Tespit Edilen Kritik Sorunlar

---

## 1. iOS (TVVLCKit) Kritik Sorunlar

### KRITIK: Memory Leak - Player Release Sirasi

**Dosya:** `RCTVLCPlayer.m:375-384`

```objc
- (void)_release
{
    if(_player){
        [_player pause];
        [_player stop];
        _player = nil;
        _eventDispatcher = nil;
        [[NSNotificationCenter defaultCenter] removeObserver:self];
    }
}
```

**Sorunlar:**

1. **Media release edilmiyor** - `_player.media = nil` yapilmiyor, bu bilinen bir VLCKit memory leak'i
2. **Delegate nil yapilmiyor** - `_player.delegate = nil` yapilmadan player nil'lenince crash olabilir
3. **stop() sonrasi bekleme yok** - VLCKit'te stop() asenkron calisir, hemen nil'lemek crash'e neden olur
4. **VLCLibrary instance release edilmiyor** - Her player icin yeni library instance olusturuluyor ama release yok

**VLCKit Official Issue:** [#376](https://code.videolan.org/videolan/VLCKit/-/issues/376) - "VLCMediaPlayer crashes sometimes by stop() und dealloc"

---

### KRITIK: Drawable Lifecycle Thread Safety

**Dosya:** `RCTVLCPlayer.m:106, 143-144`

```objc
[_player setDrawable:self];
_player.delegate = self;
```

**Sorunlar:**

1. **Main thread kontrolu yok** - Drawable ayarlari her zaman main thread'de yapilmali
2. **Drawable nil'lenmeden player release ediliyor** - View dealloc oldugunda player hala drawable'a erismeje calisabilir

---

### KRITIK: NotificationCenter Observer Memory Leak

**Dosya:** `RCTVLCPlayer.m:36-44`

```objc
[[NSNotificationCenter defaultCenter] addObserver:self
                                         selector:@selector(applicationWillResignActive:)
                                             name:UIApplicationWillResignActiveNotification
                                           object:nil];
```

**Sorun:**

- Observer sadece `_release` icinde kaldiriliyor
- View dealloc edilirse ama `_release` cagrilmazsa observer kalir -> **crash**
- `dealloc` method'u yok!

---

### ORTA: setSource'da Player Reuse Sorunu

**Dosya:** `RCTVLCPlayer.m:123-161`

```objc
-(void)setSource:(NSDictionary *)source
{
    if(_player){
        [self _release];  // Her source degisikliginde tamamen yeniden olusturuluyor
    }
    _player = [[VLCMediaPlayer alloc] init];
    // ...
}
```

**Sorun:**

- Her kaynak degisikliginde player tamamen yeniden olusturuluyor
- Bu VLCKit'te bilinen memory leak'lere neden olur ([Issue #29416](https://code.videolan.org/videolan/vlc/-/issues/29416))
- Dogru yaklasim: Mevcut player'i reuse etmek ve sadece media'yi degistirmek

---

### ORTA: onVideoError Comment'lenmis

**Dosya:** `RCTVLCPlayer.m:261-264`

```objc
case VLCMediaPlayerStateError:
    NSLog(@"VLCMediaPlayerStateError %i",1);
    // self.onVideoError(@{ ... });  // COMMENT'LENMIS!
    [self _release];
```

**Sorun:** Error callback JS tarafina iletilmiyor, kullanici hatadan haberdar olamiyor.

---

### DUSUK: AVAudioSession Yanlis Kullanim

**Dosya:** `RCTVLCPlayer.m:116, 154`

```objc
[[AVAudioSession sharedInstance] setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
```

**Sorun:** Error handle edilmiyor, ve session deactive yapilmasi her zaman dogru degil.

---

## 2. Android (libVLC) Kritik Sorunlar

### KRITIK: LibVLC Instance Memory Leak

**Dosya:** `ReactVlcPlayerView.java:434-447`

```java
private void releasePlayer() {
    if (libvlc == null)
        return;
    mMediaPlayer.stop();
    final IVLCVout vout = mMediaPlayer.getVLCVout();
    vout.removeCallback(callback);
    vout.detachViews();
    libvlc.release();
    libvlc = null;
    // mMediaPlayer.release() YOK!
}
```

**Sorunlar:**

1. **MediaPlayer release edilmiyor!** - `mMediaPlayer.release()` cagrilmiyor -> massive memory leak
2. **Event listener kaldirilmiyor** - `mMediaPlayer.setEventListener(null)` yok
3. **Media release edilmiyor** - Media object'i release edilmeden birakiliyor

**libVLC Issue:** [#580](https://code.videolan.org/videolan/vlc-android/-/issues/580), [#1257](https://code.videolan.org/videolan/vlc-android/-/issues/1257)

---

### KRITIK: Handler Memory Leak

**Dosya:** `ReactVlcPlayerView.java:68-69, 151-181`

```java
private Handler mProgressUpdateHandler = new Handler();
private Runnable mProgressUpdateRunnable = null;

private void setProgressUpdateRunnable() {
    new Thread() {  // YENI THREAD HER SEFERINDE!
        @Override
        public void run() {
            mProgressUpdateRunnable = () -> {
                // ...
                mProgressUpdateHandler.postDelayed(mProgressUpdateRunnable, ...);
            };
            mProgressUpdateHandler.postDelayed(mProgressUpdateRunnable, 0);
        }
    }.start();
}
```

**Sorunlar:**

1. **Her cagirida yeni Thread** - setProgressUpdateRunnable her cagrildiginda yeni thread baslatiliyor
2. **Onceki runnable iptal edilmiyor** - createPlayer cagrilinca eski runnable hala calisiyor olabilir
3. **Handler Looper'siz** - Main looper kullanilmali: `new Handler(Looper.getMainLooper())`
4. **Inner class reference** - Non-static inner class Activity/View reference tutar -> leak

---

### KRITIK: createPlayer'da Null Check Eksikligi

**Dosya:** `ReactVlcPlayerView.java:327-432`

```java
private void createPlayer(boolean autoplayResume, boolean isResume) {
    releasePlayer();
    if (this.getSurfaceTexture() == null) {
        return;  // Erken return ama srcMap kullanilacak
    }
    try {
        String uriString = srcMap.hasKey("uri") ? srcMap.getString("uri") : null;
        // srcMap NULL olabilir!
```

**Sorun:** `srcMap` null kontrolu yok, NullPointerException riski.

---

### ORTA: Event Listener Threading

**Dosya:** `ReactVlcPlayerView.java:210-272`

```java
private MediaPlayer.EventListener mPlayerListener = new MediaPlayer.EventListener() {
    @Override
    public void onEvent(MediaPlayer.Event event) {
        boolean isPlaying = mMediaPlayer.isPlaying();  // mMediaPlayer NULL olabilir!
```

**Sorun:** Event geldiginde mMediaPlayer null olmus olabilir (ozellikle release sirasinda).

---

### ORTA: LifecycleEventListener Kaydi Eksik

**Dosya:** `ReactVlcPlayerView.java:36-39, 107-143`

```java
class ReactVlcPlayerView extends TextureView implements LifecycleEventListener {
    // themedReactContext.addLifecycleEventListener(this) CAGRILMIYOR!
```

**Sorun:** Lifecycle event'ler (`onHostResume`, `onHostPause`, `onHostDestroy`) hicbir zaman cagrilmiyor cunku listener register edilmemis!

---

## 3. JavaScript Tarafi Sorunlari

### ORTA: initOptions Memory Sizintisi

**Dosya:** `VLCPlayer.js:190-192`

```javascript
source.initOptions = source.initOptions || [];
source.initOptions.push("--input-repeat=1000");
```

**Sorun:** Her render'da `--input-repeat=1000` ekleniyor, array buyumeye devam eder.

---

### DUSUK: Ref Cleanup Yok

**Dosya:** `VLCPlayer.js:108-109`

```javascript
_assignRoot(component) {
    this._root = component;
}
```

**Sorun:** Component unmount oldugunda `_root` null'lanmiyor.

---

## 4. Bilinen VLCKit/libVLC Sorunlari (Dis Kaynaklardan)

| Sorun                                        | Platform    | Kaynak                                                                            |
| -------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| stop() + dealloc crash                       | iOS         | [VLCKit #376](https://code.videolan.org/videolan/VLCKit/-/issues/376)             |
| Memory leak on media change                  | iOS/Android | [VLCKit #29416](https://code.videolan.org/videolan/vlc/-/issues/29416)            |
| Multiple VLCMediaPlayer crash                | iOS         | [VLCKit #167](https://code.videolan.org/videolan/VLCKit/-/issues/167)             |
| Custom VLCLibrary dealloc crash              | iOS         | [VLCKit #489](https://code.videolan.org/videolan/VLCKit/-/issues/489)             |
| Native memory leak loop                      | Android     | [vlc-android #580](https://code.videolan.org/videolan/vlc-android/-/issues/580)   |
| Stream playback crash after repeated changes | Android     | [vlc-android #1257](https://code.videolan.org/videolan/vlc-android/-/issues/1257) |
| iOS 17.4+ simulator crash                    | iOS         | [VLCKit #724](https://code.videolan.org/videolan/VLCKit/-/issues/724)             |

---

## Ozet Risk Matrisi

| #   | Sorun                               | Severity | Platform | Tip          |
| --- | ----------------------------------- | -------- | -------- | ------------ |
| 1   | MediaPlayer release eksik (Android) | KRITIK   | Android  | Memory Leak  |
| 2   | Player release sirasi yanlis (iOS)  | KRITIK   | iOS      | Crash + Leak |
| 3   | Handler memory leak                 | KRITIK   | Android  | Memory Leak  |
| 4   | LifecycleEventListener kayitsiz     | KRITIK   | Android  | Lifecycle    |
| 5   | Drawable thread safety              | KRITIK   | iOS      | Crash        |
| 6   | NotificationCenter dealloc yok      | ORTA     | iOS      | Crash        |
| 7   | Player reuse yerine recreate        | ORTA     | iOS      | Memory Leak  |
| 8   | Event listener null check           | ORTA     | Android  | Crash        |
| 9   | srcMap null check                   | ORTA     | Android  | Crash        |
| 10  | onVideoError disabled               | ORTA     | iOS      | UX           |
| 11  | initOptions array growth            | DUSUK    | JS       | Memory       |

---

## Onerilen Duzeltme Oncelikleri

1. **Android `releasePlayer()` duzeltmesi** - En kritik memory leak
2. **iOS `_release` metodunun dogru sirayla yazilmasi**
3. **Android LifecycleEventListener kaydi**
4. **Handler leak duzeltmesi**
5. **iOS dealloc metodu eklenmesi**

Bu sorunlarin tamami TV'de uzun sureli movie/series izleme senaryolarinda birikimli memory leak ve eventual crash'e neden olabilir.
