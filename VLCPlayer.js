import React from "react";
import ReactNative from "react-native";

const { Component } = React;

const { StyleSheet, requireNativeComponent, NativeModules, View } = ReactNative;
import resolveAssetSource from "react-native/Libraries/Image/resolveAssetSource";

export default class VLCPlayer extends Component {
  constructor(props, context) {
    super(props, context);
    this.seek = this.seek.bind(this);
    this.delay = this.delay.bind(this);
    this.resume = this.resume.bind(this);
    this.snapshot = this.snapshot.bind(this);
    this.subtitle = this.subtitle.bind(this);
    this._assignRoot = this._assignRoot.bind(this);
    this.currentAudioTrackIndex = this.currentAudioTrackIndex.bind(this);
    this._onError = this._onError.bind(this);
    this._onProgress = this._onProgress.bind(this);
    this._onEnded = this._onEnded.bind(this);
    this.subtitleIndex = this.subtitleIndex.bind(this);
    this.trackIndex = this.trackIndex.bind(this);
    this._onPlaying = this._onPlaying.bind(this);
    this._onStopped = this._onStopped.bind(this);
    this._onPaused = this._onPaused.bind(this);
    this._onBuffering = this._onBuffering.bind(this);
    this._onOpen = this._onOpen.bind(this);
    this._onLoadStart = this._onLoadStart.bind(this);
    this.changeVideoAspectRatio = this.changeVideoAspectRatio.bind(this);
    this._onVideoAudioTracks = this._onVideoAudioTracks.bind(this);
    this._onVideoSubtitles = this._onVideoSubtitles.bind(this);
    this.videoSubtitleIndex = this.videoSubtitleIndex.bind(this);
    this.setVideoSubtitleSlave = this.setVideoSubtitleSlave.bind(this);
  }
  static defaultProps = {
    autoplay: true,
  };

  _onVideoAudioTracks(event) {
    if (this.props.onAudioTracks) {
      this.props.onAudioTracks(event.nativeEvent);
    }
  }
  
  _onVideoSubtitles(event) {
    if (this.props.onSubtitles) {
      this.props.onSubtitles(event.nativeEvent);
    }
  }


  setNativeProps(nativeProps) {
    this._root.setNativeProps(nativeProps);
  }

  setVideoSubtitleSlave(videoSubtitleSlave) {
    this.setNativeProps({videoSubtitleSlave})
  }
  currentAudioTrackIndex(index) {
    this.setNativeProps({currentAudioTrackIndex: index});
  }

  currentVideoSubTitleIndex(index) {
    this.setNativeProps({currentVideoSubTitleIndex: index});
  }

  seek(pos) {
    this.setNativeProps({ seek: pos });
  }

  delay(delay){
    this.setNativeProps({delay});
  }

  resume(isResume) {
    this.setNativeProps({ resume: isResume });
  }

  subtitle(subtitle) {
    this.setNativeProps({ subtitle });  
  }

  subtitleIndex(subtitleIndex){
    this.setNativeProps({subtitleIndex})
  }

  videoSubtitleIndex(videoSubtitleIndex){
    this.setNativeProps({currentVideoSubTitleIndex:videoSubtitleIndex})
  }

  trackIndex(trackIndex){
    this.setNativeProps({trackIndex})
  }

  snapshot(path) {
    this.setNativeProps({ snapshotPath: path });
  }

  autoAspectRatio(isAuto) {
    this.setNativeProps({ autoAspectRatio: isAuto });
  }

  changeVideoAspectRatio(ratio) {
    this.setNativeProps({ videoAspectRatio: ratio });
  }

  _assignRoot(component) {
    this._root = component;
  }

  _onBuffering(event) {
    if (this.props.onBuffering) {
      this.props.onBuffering(event.nativeEvent);
    }
  }

  _onError(event) {
    if (this.props.onError) {
      this.props.onError(event.nativeEvent);
    }
  }

  _onOpen(event) {
    if (this.props.onOpen) {
      this.props.onOpen(event.nativeEvent);
    }
  }

  _onLoadStart(event) {
    if (this.props.onLoadStart) {
      this.props.onLoadStart(event.nativeEvent);
    }
  }

  _onProgress(event) {
    if (this.props.onProgress) {
      this.props.onProgress(event.nativeEvent);
    }
  }

  _onEnded(event) {
    if (this.props.onEnd) {
      this.props.onEnd(event.nativeEvent);
    }
  }

  _onStopped() {
    this.setNativeProps({ paused: true });
    if (this.props.onStopped) {
      this.props.onStopped();
    }
  }

  _onPaused(event) {
    if (this.props.onPaused) {
      this.props.onPaused(event.nativeEvent);
    }
  }

  _onPlaying(event) {
    if (this.props.onPlaying) {
      this.props.onPlaying(event.nativeEvent);
    }
  }

  render() {
    /* const {
     source
     } = this.props;*/
    const source = resolveAssetSource(this.props.source) || {};

    let uri = source.uri || "";
    if (uri && uri.match(/^\//)) {
      uri = `file://${uri}`;
    }

    let isNetwork = !!(uri && uri.match(/^https?:/));
    const isAsset = !!(
      uri && uri.match(/^(assets-library|file|content|ms-appx|ms-appdata):/)
    );
    if (!isAsset) {
      isNetwork = true;
    }
    if (uri && uri.match(/^\//)) {
      isNetwork = false;
    }
    source.isNetwork = isNetwork;
    source.autoplay = this.props.autoplay;
    source.initOptions = source.initOptions || [];
    //repeat the input media
    source.initOptions.push("--input-repeat=1000");
    const nativeProps = Object.assign({}, this.props);
    Object.assign(nativeProps, {
      style: [styles.base, nativeProps.style],
      source: source,
      src: {
        uri,
        isNetwork,
        isAsset,
        type: source.type || "",
        mainVer: source.mainVer || 0,
        patchVer: source.patchVer || 0,
      },
      onVideoLoadStart: this._onLoadStart,
      onVideoOpen: this._onOpen,
      onVideoError: this._onError,
      onVideoProgress: this._onProgress,
      onVideoEnded: this._onEnded,
      onVideoEnd: this._onEnded,
      onVideoPlaying: this._onPlaying,
      onVideoPaused: this._onPaused,
      onVideoStopped: this._onStopped,
      onVideoBuffering: this._onBuffering,
      progressUpdateInterval: 250,
    });

    return <RCTVLCPlayer ref={this._assignRoot} {...nativeProps} />;
  }
}


const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
});
const RCTVLCPlayer = requireNativeComponent("RCTVLCPlayer", VLCPlayer);