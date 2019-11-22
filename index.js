process.env.NTBA_FIX_319 = 1;

const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");
const fs = require("fs");
const _ = require("async");

const config = require("./config.json");
config["chatIds"].push(config["adminChatId"]);
config["chatIds"] = [...new Set(config["chatIds"])];

const bot = new TelegramBot(config["botToken"], { polling: true });
const bot2 = new TelegramBot(config["botToken2"], { polling: true });

function chunkSubstr2(str, size) {
    let numChunks = str.length / size + .5 | 0;
    let chunks = new Array(numChunks);
    for (let i = 0, o = 0; i < numChunks; ++i, o += size) chunks[i] = str.substr(o, size);
    return chunks;
}

async function addRemoveUser(msg, isRemove = false, cid = null) {
    if (cid !== null && isRemove) {
        let i = config["chatIds"].findIndex(e => {
            return e === cid;
        });

        if (i < 0) return;
        return config["chatIds"].splice(i, 1);
    }

    let chatId = String(msg["from"]["id"]);
    let username = msg["from"]["username"] || chatId;
    if (chatId === config["adminChatId"]) return await sendMessage(config["adminChatId"], "What are you doing?");
    if (isRemove) {
        if (!config["chatIds"].includes(chatId)) return await sendMessage(chatId, "You are not subscribed. Typed /subscribe to start.");
        await sendMessage(config["adminChatId"], `[-] User  @${username} removed from chat.`);
        let i = config["chatIds"].findIndex(e => {
            return e === chatId;
        });

        if (i < 0) return;
        config["chatIds"].splice(i, 1);
        await sendMessage(chatId, "You will stop receiving any more confessions. Goodbye!");
    } else {
        if (config["chatIds"].includes(chatId)) return await sendMessage(chatId, "You are already subscribed");
        await sendMessage(config["adminChatId"], `[+] User  @${username} added to chat.`);
        config["chatIds"].push(chatId);
        await sendMessage(chatId, "Hi there! You will receive new NUSWhispers from now on!\n\nPlease join this channel as this bot will stop working at the end of this month.\nhttps://t.me/unofficialnuswhispers");
    }

    return fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

bot.onText(/\/(start|subscribe)/, (msg) => {
    return addRemoveUser(msg);
});

bot.onText(/\/(unsubscribe|stop)/, (msg) => {
    return addRemoveUser(msg, true);
});

bot.onText(/\/ping/, async msg => {
    return await sendMessage(msg.chat.id, "pong");
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    const resp = match[1];
    for (let i = 0; i < config["chatIds"].length; i++) {
        let chatId = config["chatIds"][i];
        await sendMessage(chatId, resp, { "disable_web_page_preview": true });
        await sleep(500);
    }

    return sendMessage(config["adminChatId"], "[-] Broadcast completed.");
});

async function sendMessage(chatId, message, opts = {}) {
    try {
        await bot.sendMessage(chatId, message, opts);
    } catch (error) {
        if (error.response && error.response.statusCode === 403) return addRemoveUser(null, true, chatId);
        return await sendMessage(config["adminChatId"], JSON.stringify(error, null, 2));
    }
}

const sleep = ms => {
    return new Promise(resolve => setTimeout(resolve, ms))
}

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    const resp = match[1];
    _.eachLimit(config["chatIds"], 1, async (chatId, ccb) => {
        await sendMessage(chatId, resp, { "disable_web_page_preview": true });
        setTimeout(() => {
            return ccb();
        }, 500);
    }, async (error) => {
        if (error) await sendMessage(config["adminChatId"], error);
        return await sendMessage(config["adminChatId"], "Broadcast completed.");
    });
});

async function fetchAPI() {
    try {
        let res = await fetch(`${config["NusWhisperAPI"]}${Math.floor(Date.now() / 1000)}`, {
            headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36" }
        });

        let json = await res.json();
        console.log(`[@] got results.`);
        let confessions = json["data"]["confessions"];
        if (typeof confessions === "undefined" || typeof confessions === null || !Array.isArray(confessions) || confessions.length < 1) return console.error("[@] nothing to send");
        let oldIds = [];
        console.log(`[@] got ${confessions.length} confessions.`);
        if (fs.existsSync(config["databaseFile"])) oldIds = JSON.parse(fs.readFileSync(config["databaseFile"], "utf-8"));
        let ids = [];
        let confessions_array = [];
        confessions.reverse().forEach(c => {
            if (!oldIds.includes(c["confession_id"])) {
                confessions_array.push({
                    id: c["fb_post_id"],
                    text: c["content"]
                });

                ids.push(c["confession_id"]);
            }
        });

        oldIds.push(...ids);
        fs.writeFileSync(config["databaseFile"], JSON.stringify(oldIds), { mode: 0775 });
        if (confessions_array.length < 1) return console.error("[@] nothing to send");
        console.log(`${confessions_array.length} confessions to send to ${config["chatIds"].length} users.`);
        await sendMessage(config["adminChatId"], `${confessions_array.length} confessions to send to ${config["chatIds"].length} users.`);
        await sendMessage(config["adminChatId"], JSON.stringify(config["chatIds"], null, 2));
        for (let c = 0; c < confessions_array.length; c++) {
            let msg = `${confessions_array[c]["text"]}\nhttps://fb.com/${confessions_array[c]["id"]}`;
            let msges = chunkSubstr2(msg, 4050);
            let currentUserIndex = 0;
            for (let u = 0; u < config["chatIds"].length; u++) {
                let chatId = config["chatIds"][u];
                if (msges.length > 1) {
                    for (let m = 0; m < msges.length; m++) {
                        await sleep(500);
                        await sendMessage(chatId, msges[m], { "disable_web_page_preview": true });
                        if (currentUserIndex === config["chatIds"].length - 1) await bot2.sendMessage("@unofficialnuswhispers", msges[m], { "disable_web_page_preview": true });
                    }
                } else {
                    await sendMessage(chatId, msg, { "disable_web_page_preview": true });
                    if (currentUserIndex === config["chatIds"].length - 1) await bot2.sendMessage("@unofficialnuswhispers", msg, { "disable_web_page_preview": true })
                }

                currentUserIndex += 1;
                await sleep(800);
            }

            await sleep(500);
        }

    } catch (error) {
        await sendMessage(config["adminChatId"], error);
        console.error(error);
    }
}

(async () => {
    console.log("[-] Bot is up and running.");
    await sendMessage(config["adminChatId"], "Bot is up and running.");
    setInterval(async () => {
        console.log("[-] Fetching now..");
        return await fetchAPI()
    }, 15 * 60000);
})();