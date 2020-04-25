// @ts-ignore
/** @typedef {import('./node_modules/@types/slimerjs/index').require} require */

/** @type {SystemModule} */
// @ts-ignore
const { args } = require('system');

const { readFileSync, writeFileSync, existsSync } = require('fs');
const chalk = require('chalk');

const logSymbol = '\ue7a2';
const infoSymbol = '\uf129';
const errorSymbol = '\ue009';
const warnSymbol = '\uf071';

/** @param {any[]} args */
function log(...args) {
    const date = new Date();
    const dateString = `[${date.toDateString().slice(4)} ${date.toLocaleTimeString()}]`; // Ex: [Apr 05 2020 7:29:46 PM]

      console.log(chalk.whiteBright.bgGreen(` ${logSymbol} ${dateString} `), ...args);
}

/** @param {any[]} args */
function info(...args) {
    const date = new Date();
    const dateString = `[${date.toDateString().slice(4)} ${date.toLocaleTimeString()}]`; // Ex: [Apr 05 2020 7:29:46 PM]

    console.info(chalk.whiteBright.bgBlueBright(` ${infoSymbol} ${dateString} `), ...args);
}

/** @param {any[]} args */
function error(...args) {
    const date = new Date();
    const dateString = `[${date.toDateString().slice(4)} ${date.toLocaleTimeString()}]`; // Ex: [Apr 05 2020 7:29:46 PM]

      console.error(chalk.whiteBright.bgRed(` ${errorSymbol} ${dateString} `), ...args);
}

/** @param {any[]} args */
function warn(...args) {
    const date = new Date();
    const dateString = `[${date.toDateString().slice(4)} ${date.toLocaleTimeString()}]`; // Ex: [Apr 05 2020 7:29:46 PM]

      console.warn(chalk.whiteBright.bgRedBright(` ${warnSymbol} ${dateString} `), ...args);
}

// Flags
let firstOpen = true;
let refreshing = false;
let channelPoints = -1;

function importGet(file) {
    return new Function(readFileSync(file, 'utf8'))();
}

// Get default values
const defaultConfig = importGet('twitchAFKConfig.def.js');

let configPath = 'twitchAFKConfig.js';
const configBuffer = {};
let channel;

// Process command line args
if (args.length > 1) {
    for (let i = 1; i < args.length; i++) {
        let key, val;
        switch (args[i].toLowerCase()) {
            case '-u':
                val = args[++i];
                if (!val) {
                    error('-u argument missing follow-up argument!');
                    error('Usage: slimerjs -P twitchAFK twitchAFK.js -u [username]');
                    phantom.exit(1);
                }
                configBuffer.username = val;
                break;
            case '-p':
                val = args[++i];
                if (!val) {
                    error('-u argument missing follow-up argument!');
                    error('Usage: slimerjs -P twitchAFK twitchAFK.js -p [password]');
                    phantom.exit(1);
                }
                configBuffer.password = val;
                break;
            case '-c':
                val = args[++i];
                if (!val) {
                    error('-u argument missing follow-up argument!');
                    error('Usage: slimerjs -P twitchAFK twitchAFK.js -c [config filename or path]');
                    phantom.exit(1);
                }
                configPath = val;
                break;
            case '-k':
                key = args[++i];
                val = args[++i];
                if (!val) {
                    error('-u argument missing follow-up argument!');
                    error('Usage: slimerjs -P twitchAFK twitchAFK.js -k [key] [value]');
                    phantom.exit(1);
                }
                configBuffer[key] = val;
                break;
            default:
                if (i === args.length - 1) {
                    channel = args[i];
                }
                break;
        }
    }
}

// Get config
configPath = configPath.replace(/\.[^/.]+$/, '');
if (!existsSync(configPath)) {
    log('No config file found, creating a new one...');
    writeFileSync('twitchAFKConfig.js', readFileSync('twitchAFKConfig.def.js', 'utf8'));
}
const config = importGet('twitchAFKConfig.js');
log('Loaded config.');

// Parse config changes from configBuffer
for (const [key, value] of Object.entries(configBuffer)) {
    switch (typeof defaultConfig[key]) {
        case 'string':
            config[key] = value;
            break;
        case 'number':
            const float = parseFloat(value);
            if (float) config[key] = float;
            else log(`Config key ${key} requires a number. ${value} is not a valid number.`);
            break;
        case 'boolean':
            const valueLower = value.toLowerCase();

            if (valueLower === 'true') config[key] = true;
            else if (valueLower === 'false') config[key] = false;
            else log(`Config key ${key} requires true or false. ${value} is neither.`);
            break;
        default:
            log(`Invalid type in defaultConfigString: ${typeof defaultConfig[key]}`);
            break;
    }
}

// Find any missing config values, add their default version to config
for (const key of Object.keys(defaultConfig)) {
    if (!(key in config)) {
        log(`The config value '${key}' is missing, using default value of '${defaultConfig[key]}' instead!`);
        config[key] = defaultConfig[key];
    }
}

// Set channel if it hasn't been set by args
if (!channel) {
    channel = config.channel;
}

// Handle and format top-level errors
// Called 'script errors' by SlimerJS, but I'm calling them 'SlimerJS errors' which I think is more understandable to users
phantom.onError = (msg, stack) => {
    if (!config.printSlimerErrors) return;
    log(`[SlimerJS Error] ${msg}`);

    if (config.printSlimerErrorsStack && stack && stack.length) {
        for (const s of stack) {
            // Modified from https://docs.slimerjs.org/current/api/phantom.html#onerror
            //log(`[SlimerJS Error] -> ${s.file || s.sourceURL}: ${s.line} ${s.function ? `(in function ${s.function})` : ''}`);
            log(`[SlimerJS Error] -> ${s}`);
        }
    }
}

// Convert channel name into proper Twitch URL
const streamURL = 'https://twitch.tv/' + channel;

/** @type {WebPage} */
// @ts-ignore
const page = require('webpage').create();

// Change user-agent to mask SlimerJS
page.settings.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:59.0) Gecko/20100101 Firefox/59.0';

// Set application resolution
page.viewportSize = {
    width: config.width,
    height: config.height
};

// Handle in-page console messages
if (config.printJSConsole) {
    page.onConsoleMessage = msg => {
        log(`[In-page Console] ${msg}`);
    };
}

// Handle in-page JavaScript errors
if (config.printJSErrors) {
    page.onError = (msg, stack) => {
        let errorMsg = 'In-page JavaScript error occured:\n' + msg;
        if (config.printJSErrorsStack && stack.length) {
            errorMsg += '\n	Stack:';

            const stackPrint = s => {
                // Shamelessly stolen from: http://phantomjs.org/api/webpage/handler/on-error.html
                let stackMsg = `-> ${s.file}: ${s.line}`;
                if (s.function) {
                    stackMsg += ` (in function '${s.function}')`;
                }

                // Split long (80+ character) stacks into multiple lines.
                // Otherwise it becomes impossible to read.
                const lines = Math.ceil(stackMsg.length / 80);

                if (lines > 1) {
                    let stackMsgTabbed = "";

                    for (let i = 0; i < lines - 1; i++) {
                        stackMsgTabbed += "\n		" + stackMsg.slice(80 * i, 81 + (80 * i));
                    }
                    stackMsgTabbed += "\n		" + stackMsg.slice(80 * (lines - 1));

                    errorMsg += stackMsgTabbed;
                } else {
                    errorMsg += "\n		" + stackMsg;
                }
            }

            // If verbose, print the entire stack.
            // If not, print only the last line.
            if (!config.printJSErrorsStackVerbose) {
                stackPrint(stack[stack.length - 1]);
            } else {
                for (const s of stack) {
                    stackPrint(s);
                }
            }
        }
        log(errorMsg);
    };
}

twitchLogin().then(openStream);

/**
 * @param {number} time
 * @param {NodeJS.Timeout[]} handleArr
 * @returns {Promise}
 */
function asyncTimeout(time, handleArr = []) {
    return new Promise(resolve => handleArr[0] = setTimeout(resolve, time));
}

async function twitchLogin() {
    // Wait for Twitch to finish logging in...
    async function finalizeLogin(loginTimeout = 60000) {
        await repeatUntilTrue(() => page.cookies.filter(cookie => cookie.name.includes('login')).length, loginTimeout);

        // Give it a little extra time, just in case the cookie isn't quite in line with the login
        await asyncTimeout(1000);

        log('Logged into Twitch!');
        return 'Successfully logged in!';
    }

    while (true) {
        const status = await page.open('https://www.twitch.tv');
        if (status != 'success') {
            log('Shit, the Twitch homepage failed to load, retrying in 15s...');
            asyncTimeout(15000);
            continue;
        }

        mutePage();

        // Is the user already logged in via slimer's profile system? If so, skip past the login.
        if (page.cookies.filter(cookie => cookie.name.includes('login')).length) {
            log(`You're already logged in to Twitch. Good on you.`);

            return true;
        } else {
            log('Logging into Twitch...');

            // Inject jQuery for maximum crutch
            // Undocumented behavior: injectJs returns true if it's successful, like the original phantomJs specification
            if (!page.injectJs('jquery-3.3.1.min.js')) {
                error('Failed to inject jQuery. How does this even happen?');
                phantom.exit(2);
            }

            page.evaluate(() => $('[data-a-target="login-button"]')[0].click());

            await asyncTimeout(5000);

            await repeatUntilTrue(() => page.evaluate(() => $('[autocomplete=username]').is(':visible')), 15000);

            if (!page.evaluate(() => {
                $('[autocomplete=username]').click();
                $('[autocomplete=username]').focus();
                return true;
            })) {
                error('Unusual error when accessing the username field!');
                phantom.exit(1);
            }

            page.sendEvent('keypress', config.username);

            if (!page.evaluate(() => {
                $('[autocomplete=current-password]').click();
                $('[autocomplete=current-password]').focus();
                return true;
            })) {
                error('Unusual error when accessing the password field!');
                phantom.exit(1);
            }

            page.sendEvent('keypress', config.password);
            page.evaluate(() => $('[data-a-target=passport-login-button]').click());

            try {
                await repeatUntilTrue(() => {
                    /* 	If furtherAuthDetection is enabled, we check for the login window to remain visible
                        If not, just check for the login cookie like normal
                        I honestly can't think of an edge case where you wouldn't want it enabled, but who knows? */
                    if (config.furtherAuthDetection) {
                        return page.evaluate(() => !$('[data-a-target="passport-modal"]').is(':visible'));
                    } else {
                        return true;
                    }
                }, 30000);

                return await finalizeLogin();
            } catch (ex) {
                log('Further authentication required. Waiting 10 minutes for user input...');
                return await finalizeLogin(600000);
            }
        }
    }
}

async function acceptMatureWarning() {
    // Give the mature warning a little time to load...
    await asyncTimeout(3500);

    if (!page.evaluate(() => {
        if ($('[data-a-target="player-overlay-mature-accept"]').is(':visible')) {
            $('[data-a-target="player-overlay-mature-accept"]').click();
        }
        return true;
    })) {
        warn('Unusually errored when attempting to accept mature warning');
    }
}

async function setAppropriateMuteStatus() {
    await repeatUntilTrue(() => page.evaluate(() => $('[data-a-target="player-mute-unmute-button"]').is(':visible')), 15000);

    if (!config.streamAudio) {
        page.evaluate(() => {
            // Check if stream is unmuted, mute if it is
            if ($('[data-a-target="player-mute-unmute-button"]').attr('aria-label').includes("Mute")) {
                $('[data-a-target="player-mute-unmute-button"]').click();
            }
        });
    } else {
        page.evaluate(() => {
            // Check if stream is muted, unmute if it is
            if (!$('[data-a-target="player-mute-unmute-button"]').attr('aria-label').includes("Mute")) {
                $('[data-a-target="player-mute-unmute-button"]').click();
            }
        });
    }
}

function applyQualitySetting() {
    // Check first to see if the quality options exist...
    if (!page.evaluate(() => {
        $('[data-a-target="player-settings-button"]').click();
        return $('[data-a-target="player-settings-menu-item-quality"]').is(':visible');
    })) {
        log("No quality options found. Perhaps the stream is offline?");
    }

    if (!page.evaluate(quality => {
        // Open up the quality options
        $('[data-a-target="player-settings-menu-item-quality"]').click();

        var qualityButtons = $('.tw-radio[data-a-target="player-settings-submenu-quality-option"]').children('input');

        // I think this helps to keep the quality options box open.
        // Who knows?
        qualityButtons[0].focus();

        if (quality.includes("MAX") || quality.includes("SOURCE")) {
            qualityButtons[1].click();
        } else if (quality.includes("MIN")) {
            qualityButtons[qualityButtons.length - 1].click();
        } else if (quality.includes("AUTO")) {
            qualityButtons[0].click();
        } else {
            // Get all of the available qualities, in string form
            var qualities = [];
            for (var i = 0; i < qualityButtons.length; i++) {
                qualities.push($('.tw-radio[data-a-target="player-settings-submenu-quality-option"]').children('label').children('div')[i].textContent.toUpperCase());
            }

            // Look for matching qualities for maxQuality
            var qualityMatches = [];
            for (var k = 0; k < qualities.length; k++) {
                if (qualities[k].includes(quality)) qualityMatches.push(k);
            }

            if (qualityMatches.length > 1) {
                // If we have more than one match (probably [quality] (Source) and [quality]), choose the second
                qualityButtons[qualityMatches[1]].click();
            } else if (qualityMatches.length === 1) {
                // If we have a single match, that's the one we want
                qualityButtons[qualityMatches[0]].click();
            } else {
                // If we have no matches, the quality isn't avaiable, and we only have LOWER qualities to choose from
                // Let's choose the highest quality that isn't Auto
                qualityButtons[1].click();
            }
        }

        return true;
    }, config.maxQuality.toUpperCase())) {
        warn('Failed to apply quality options');
    }
}

function acceptChatRules() {
    // Check for chat rules, accept them if they exist.
    // Executed after quality setting, to avoid interfering with it.
    page.evaluate(() => {
        var chatInput = $('[data-a-target="chat-input"]');

        chatInput.focus();
        chatInput.click();

        setTimeout(() => {
            if ($('[data-test-selector="chat-rules-ok-button"]').is(':visible')) {
                $('[data-test-selector="chat-rules-ok-button"]').click();
            }
        }, 1000);
    });
}

async function openStream() {
    refreshing = true;

    const status = await page.open(streamURL);

    if (status != 'success') {
        log("Shit, the stream failed to load, retrying in 15s...");
        setTimeout(openStream, 15000);
        return;
    }
    log('Stream opened.');

    page.switchToMainFrame();

    // Inject jQuery for maximum crutch
    if (!page.injectJs('jquery-3.3.1.min.js')) {
        error('Failed to inject jQuery. How does this even happen?');
        phantom.exit(2);
    }

    if (firstOpen) {
        await acceptMatureWarning();

        await setAppropriateMuteStatus();

        // Switch to theatre mode
        page.evaluate(() => $('[data-a-target="player-theatre-mode-button"]').click());

        applyQualitySetting();

        acceptChatRules();

        refreshing = false;
        firstOpen = false;

        pausePlayLoop();

        // Check to make sure that channel points are active on the channel before enabling related features
        if (page.evaluate(() => $('.community-points-summary').is(':visible')) && config.claimBonusPoints) {
            if (config.claimBonusPoints) claimBonusPointsLoop();
            if (config.pointTracker) pointTrackerLoop();
        }

        refreshLoop();
    } else {
        page.evaluate(() => $('[data-a-target="player-theatre-mode-button"]').click());

        refreshing = false;

        log("Stream refreshed!");
    }
}

async function pausePlayLoop() {
    while (true) {
        if (refreshing) {
            log("Tried to pause during a refresh, waiting 15s...");
            await asyncTimeout(15000);
            continue;
        }

        await asyncTimeout(randomRate(config.minPauseRate, config.maxPauseRate));

        log("Pausing stream!");

        if (page.evaluate(() => {
            $('[data-a-target="player-play-pause-button"]').click();
            return true;
        })) {
            await asyncTimeout(Math.floor(5000 + (Math.random() * 12000)));

            if (page.evaluate(() => {
                $('[data-a-target="player-play-pause-button"]').click();
                return true;
            })) {
                log("Resuming stream.");
            }
        }
    }
}

async function refreshLoop() {
    while (true) {
        await asyncTimeout(randomRate(config.minRefreshRate, config.maxRefreshRate));
        log("Refreshing stream!");

        openStream();
    }
}

async function claimBonusPointsLoop() {
    while (true) {
        if (!refreshing) {
            // This is honestly a pretty bad way to select the button, as it's not very resistant to layout changes.
            // I can't think of a better way, though, due to a lack of unique class or attribute names...
            if (page.evaluate(() => {
                var pointsButtons = $('.community-points-summary').find($('button'));
                if (pointsButtons.length > 1) {
                    pointsButtons[1].click();
                    return true;
                }
            })) {
                // Wait for a bit to avoid that point animation shebang
                await asyncTimeout(3000);

                // Different layouts for point tracking enabled vs disabled
                // Should make logs more searchable/readable
                if (!config.pointTracker) {
                    log(`Bonus points claimed! Channel points are up to ${getCurrentPoints()} now.`);
                } else {
                    log("Bonus points claimed!");
                    log(`Current channel points: ${getCurrentPoints()}.`);
                }
            }
        }

        // Set to check every 15 seconds. I think that seems reasonable?
        await asyncTimeout(15000);
    }
}

async function pointTrackerLoop() {
    while (true) {
        if (!refreshing) {
            const curPoints = getCurrentPoints();

            if (curPoints > channelPoints) {
                channelPoints = curPoints;
                log(`Current channel points: ${curPoints}.`);
            }

            await asyncTimeout(config.pointTrackerRate * 60000);
        } else {
            await asyncTimeout(15000);
        }
    }
}

function getCurrentPoints() {
    // Get text from the tooltip, remove all the non-numbers, and then parse as an int
    return page.evaluate(() => parseInt($('.community-points-summary').find($('[data-a-target="tw-tooltip-label"]')).first().text().replace(/[^0-9]/g, '')));
}

// Stolen (and then modified) from https://github.com/ariya/phantomjs/blob/master/examples/waitfor.js
/**
 * @param {string | Function} condition
 * @param {number} timeOutMillis
 * @returns {Promise}
 */
function repeatUntilTrue(condition, timeOutMillis = 44445) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
            if (Date.now() - start < timeOutMillis) {
                if (typeof condition === 'function' ? condition() : eval(condition)) {
                    clearInterval(interval);
                    resolve();
                }
            } else {
                // Timed out
                clearInterval(interval);
                reject();
            }
        }, 250); //< repeat check every 250ms
    }).catch(() => {
        log("Critical timeout, twitchAFK is exiting.");
        phantom.exit(1);
    });
};

// Mute any video on the page.
function mutePage() {
    page.evaluate(() => document.querySelectorAll('video').forEach(video => video.muted = true));
}

// Used for debug purposes
function screenshot() {
    page.render('currentscreen.png');
}

/**
 * @param {number} min
 * @param {number} max
 */
function randomRate(min, max) {
    return Math.floor((min + ((max - min) * Math.random())) * 60000);
}
