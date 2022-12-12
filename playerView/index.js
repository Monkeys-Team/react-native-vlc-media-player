/**
 * Created by yuanzhou.xu on 2018/5/15.
 */

import React, { Component } from 'react';
import {
  StatusBar,
  View,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Text,
  Dimensions,
  BackHandler,
} from 'react-native';

import VLCPlayerView from './VLCPlayerView';
import { getStatusBarHeight } from './SizeController';
const statusBarHeight = getStatusBarHeight();
const _fullKey = 'commonVideo_android_fullKey';
let deviceHeight = Dimensions.get('window').height;
let deviceWidth = Dimensions.get('window').width;
export default class CommonVideo extends Component {
  constructor(props) {
    super(props);
    this.url = '';
    this.initialHeight = 200;

    if (props.widthCamera) {
      deviceWidth = props.widthCamera
    }
  }

  static navigationOptions = {
    header: null,
  };

  state = {
    isEndGG: false,
    isFull: false,
    currentUrl: '',
    storeUrl: '',
  };

  static defaultProps = {
    height: 250,
    showGG: false,
    ggUrl: '',
    url: '',
    showBack: false,
    showTitle: false,
  };

  static getDerivedStateFromProps(nextProps, preState) {
    let { url } = nextProps;
    let { currentUrl, storeUrl } = preState;
    if (url && url !== storeUrl) {
      if (storeUrl === "") {
        return {
          currentUrl: url,
          storeUrl: url,
          isEndGG: false,
        };
      } else {
        return {
          currentUrl: "",
          storeUrl: url,
          isEndGG: false,
        };
      }
    }
    return null;
  }


  componentDidUpdate(prevProps, prevState) {
    if (this.props.url !== prevState.storeUrl && this._componentMounted) {
      this.setState({
        storeUrl: this.props.url,
        currentUrl: this.props.url
      })
    }
  }

  componentDidMount() {
    this._componentMounted = true
    StatusBar.setBarStyle("light-content");
    let { style, isGG } = this.props;

    if (style && style.height && !isNaN(style.height)) {
      this.initialHeight = style.height;
    }
    this.setState({
      currentVideoAspectRatio: deviceWidth + ":" + this.initialHeight,
    });

    let { isFull } = this.props;
    console.log(`isFull == ${isFull}`);
    if (isFull) {
      this._toFullScreen();
    }
  }

  componentWillUnmount() {
    this._componentMounted = false;

    let { isFull } = this.props;
    if (isFull) {
      this._closeFullScreen();
    }
  }

  _closeFullScreen = () => {
    let { closeFullScreen, BackHandle, Orientation } = this.props;
    if (this._componentMounted) {
      this.setState({ isFull: false, currentVideoAspectRatio: deviceWidth + ":" + this.initialHeight, });
    }
    BackHandle && BackHandle.removeBackFunction(_fullKey);
    Orientation && Orientation.lockToPortrait();
    StatusBar.setHidden(false);
    //StatusBar.setTranslucent(false);
    this._componentMounted && closeFullScreen && closeFullScreen();
  };

  _toFullScreen = () => {
    let { startFullScreen, BackHandle, Orientation } = this.props;
    //StatusBar.setTranslucent(true);
    this.setState({ isFull: true, currentVideoAspectRatio: deviceHeight + ":" + deviceWidth, });
    StatusBar.setHidden(true);
    BackHandle && BackHandle.addBackFunction(_fullKey, this._closeFullScreen);
    startFullScreen && startFullScreen();
    Orientation && Orientation.lockToLandscape && Orientation.lockToLandscape();
  };

  _onLayout = (e) => {
    let { width, height } = e.nativeEvent.layout;
    console.log(e.nativeEvent.layout);
    if (width * height > 0) {
      this.width = width;
      this.height = height;
      if (!this.initialHeight) {
        this.initialHeight = height;
      }
    }
  }

  render() {
    let { url, ggUrl, showGG, onGGEnd, onEnd, style, height, title, onLeftPress, showBack, showTitle, closeFullScreen, videoAspectRatio, fullVideoAspectRatio } = this.props;
    let { isEndGG, isFull, currentUrl } = this.state;
    let currentVideoAspectRatio = '';
    if (isFull) {
      currentVideoAspectRatio = fullVideoAspectRatio;
    } else {
      currentVideoAspectRatio = videoAspectRatio;
    }
    if (!currentVideoAspectRatio) {
      let { width, height } = this.state;
      currentVideoAspectRatio = this.state.currentVideoAspectRatio;
    }
    let realShowGG = false;
    let type = '';
    let ggType = '';
    let showVideo = false;
    let showTop = false;
    if (showGG && ggUrl && !isEndGG) {
      realShowGG = true;
    }
    if (currentUrl) {
      if (!showGG || (showGG && isEndGG)) {
        showVideo = true;
      }
      if (currentUrl.split) {
        let types = currentUrl.split('.');
        if (types && types.length > 0) {
          type = types[types.length - 1];
        }
      }
    }
    if (ggUrl && ggUrl.split) {
      let types = ggUrl.split('.');
      if (types && types.length > 0) {
        ggType = types[types.length - 1];
      }
    }
    if (!showVideo) {
      showTop = true;
    }
    return (
      <View
        //onLayout={this._onLayout}
        style={[isFull ? styles.container : { height: 200, backgroundColor: '#000' }, style]}>
        {showTop && <View style={styles.topView}>
          <View style={styles.backBtn}>
            {showBack && <TouchableOpacity
              onPress={() => {
                if (isFull) {
                  closeFullScreen && closeFullScreen();
                } else {
                  onLeftPress && onLeftPress();
                }
              }}
              style={styles.btn}
              activeOpacity={0.8}>
              <Text> Geri </Text>
            </TouchableOpacity>
            }
            <View style={{ justifyContent: 'center', flex: 1, marginRight: 10 }}>
              {showTitle &&
                <Text style={{ color: '#fff', fontSize: 16 }} numberOfLines={1}>{title}</Text>
              }
            </View>
          </View>
        </View>
        }
        {realShowGG && (
          <VLCPlayerView
            {...this.props}
            videoAspectRatio={currentVideoAspectRatio}
            uri={ggUrl}
            source={{ uri: ggUrl, type: ggType }}
            type={ggType}
            isGG={true}
            showBack={showBack}
            showTitle={showTitle}
            isFull={isFull}
            onEnd={() => {
              onGGEnd && onGGEnd();
              this.setState({ isEndGG: true });
            }}
            startFullScreen={this._toFullScreen}
            closeFullScreen={this._closeFullScreen}
          />
        )}

        {showVideo && (
          <VLCPlayerView
            {...this.props}
            uri={currentUrl}
            videoAspectRatio={currentVideoAspectRatio}
            onLeftPress={onLeftPress}
            title={title}
            type={type}
            isFull={isFull}
            showBack={showBack}
            showTitle={showTitle}
            hadGG={true}
            isEndGG={isEndGG}
            //initPaused={this.state.paused}
            style={showGG && !isEndGG ? { position: 'absolute', zIndex: -1 } : {}}
            source={{ uri: currentUrl, type: type }}
            startFullScreen={this._toFullScreen}
            closeFullScreen={this._closeFullScreen}
            onEnd={() => {
              onEnd && onEnd();
            }}
          />
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000'
  },
  topView: {
    top: Platform.OS === 'ios' ? statusBarHeight : 0,
    left: 0,
    height: 45,
    position: 'absolute',
    width: '100%'
  },
  backBtn: {
    height: 45,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center'
  },
  btn: {
    marginLeft: 10,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
    height: 40,
    borderRadius: 20,
    width: 40,
  }
});
