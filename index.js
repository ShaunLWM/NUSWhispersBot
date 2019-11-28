process.env.NTBA_FIX_319 = 1;

const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");
const fs = require("fs");

const config = require("./config.json");
let chatIds = new Set(config["chatIds"]);
chatIds.add(config["adminChatId"]);

const bot = new TelegramBot(config["botToken"], { polling: true });
const bot2 = new TelegramBot(config["botToken2"], { polling: true });

function chunkSubstr(str, size) {
    const numChunks = Math.ceil(str.length / size)
    const chunks = new Array(numChunks)
    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
        chunks[i] = str.substr(o, size)
    }

    return chunks
}

async function addRemoveUser(msg, isRemove = false, cid = null) {
    if (cid !== null && isRemove) {
        if (chatIds.has(cid)) chatIds.delete(cid);
        return;
    }

    let chatId = String(msg["from"]["id"]);
    let username = msg["from"]["username"] || chatId;
    if (chatId === config["adminChatId"]) return await sendMessage(config["adminChatId"], "What are you doing?");
    if (isRemove) {
        if (!chatIds.has(chatId)) return await sendMessage(chatId, "You are not subscribed. Typed /subscribe to start.");
        await sendMessage(config["adminChatId"], `[-] User  @${username} removed from chat.`);
        chatIds.delete(chatId);
        await sendMessage(chatId, "You will stop receiving any more confessions. Goodbye!");
    } else {
        if (chatIds.has(chatId)) return await sendMessage(chatId, "You are already subscribed");
        await sendMessage(config["adminChatId"], `[+] User  @${username} added to chat.`);
        chatIds.add(chatId);
        await sendMessage(chatId, "Hi there! You will receive new NUSWhispers from now on!\n\nPlease join this channel as this bot will stop working at the end of this month.\nhttps://t.me/unofficialnuswhispers");
    }

    config["chatIds"] = Array.from(chatIds);
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
    let chatIdIterator = chatIds.values();
    for (let i = 0; i < chatIds.size; i++) {
        let chatId = chatIdIterator.next().value;
        await sendMessage(chatId, resp);
        await sleep(500);
    }

    return sendMessage(config["adminChatId"], "[-] Broadcast completed.");
});

async function sendMessage(chatId, message, opts = { "disable_web_page_preview": true }) {
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

async function fetchConfessions() {
    try {
        let currentOffset = 0;
        let maxOffset = 30;
        let confessions_array = [];
        let oldIds = [];

        if (fs.existsSync(config["databaseFile"])) oldIds = JSON.parse(fs.readFileSync(config["databaseFile"], "utf-8"));
        while (currentOffset <= maxOffset) {
            let res = await fetch(`${config["NusWhisperAPI"]}${currentOffset}`, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36" }
            });

            let json = await res.json();
            let confessions = json["data"]["confessions"];
            if (typeof confessions === "undefined" || confessions === null || !Array.isArray(confessions) || confessions.length < 1) {
                currentOffset += 10;
                continue;
            }

            confessions.forEach(c => {
                if (!oldIds.includes(c["confession_id"])) {
                    confessions_array.push({
                        id: c["fb_post_id"],
                        text: c["content"]
                    });

                    oldIds.push(c["confession_id"]);
                }
            });

            currentOffset += 10;
        }

        fs.writeFileSync(config["databaseFile"], JSON.stringify(oldIds), { mode: 775 });
        return confessions_array.reverse();
    } catch (error) {
        await sendMessage(config["adminChatId"], error);
        return console.error(error);
    }
}

async function fetchAPI() {
    try {
        let confessions_array = await fetchConfessions();
        if (confessions_array.length < 1) return console.error("[@] nothing to send");
        console.log(`${confessions_array.length} confessions to send to ${chatIds.size} users.`);
        await sendMessage(config["adminChatId"], `${confessions_array.length} confessions to send to ${chatIds.size} users.`);
        await sendMessage(config["adminChatId"], JSON.stringify(Array.from(chatIds), null, 2));
        for (let c = 0; c < confessions_array.length; c++) {
            let msg = `${confessions_array[c]["text"]}\nhttps://fb.com/${confessions_array[c]["id"]}`;
            let msges = chunkSubstr(msg, 4050);
            let currentUserIndex = 0;
            let chatIdIterator = chatIds.values();
            for (let u = 0; u < chatIds.size; u++) {
                let chatId = chatIdIterator.next().value;
                if (msges.length > 1) {
                    for (let m = 0; m < msges.length; m++) {
                        await sleep(500);
                        await sendMessage(chatId, msges[m]);
                        if (currentUserIndex === chatIds.size - 1) await bot2.sendMessage("@unofficialnuswhispers", msges[m], { "disable_web_page_preview": true });
                    }
                } else {
                    await sendMessage(chatId, msg);
                    if (currentUserIndex === chatIds.size - 1) await bot2.sendMessage("@unofficialnuswhispers", msg, { "disable_web_page_preview": true })
                }

                currentUserIndex += 1;
                await sleep(800);
            }

            await sleep(500);
        }
    } catch (error) {
        await sendMessage(config["adminChatId"], error);
        return console.error(error);
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