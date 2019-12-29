process.env.NTBA_FIX_319 = 1;

const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");
const fs = require("fs");

const config = require("./config.json");
let chatIds = new Set(config["chatIds"]);
chatIds.add(config["adminChatId"]);

const bot = new TelegramBot(config["botToken"], { polling: true });
const bot2 = new TelegramBot(config["botToken2"], { polling: true });

let emojis = ["👍", "♥️", "😂", "😡", "😲", "😭"];

let reactionIds = [];
if (fs.existsSync(config["reactionFile"])) reactionIds = JSON.parse(fs.readFileSync(config["reactionFile"], "utf-8"));
console.log(`There are ${reactionIds.length} reactions in the array.`);

function generateReaction(id) {
    return { id, response: new Array(emojis.length).fill([]) }
}

function createKeyboard(id) { // confession id
    let reactionIndex = reactionIds.findIndex(val => val.id === id);
    let opts = {};
    if (reactionIndex > -1)
        opts = reactionIds[reactionIndex];
    else {
        opts = generateReaction(id);
        reactionIds.push(opts);
        fs.writeFileSync(config["reactionFile"], JSON.stringify(reactionIds), { mode: 775 });
    }

    let keyboard = emojis.map((e, i) => {
        if (opts["response"][i].length === 0)
            return { text: e, callback_data: `${id}-${i}` };
        return { text: `${e} ${opts["response"][i].length}`, callback_data: `${id}-${i}` };
    });

    return [keyboard];
}

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

bot2.on("error", error => bot.sendMessage(config["adminChatId"], JSON.stringify(error, null, 2)));
bot.on("error", error => bot.sendMessage(config["adminChatId"], JSON.stringify(error, null, 2)));

async function sendMessage(chatId, message, opts = { "disable_web_page_preview": true }) {
    try {
        if (typeof message === "object" && message !== null) message = message.toString();
        if (chatId === config["adminChatId"])
            return await bot.sendMessage(chatId, `>> ${message}`, opts);
        return await bot.sendMessage(chatId, message, opts);
    } catch (error) {
        if (error.response && error.response.statusCode === 403) return addRemoveUser(null, true, chatId);
        return await sendMessage(config["adminChatId"], JSON.stringify(error, null, 2));
    }
}

async function sendGroupMessage(msg, id) {
    try {
        await bot2.sendMessage("@unofficialnuswhispers", msg, {
            "disable_web_page_preview": true,
            reply_markup: JSON.stringify({
                inline_keyboard: createKeyboard(id)
            })
        });
    } catch (error) {
        return await sendMessage(config["adminChatId"], JSON.stringify(error, null, 2));
    }

}

bot2.on("callback_query", msg => {
    let text = msg["message"]["text"]; // telegram message itself
    let userId = msg["from"]["id"];
    let regexp = /(\d+)-(\d)/g;
    let match = regexp.exec(msg["data"]);
    if (match === null) return;
    let confessionId = match[1];
    let reactionArrayId = parseInt(match[2]);
    let reactionIndex = reactionIds.findIndex(val => val.id === confessionId);
    if (reactionIndex < 0) return bot2.answerCallbackQuery(msg.id, "Wrong reaction? What?!");
    if (reactionIds[reactionIndex]["response"][reactionArrayId].includes(userId)) return bot2.answerCallbackQuery(msg.id, "You have already reacted.");
    reactionIds[reactionIndex]["response"][reactionArrayId].push(userId);
    const opts = {
        chat_id: msg["message"]["chat"]["id"],
        message_id: msg["message"]["message_id"],
        disable_web_page_preview: true,
        reply_markup: JSON.stringify({
            inline_keyboard: createKeyboard(confessionId)
        })
    };

    fs.writeFileSync(config["reactionFile"], JSON.stringify(reactionIds), { mode: 775 });
    bot2.editMessageText(text, opts);
    return bot2.answerCallbackQuery(msg.id);
});

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
                        text: c["content"],
                        cid: c["confession_id"]
                    });

                    oldIds.push(c["confession_id"]);
                    reactionIds.push(generateReaction(c["confession_id"]));
                }
            });

            currentOffset += 10;
        }

        fs.writeFileSync(config["databaseFile"], JSON.stringify(oldIds), { mode: 775 });
        fs.writeFileSync(config["reactionFile"], JSON.stringify(reactionIds), { mode: 775 });
        return confessions_array.reverse();
    } catch (error) {
        await sendMessage(config["adminChatId"], error);
        console.error(error);
        return [];
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
            let chatIdIterator = chatIds.values();
            for (let u = 0; u < chatIds.size; u++) {
                let chatId = chatIdIterator.next().value;
                if (msges.length > 1) {
                    for (let m = 0; m < msges.length; m++) {
                        await sleep(500);
                        await sendMessage(chatId, msges[m]);
                        if (u === chatIds.size - 1) await sendGroupMessage(msges[m], confessions_array[c]["cid"]);
                    }
                } else {
                    await sendMessage(chatId, msg);
                    if (u === chatIds.size - 1) await sendGroupMessage(msg, confessions_array[c]["cid"]);
                }

                await sleep(800);
            }

            await sleep(500);
        }
    } catch (error) {
        await sendMessage(config["adminChatId"], JSON.stringify(error, null, 2));
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