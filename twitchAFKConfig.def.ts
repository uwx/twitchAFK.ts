export default {
  //
  // Credentials
  //

  // Twitch username
  username: 'AzureDiamond',

  // Twitch password
  password: 'hunter2',

  //
  // Config
  //

  // Channel name to AFK at, UNLESS SPECIFIED VIA COMMAND LINE ARGUMENT
  channel: 'sleepydragn1',

  // Detect reCAPTCHAs, 2FA, or other authentication methods after login and pause for user input. true for enabled, false for disabled.
  furtherAuthDetection: true,

  // How long to wait for the user to handle further authentication. Set to -1 to wait forever.
  furtherAuthTimeout: -1,

  // Determines if the stream has its audio muted or not. Should have no effect on drops. true to enable audio, false to disable it.
  streamAudio: false,

  //
  // Video Quality
  //

  // Maximum video quality setting to use
  // Possible Values:
  // 'MAX' or 'SOURCE'
  // 'AUTO'
  // '1080p60'
  // '1080p'
  // '720p60'
  // '720p'
  // '480p'
  // '360p'
  // '160p'
  // 'MIN'
  maxQuality: 'MIN',

  //
  // Application Resolution
  //

  // Whether or not to show the Chrome window while the program runs. If true, window is hidden.
  headless: true,

  // Width of the application window. Does not affect the stream resolution.
  width: 1280,
  // Height of the application window. Does not affect the stream resolution.
  height: 720,

  //
  // Refresh Rate
  //

  // Minimum rate of how often the page should be refreshed in minutes
  minRefreshRate: 30,

  // Maximum rate of how often the page should be refreshed in minutes
  maxRefreshRate: 45,

  //
  // Pause Rate
  //

  // Minimum rate of how often to pause the stream in minutes
  minPauseRate: 3,

  // Maximum rate of how often to pause the stream in minutes
  maxPauseRate: 7,

  //
  // Channel Points
  //

  // Claims bonus channel points when they pop up. true for enabled, false for disabled.
  claimBonusPoints: true,

  // Keeps track of channel points and outputs to the console when they increase. true for enabled, false for disabled.
  pointTracker: true,

  // The rate at which channel points are checked and messages are sent out, in minutes
  pointTrackerRate: 2,

  // Whether or not to accept chat rules on load if prompted
  acceptChatRules: false,

  //
  // Debug
  //

  printSlimerErrors: true, // Output SlimerJS related error messages. true for enabled, false for disabled.
  printSlimerErrorsStack: true, // Output SlimerJS stack traces as well. Requires printSlimerErrors to be enabled. true for enabled, false for disabled.
  printJSConsole: true, // Output in-page console messages. true for enabled, false for disabled.
  printJSErrors: true, // Output in-page JavaScript errors. true for enabled, false for disabled.
  printJSErrorsStack: true, // Output stack traces as well. Requires printJSErrors to be enabled. true for enabled, false for disabled.
  printJSErrorsStackVerbose: false, // If true, prints THE WHOLE STACK. If false, only prints the last line. Requires printJSErrors and printJSErrorsStack to be enabled.
};
