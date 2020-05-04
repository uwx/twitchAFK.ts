import { readFileSync, writeFileSync, existsSync, promises } from 'fs';
const { readFile, writeFile } = promises;
import { argv } from 'process';
import * as path from 'path';

import * as chalk from 'chalk';
import puppeteer from 'puppeteer-extra';
import StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const args = argv.slice(3);

const logSymbol = '\ue7a2';
const infoSymbol = '\uf129';
const errorSymbol = '\ue009';
const warnSymbol = '\uf071';

function log(...args: any[]) {
    const date = new Date();
    const dateString = `[${date.toDateString().slice(4)} ${date.toLocaleTimeString()}]`; // Ex: [Apr 05 2020 7:29:46 PM]

    console.log(chalk.whiteBright.bgGreen(` ${logSymbol} ${dateString} `), ...args);
}

function info(...args: any[]) {
    const date = new Date();
    const dateString = `[${date.toDateString().slice(4)} ${date.toLocaleTimeString()}]`; // Ex: [Apr 05 2020 7:29:46 PM]

    console.info(chalk.whiteBright.bgBlueBright(` ${infoSymbol} ${dateString} `), ...args);
}

function error(...args: any[]) {
    const date = new Date();
    const dateString = `[${date.toDateString().slice(4)} ${date.toLocaleTimeString()}]`; // Ex: [Apr 05 2020 7:29:46 PM]

    console.error(chalk.whiteBright.bgRed(` ${errorSymbol} ${dateString} `), ...args);
}

function warn(...args: any[]) {
    const date = new Date();
    const dateString = `[${date.toDateString().slice(4)} ${date.toLocaleTimeString()}]`; // Ex: [Apr 05 2020 7:29:46 PM]

    console.warn(chalk.whiteBright.bgRedBright(` ${warnSymbol} ${dateString} `), ...args);
}

const consoleX = {log, info, error, warn};

// Flags
let firstOpen = true;
let refreshing = false;
let channelPoints = -1;

function importGet(file: string | number | Buffer | import('url').URL) {
    return new Function(readFileSync(file, 'utf8'))();
}

type Config = typeof import('./twitchAFKConfig.def').default;

// Get default values
const defaultConfig: Config = require('./twitchAFKConfig.def').default;

let configPath = 'twitchAFKConfig.ts';
const configBuffer: {
    [P in keyof Config]?: string
} = {};

// Process command line args
if (args.length > 1) {
    for (let i = 1; i < args.length; i++) {
        let key: string, val: string;
        switch (args[i].toLowerCase()) {
            case '-u':
                val = args[++i];
                if (!val) {
                    error('-u argument missing follow-up argument!');
                    error('Usage: node twitchAFK -u [username]');
                    process.exit(1);
                }
                configBuffer.username = val;
                break;
            case '-p':
                val = args[++i];
                if (!val) {
                    error('-u argument missing follow-up argument!');
                    error('Usage: node twitchAFK -p [password]');
                    process.exit(1);
                }
                configBuffer.password = val;
                break;
            case '-c':
                val = args[++i];
                if (!val) {
                    error('-u argument missing follow-up argument!');
                    error('Usage: node twitchAFK -c [config filename or path]');
                    process.exit(1);
                }
                configPath = val;
                break;
            case '-k':
                key = args[++i];
                val = args[++i];
                if (!val) {
                    error('-u argument missing follow-up argument!');
                    error('Usage: node twitchAFK -k [key] [value]');
                    process.exit(1);
                }
                configBuffer[key] = val;
                break;
            default:
                if (i === args.length - 1) {
                    configBuffer.channel = args[i];
                }
                break;
        }
    }
}

// Get config
configPath = configPath.replace(/^\.\//, '');
if (!existsSync(configPath)) {
    log('No config file found, creating a new one...');
    writeFileSync(configPath, readFileSync('twitchAFKConfig.def.ts', 'utf8'));
}
const config: Config = require('./twitchAFKConfig').default;
log('Loaded config.');

// Parse config changes from configBuffer
for (const [key, value] of Object.entries(configBuffer)) {
    switch (typeof defaultConfig[key]) {
        case 'string':
            config[key] = value;
            break;
        case 'number':
            const num = Number(value);
            if (!isNaN(num)) config[key] = num;
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

// Convert channel name into proper Twitch URL
const streamURL = 'https://twitch.tv/' + config.channel;

let page: import('puppeteer').Page;

function listenPrintJSConsole() {
    page.on('console', message => {
        const type = message.type();
        if (type in consoleX) {
            consoleX[type](`[In-page Console] ${message.text()}`);
        } else {
            log(`[In-page Console: ${type}] ${message.text()}`);
        }
    });
}

function listenPrintJSErrors() {
    page.on('pageerror', ({message, stack}) => {
        let errorMsg = 'In-page JavaScript error occured:\n' + message;
        if (config.printJSErrorsStack && stack) {
            errorMsg += '\n	Stack:';

            function stackPrint(s: string) {
                let stackMsg = `-> ${s}`;

                // Split long (80+ character) stacks into multiple lines.
                // Otherwise it becomes impossible to read.
                const lines = Math.ceil(stackMsg.length / 80);

                if (lines > 1) {
                    let stackMsgTabbed = '';

                    for (let i = 0; i < lines - 1; i++) {
                        stackMsgTabbed += '\n		' + stackMsg.slice(80 * i, 81 + (80 * i));
                    }
                    stackMsgTabbed += '\n		' + stackMsg.slice(80 * (lines - 1));

                    errorMsg += stackMsgTabbed;
                } else {
                    errorMsg += '\n		' + stackMsg;
                }
            }

            // If verbose, print the entire stack.
            // If not, print only the last line.
            if (!config.printJSErrorsStackVerbose) {
                const stackSplit = stack.split('\n');
                stackPrint(stackSplit[stackSplit.length - 1]);
            } else {
                for (const s of stack.split('\n')) {
                    stackPrint(s);
                }
            }
        }
        error(errorMsg);
    });
}

function listPuppeteerErrors() {
    page.on('error', ({message, stack}) => {
        if (!config.printSlimerErrors) return;
        error(`[Puppeteer] ${message}`);

        if (config.printSlimerErrorsStack && stack) {
            for (const s of stack.split('\n')) {
                // Modified from https://docs.slimerjs.org/current/api/phantom.html#onerror
                error(`[Puppeteer] -> ${s}`);
            }
        }
    });
}

/**
 * @param {number} time
 * @param {NodeJS.Timeout[]} handleArr
 * @returns {Promise}
 */
function asyncTimeout(time: number, handleArr: NodeJS.Timeout[] = []): Promise<any> {
    return new Promise(resolve => handleArr[0] = setTimeout(resolve, time));
}

async function isLoggedIn(): Promise<boolean> {
    return !!(await page.cookies()).filter(cookie => cookie.name.includes('login')).length;
}

async function twitchLogin(): Promise<boolean> {
    // Is the user already logged in via Chrome's profile system? If so, skip past the login.
    if (await isLoggedIn()) {
        log(`You're already logged in to Twitch. Good on you.`);
        return;
    }

    while (true) {
        const status = await page.goto('https://www.twitch.tv', {waitUntil: 'networkidle2'});
        if (!status.ok()) {
            log(`The Twitch homepage failed to load (${status.status()} ${status.statusText()}), retrying in 15s...`);
            await asyncTimeout(15000);
            continue;
        }
        break;
    }

    await mutePage();

    log('Logging into Twitch...');

    let extendedTimeout = false;

    // Inject jQuery for maximum crutch
    await page.evaluate(await readFile('jquery-3.3.1.min.js', 'utf8'));

    await page.click('[data-a-target="login-button"]');

    await asyncTimeout(5000);

    await repeatEvalUntilTrue(() => $('[autocomplete=username]').is(':visible'), 15000);

    await page.focus('[autocomplete=username]');
    await page.keyboard.type(config.username);

    await page.focus('[autocomplete=current-password]');
    await page.keyboard.type(config.password);

    await page.click('[data-a-target=passport-login-button]');

    try {
        if (config.furtherAuthDetection) {
            // If furtherAuthDetection is enabled, we check for the login window to remain visible
            // If not, just check for the login cookie like normal
            // I honestly can't think of an edge case where you wouldn't want it enabled, but who knows?

            if (await page.evaluate(() => $('[data-a-target="passport-modal"]').is(':visible'))) {
                info('Further auth necessary. If this requires browser input, please run with the `headless` option set to `false`.')
            }

            if (config.furtherAuthTimeout === -1) {
                while (true) {
                    if (await page.evaluate(() => !$('[data-a-target="passport-modal"]').is(':visible'))) {
                        break;
                    }
                    await asyncTimeout(250);
                }
            } else {
                await repeatEvalUntilTrue(() => !$('[data-a-target="passport-modal"]').is(':visible'), 30000);
            }
        }
    } catch (ex) {
        log('Further authentication required. Waiting 10 minutes for user input...');
        extendedTimeout = true;
    }

    // Wait for Twitch to finish logging in...
    await repeatUntilTrue(async () => await isLoggedIn(), extendedTimeout ? 600_000 : 60_000);

    // Give it a little extra time, just in case the cookie isn't quite in line with the login
    await asyncTimeout(1000);

    log('Logged into Twitch!');
}

async function acceptMatureWarning() {
    // Give the mature warning a little time to load...
    await asyncTimeout(3500);

    if (!await page.evaluate(() => {
        if ($('[data-a-target="player-overlay-mature-accept"]').is(':visible')) {
            $('[data-a-target="player-overlay-mature-accept"]').click();
        }
        return true;
    })) {
        warn('Unusually errored when attempting to accept mature warning');
    }
}

async function setAppropriateMuteStatus() {
    await repeatEvalUntilTrue(() => $('[data-a-target="player-mute-unmute-button"]').is(':visible'), 15000);

    if (!config.streamAudio) {
        await page.evaluate(() => {
            // Check if stream is unmuted, mute if it is
            if ($('[data-a-target="player-mute-unmute-button"]').attr('aria-label').includes('Mute')) {
                $('[data-a-target="player-mute-unmute-button"]').click();
            }
        });
    } else {
        await page.evaluate(() => {
            // Check if stream is muted, unmute if it is
            if (!$('[data-a-target="player-mute-unmute-button"]').attr('aria-label').includes('Mute')) {
                $('[data-a-target="player-mute-unmute-button"]').click();
            }
        });
    }
}

async function applyQualitySetting() {
    // Check first to see if the quality options exist...
    if (!await page.evaluate(() => {
        $('[data-a-target="player-settings-button"]').click();
        return $('[data-a-target="player-settings-menu-item-quality"]').is(':visible');
    })) {
        log('No quality options found. Perhaps the stream is offline?');
    }

    if (!await page.evaluate(quality => {
        // Open up the quality options
        $('[data-a-target="player-settings-menu-item-quality"]').click();

        var qualityButtons = $('.tw-radio[data-a-target="player-settings-submenu-quality-option"]').children('input');

        // I think this helps to keep the quality options box open.
        // Who knows?
        qualityButtons[0].focus();

        if (quality.includes('MAX') || quality.includes('SOURCE')) {
            qualityButtons[1].click();
        } else if (quality.includes('MIN')) {
            qualityButtons[qualityButtons.length - 1].click();
        } else if (quality.includes('AUTO')) {
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

async function acceptChatRules() {
    // Check for chat rules, accept them if they exist.
    // Executed after quality setting, to avoid interfering with it.
    await page.evaluate(() => {
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

async function startBackgroundActions() {
    function getErrorHandler(funcName: string) {
        return (reason: any) => {
            error(`Unknown error in ${funcName}: ${reason}`)
        }
    }

    pausePlayLoop().catch(getErrorHandler('pausePlayLoop'));

    // Check to make sure that channel points are active on the channel before enabling related features
    if (await page.evaluate(() => $('.community-points-summary').is(':visible')) && config.claimBonusPoints) {
        if (config.claimBonusPoints) claimBonusPointsLoop().catch(getErrorHandler('claimBonusPointsLoop'));
        if (config.pointTracker) pointTrackerLoop().catch(getErrorHandler('pointTrackerLoop'));
    }

    refreshLoop().catch(getErrorHandler('refreshLoop'));
}

async function openStream() {
    refreshing = true;

    const status = await page.goto(streamURL, {waitUntil: 'networkidle2'});

    if (!status.ok()) {
        log(`The Twitch homepage failed to load (${status.statusText()}), retrying in 15s...`);
        await asyncTimeout(15000);
        return await openStream();
    }
    log('Stream opened.');

    // Inject jQuery for maximum crutch
    await page.evaluate(await readFile('jquery-3.3.1.min.js', 'utf8'));

    if (firstOpen) {
        await acceptMatureWarning();

        await setAppropriateMuteStatus();

        // Switch to theatre mode
        await page.click('[data-a-target="player-theatre-mode-button"]');

        await applyQualitySetting();

        if (config.acceptChatRules) await acceptChatRules();

        refreshing = false;
        firstOpen = false;

        await startBackgroundActions();
    } else {
        await page.click('[data-a-target="player-theatre-mode-button"]');

        refreshing = false;

        log('Stream refreshed!');
    }
}

async function pausePlayLoop() {
    while (true) {
        if (refreshing) {
            log('Tried to pause during a refresh, waiting 15s...');
            await asyncTimeout(15000);
            continue;
        }

        await asyncTimeout(randomRate(config.minPauseRate, config.maxPauseRate));

        log('Pausing stream!');

        if (await page.evaluate(() => {
            $('[data-a-target="player-play-pause-button"]').click();
            return true;
        })) {
            await asyncTimeout(Math.floor(5000 + (Math.random() * 12000)));

            if (await page.evaluate(() => {
                $('[data-a-target="player-play-pause-button"]').click();
                return true;
            })) {
                log('Resuming stream.');
            }
        }
    }
}

async function refreshLoop() {
    while (true) {
        await asyncTimeout(randomRate(config.minRefreshRate, config.maxRefreshRate));
        log('Refreshing stream!');

        await openStream();
    }
}

async function claimBonusPointsLoop() {
    while (true) {
        if (!refreshing) {
            // This is honestly a pretty bad way to select the button, as it's not very resistant to layout changes.
            // I can't think of a better way, though, due to a lack of unique class or attribute names...
            if (await page.evaluate(() => {
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
                    log('Bonus points claimed!');
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
            const curPoints = await getCurrentPoints();

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

async function getCurrentPoints() {
    // Get text from the tooltip, remove all the non-numbers, and then parse as an int
    return await page.evaluate(() => parseInt($('.community-points-summary').find($('[data-a-target="tw-tooltip-label"]')).first().text().replace(/[^0-9]/g, '')));
}

// Stolen (and then modified) from https://github.com/ariya/phantomjs/blob/master/examples/waitfor.js
async function repeatUntilTrue(condition: string | (() => boolean | Promise<boolean>), timeOutMillis: number = 44445): Promise<any> {
    try {
        const start = Date.now();
        while (true) {
            if (Date.now() - start < timeOutMillis) {
                if (typeof condition === 'function' ? await condition() : await eval(condition)) {
                    return true;
                }
            } else {
                // Timed out
                throw new Error('Timed out');
            }
            await asyncTimeout(250);
        }
    } catch (e) {
        log('Critical timeout, twitchAFK is exiting.');
        process.exit(1);
    }
}

async function repeatEvalUntilTrue(condition: () => boolean, timeOutMillis: number = 44445) {
    await repeatUntilTrue(() => page.evaluate(condition), timeOutMillis);
}

// Mute any video on the page.
async function mutePage() {
    await page.evaluate(() => document.querySelectorAll('video').forEach(video => video.muted = true));
}

// Used for debug purposes
async function screenshot() {
    await writeFile('currentscreen.png', page.screenshot({
        encoding: 'binary'
    }));
}

/**
 * @param {number} min
 * @param {number} max
 */
function randomRate(min: number, max: number) {
    return Math.floor((min + ((max - min) * Math.random())) * 60000);
}

const requestBlacklist = [
    //'static-cdn.jtvnw.net/badges',
    //'static-cdn.jtvnw.net/jtv_user_pictures/',
    //'web-cdn.ttvnw.net/images/xarth/bg_glitch_pattern.png',
    ///*'service-worker.js',
    //'serviceworker.js',*/
    //'static.twitchcdn.net/assets/Roobert-',
    //'static.twitchcdn.net/assets/gift',
    //'static-cdn.jtvnw.net/user-default-pictures/',
    //'static-cdn.jtvnw.net/emoticons/'
];

(async () => {
    const browser = await puppeteer.launch({
        executablePath: `C:\\SSDPrograms\\chrlauncher\\ungoogled-chromium_80.0.3987.149-2.1_windows\\chrome.exe`,

        // Set application resolution
        defaultViewport: {
            width: config.width,
            height: config.height
        },

        headless: config.headless,

        userDataDir: path.join(__dirname, 'Chrome User Data'),

        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
        ]
    });

    page = await browser.newPage();

    /*await page.setRequestInterception(true);
    page.on('request', request => {
        try {
            const reqUrl = request.url();
            for (const blacklistItem of requestBlacklist) {
                if (reqUrl.includes(blacklistItem)) {
                    request.abort();
                    return;
                }
            }
            request.continue();
        } catch (err) {
            warn('Already handled:', request.url(), (''+err).slice(0, (''+err).indexOf('\n')));
        }
    });*/

    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36');

    await page.goto(streamURL, {waitUntil: 'networkidle2'});

    // Handle in-page console messages
    if (config.printJSConsole) {
        listenPrintJSConsole();
    }

    // Handle in-page JavaScript errors
    if (config.printJSErrors) {
        listenPrintJSErrors();
    }

    // Handle and format top-level errors
    listPuppeteerErrors();

    await twitchLogin();
    await openStream();
})().catch(err => {
    error(`Unknown error in twitchAFK.ts: ${err}`);
});
