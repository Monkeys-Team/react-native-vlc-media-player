#import <React/RCTConvert.h>
#import "RCTVLCPlayer.h"
#import <React/RCTBridgeModule.h>
#import <React/RCTEventDispatcher.h>
#import <React/UIView+React.h>
#if TARGET_OS_TV
    #import <TVVLCKit/TVVLCKit.h>
#else
    #import <MobileVLCKit/MobileVLCKit.h>
#endif
#import <AVFoundation/AVFoundation.h>
static NSString *const statusKeyPath = @"status";
static NSString *const playbackLikelyToKeepUpKeyPath = @"playbackLikelyToKeepUp";
static NSString *const playbackBufferEmptyKeyPath = @"playbackBufferEmpty";
static NSString *const readyForDisplayKeyPath = @"readyForDisplay";
static NSString *const playbackRate = @"rate";

@implementation RCTVLCPlayer
{

    /* Required to publish events */
    RCTEventDispatcher *_eventDispatcher;
    VLCMediaPlayer *_player;

    NSDictionary * _source;
    BOOL _paused;
    BOOL _started;

}

- (instancetype)initWithEventDispatcher:(RCTEventDispatcher *)eventDispatcher
{
    if ((self = [super init])) {
        _eventDispatcher = eventDispatcher;

        [[NSNotificationCenter defaultCenter] addObserver:self
                                                 selector:@selector(applicationWillResignActive:)
                                                     name:UIApplicationWillResignActiveNotification
                                                   object:nil];

        [[NSNotificationCenter defaultCenter] addObserver:self
                                                 selector:@selector(applicationWillEnterForeground:)
                                                     name:UIApplicationWillEnterForegroundNotification
                                                   object:nil];

    }

    return self;
}

- (void)applicationWillResignActive:(NSNotification *)notification
{
    if (!_paused) {
        [self setPaused:_paused];
    }
}

- (void)applicationWillEnterForeground:(NSNotification *)notification
{
    [self applyModifiers];
}

- (void)applyModifiers
{
    if(!_paused)
        [self play];
}

- (void)setPaused:(BOOL)paused
{
    if(_player){
        if(!paused){
            [self play];
        }else {
            [_player pause];
            _paused =  YES;
            _started = NO;
        }
    }
}

-(void)play
{
    if(_player){
        [_player play];
        _paused = NO;
        _started = YES;
    }
}

-(void)setResume:(BOOL)autoplay
{
    // [bavv edit start]
    NSString* uri    = [_source objectForKey:@"uri"];
    NSURL* _uri    = [NSURL URLWithString:uri];
    NSDictionary* initOptions = [_source objectForKey:@"initOptions"];
    NSNumber* fontSize    = [_source objectForKey:@"fontSize"];

    // Reuse existing player if available, only change media
    if(_player){
        // Release old media first
        _player.media = nil;
    } else {
        _player = [[VLCMediaPlayer alloc] init];
        [_player performSelector:@selector(setTextRendererFontSize:) withObject:fontSize];
        
        // Ensure drawable is set on main thread
        dispatch_async(dispatch_get_main_queue(), ^{
            [self->_player setDrawable:self];
        });
        _player.delegate = self;
        _player.scaleFactor = 0;
    }
	// [bavv edit end]

    VLCMedia *media = [VLCMedia mediaWithURL:_uri];

    for (NSString* option in initOptions) {
        [media addOption:[option stringByReplacingOccurrencesOfString:@"--" withString:@""]];
    }

    _player.media = media;
    
    NSError *audioError = nil;
    [[AVAudioSession sharedInstance] setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:&audioError];
    if (audioError) {
        NSLog(@"AVAudioSession error: %@", audioError);
    }
    
    NSLog(@"autoplay: %i",autoplay);
    self.onVideoLoadStart(@{
                            @"target": self.reactTag
                            });
}

-(void)setSource:(NSDictionary *)source
{
    _source = source;
    // [bavv edit start]
    NSString* uri    = [source objectForKey:@"uri"];
    NSNumber *fontSizeNumber = [source objectForKey:@"fontSize"];
    NSInteger fontSize = [fontSizeNumber integerValue];    
    BOOL    autoplay = [RCTConvert BOOL:[source objectForKey:@"autoplay"]];
    NSURL* _uri    = [NSURL URLWithString:uri];
    NSDictionary* initOptions = [source objectForKey:@"initOptions"];

    // Reuse existing player if available, only change media (prevents memory leak)
    if(_player){
        // Release old media first
        _player.media = nil;
    } else {
        _player = [[VLCMediaPlayer alloc] init];
        _player.libraryInstance.debugLogging = true;
        _player.libraryInstance.debugLoggingLevel = 3;
        // [bavv edit end]

        [_player performSelector:@selector(setTextRendererFontSize:) withObject:fontSizeNumber];
        
        // Ensure drawable is set on main thread for thread safety
        dispatch_async(dispatch_get_main_queue(), ^{
            [self->_player setDrawable:self];
        });
        _player.delegate = self;
        _player.scaleFactor = 0;
    }

    VLCMedia *media = [VLCMedia mediaWithURL:_uri];

    for (NSString* option in initOptions) {
        [media addOption:[option stringByReplacingOccurrencesOfString:@"--" withString:@""]];
    }

    _player.media = media;
    
    NSError *audioError = nil;
    [[AVAudioSession sharedInstance] setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:&audioError];
    if (audioError) {
        NSLog(@"AVAudioSession error: %@", audioError);
    }
    
    self.onVideoLoadStart(@{
                           @"target": self.reactTag
                           });
//    if(autoplay)
        [self play];
}

- (void)onVideoTracks {
    if(_player){
        NSArray *tracksNames = [_player audioTrackNames];
        NSArray *tracksIndexes = [_player audioTrackIndexes];
        int currentTrackIndex = [_player currentAudioTrackIndex];
        
        self.onVideoAudioTracks(@{
            @"target": self.reactTag,
            @"trackNames": tracksNames,
            @"trackIndexes": tracksIndexes,
            @"currentTrackIndex":[NSNumber numberWithInt:currentTrackIndex]
                                });
    }
}

- (void)onSubtitles {
    if(_player){
        NSArray *subtitleNames = [_player videoSubTitlesNames];
        NSArray *subtitleIndexes = [_player videoSubTitlesIndexes];
        int currentSubtitleIndex = [_player currentVideoSubTitleIndex];
        float delay = [_player currentVideoSubTitleDelay];
        
        self.onVideoSubtitles(@{
            @"target": self.reactTag,
            @"subtitleNames": subtitleNames,
            @"subtitleIndexes": subtitleIndexes,
            @"currentSubtitleIndex":[NSNumber numberWithInt:currentSubtitleIndex],
            @"delay":[NSNumber numberWithFloat:delay]
        });
    }
}

- (void)mediaPlayerTimeChanged:(NSNotification *)aNotification
{
    [self updateVideoProgress];
}

- (void)mediaPlayerStateChanged:(NSNotification *)aNotification
{

     NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
     NSLog(@"userInfo %@",[aNotification userInfo]);
     NSLog(@"standardUserDefaults %@",defaults);
    if(_player){
        VLCMediaPlayerState state = _player.state;
        switch (state) {
            case VLCMediaPlayerStateOpening:
                 NSLog(@"VLCMediaPlayerStateOpening %i",1);
                self.onVideoOpen(@{
                                     @"target": self.reactTag
                                     });
                break;
            case VLCMediaPlayerStatePaused:
                _paused = YES;
                NSLog(@"VLCMediaPlayerStatePaused %i",1);
                self.onVideoPaused(@{
                                     @"target": self.reactTag
                                     });
                break;
            case VLCMediaPlayerStateStopped:
                NSLog(@"VLCMediaPlayerStateStopped %i",1);
                self.onVideoStopped(@{
                                      @"target": self.reactTag
                                      });
                break;
            case VLCMediaPlayerStateBuffering:
                NSLog(@"VLCMediaPlayerStateBuffering %i",1);
                self.onVideoBuffering(@{
                                        @"target": self.reactTag
                                        });
                [self onVideoTracks];
                [self onSubtitles];
                break;
            case VLCMediaPlayerStatePlaying:
                _paused = NO;
                NSLog(@"VLCMediaPlayerStatePlaying %i",1);
                self.onVideoPlaying(@{
                                      @"target": self.reactTag,
                                      @"seekable": [NSNumber numberWithBool:[_player isSeekable]],
                                      @"duration":[NSNumber numberWithInt:[_player.media.length intValue]]
                                      });
                break;
            case VLCMediaPlayerStateEnded:
                NSLog(@"VLCMediaPlayerStateEnded %i",1);
                int currentTime   = [[_player time] intValue];
                int remainingTime = [[_player remainingTime] intValue];
                int duration      = [_player.media.length intValue];

                self.onVideoEnded(@{
                                    @"target": self.reactTag,
                                    @"currentTime": [NSNumber numberWithInt:currentTime],
                                    @"remainingTime": [NSNumber numberWithInt:remainingTime],
                                    @"duration":[NSNumber numberWithInt:duration],
                                    @"position":[NSNumber numberWithFloat:_player.position]
                                    });
                break;
            case VLCMediaPlayerStateError:
                NSLog(@"VLCMediaPlayerStateError %i",1);
                self.onVideoError(@{
                                    @"target": self.reactTag
                                    });
                [self _release];
                break;
            default:
                break;
        }
    }
}

-(void)updateVideoProgress
{
    if(_player){
        int currentTime   = [[_player time] intValue];
        int remainingTime = [[_player remainingTime] intValue];
        int duration      = [_player.media.length intValue];
        if( currentTime >= 0 ) {
            self.onVideoProgress(@{
                                   @"target": self.reactTag,
                                   @"currentTime": [NSNumber numberWithInt:currentTime],
                                   @"remainingTime": [NSNumber numberWithInt:remainingTime],
                                   @"duration":[NSNumber numberWithInt:duration],
                                   @"position":[NSNumber numberWithFloat:_player.position]
                                   });
        }
    }
}

- (void)jumpBackward:(int)interval
{
    if(interval>=0 && interval <= [_player.media.length intValue])
        [_player jumpBackward:interval];
}

- (void)jumpForward:(int)interval
{
    if(interval>=0 && interval <= [_player.media.length intValue])
        [_player jumpForward:interval];
}

-(void)setSeek:(float)pos
{
    if([_player isSeekable]){
        if(pos>=0 && pos <= 1){
            [_player setPosition:pos];
        }
    }
}

-(void)setDelay:(NSInteger)delay{
    if(_player){
        [_player setCurrentVideoSubTitleDelay:delay];
        [self onSubtitles];
    }
}

-(void)setSubtitleIndex:(int)index{
    if(_player){
        [_player setCurrentVideoSubTitleIndex:index];
        [self onSubtitles];
    }
}

-(void)setTrackIndex:(int)index{
    if(_player){
        [_player setCurrentAudioTrackIndex:index];
        [self onVideoTracks];
    }
}

-(void)setSubtitle:(NSString*)subtitle{
    NSURL *_url = [NSURL URLWithString:subtitle];
    [_player addPlaybackSlave:_url type:VLCMediaPlaybackSlaveTypeSubtitle enforce:true];
    [self onSubtitles];
}

-(void)setSnapshotPath:(NSString*)path
{
    if(_player)
        [_player saveVideoSnapshotAt:path withWidth:0 andHeight:0];
}

- (void)setCurrentAudioTrackIndex:(NSInteger*)index
{
    if(_player){
        [_player setCurrentAudioTrackIndex:index];
    }
}

- (void)setCurrentVideoSubTitleIndex:(NSInteger*)index
{
    if(_player){
        [_player setCurrentVideoSubTitleIndex:index];
    }
}

-(void)setRate:(float)rate
{
    [_player setRate:rate];
}

-(void)setVideoAspectRatio:(NSString *)ratio{
    char *char_content = [ratio cStringUsingEncoding:NSASCIIStringEncoding];
    [_player setVideoAspectRatio:char_content];
}

- (void)setMuted:(BOOL)value
{
    if (_player) {
        [[_player audio] setMuted:value];
    }
}

- (void)_release
{
    if(_player){
        // Remove delegate first to prevent callbacks during teardown
        _player.delegate = nil;
        
        [_player pause];
        [_player stop];
        
        // Clear drawable to prevent crash when view is deallocated
        [_player setDrawable:nil];
        
        // Release media to prevent VLCKit memory leak (Issue #376)
        _player.media = nil;
        
        _player = nil;
        _eventDispatcher = nil;
        [[NSNotificationCenter defaultCenter] removeObserver:self];
    }
}

- (void)dealloc
{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    [self _release];
}


#pragma mark - Lifecycle
- (void)removeFromSuperview
{
    NSLog(@"removeFromSuperview");
    [self _release];
    [super removeFromSuperview];
}

@end
