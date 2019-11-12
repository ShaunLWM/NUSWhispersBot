const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");
const fs = require("fs");
const _ = require("async");

const config = require("./config.json");
const bot = new TelegramBot(config["botToken"], { polling: true });

function chunkSubstr2(str, size) {
    var numChunks = str.length / size + .5 | 0,
        chunks = new Array(numChunks);

    for (var i = 0, o = 0; i < numChunks; ++i, o += size) {
        chunks[i] = str.substr(o, size);
    }

    return chunks;
}

bot.onText(/\/start/, (msg, match) => {
    return addRemoveUser(msg);
});

bot.onText(/\/subscribe/, (msg, match) => {
    return addRemoveUser(msg);
});

function addRemoveUser(msg, isRemove = false) {
    let chatId = String(msg["from"]["id"]);
    let username = msg["from"]["username"] || chatId;
    if (chatId === config["adminChatId"]) {
        console.log("Here");
        return bot.sendMessage(config["adminChatId"], "What are you doing?");
    }
    if (isRemove) {
        if (!config["chatIds"].includes(chatId)) return bot.sendMessage(chatId, "You are not subscribed. Typed /subscribe to start.");
        bot.sendMessage(config["adminChatId"], `User  @${username} removed from chat.`);
        let i = config["chatIds"].findIndex(e => {
            return e === chatId;
        });

        if (i < 0) return;
        config["chatIds"].splice(i, 1);
        bot.sendMessage(chatId, "You will stop receiving any more whispers.");
    } else {
        if (config["chatIds"].includes(chatId)) return bot.sendMessage(chatId, "You are already subscribed");
        bot.sendMessage(config["adminChatId"], `User  @${username} added to chat.`);
        config["chatIds"].push(chatId);
        bot.sendMessage(chatId, "Hi there! You will receive new NUSWhispers from now on!");
    }

    return fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

bot.onText(/\/unsubscribe/, (msg, match) => {
    return addRemoveUser(msg, true);
});

bot.onText(/\/stop/, (msg, match) => {
    return addRemoveUser(msg, true);
});


function fetchAPI() {
    bot.getMe(result => {
        console.log(result);
    }).then(() => {
        return fetch(`${config["NusWhisperAPI"]}${Math.floor(Date.now() / 1000)}`, {
            headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36" }
        });
    }).then(res => res.json())
        .then(json => {
            console.log(`[@] got results.`);
            let confessions = json["data"]["confessions"];
            if (typeof confessions === "undefined" || typeof confessions === null || !Array.isArray(confessions) || confessions.length < 1) return console.log("nothing");
            let oldIds = [];
            console.log(`[@] got ${confessions.length} confessions.`);
            if (fs.existsSync(config["databaseFile"])) {
                oldIds = JSON.parse(fs.readFileSync(config["databaseFile"], "utf-8"));
            }

            let ids = [];
            let confessions_array = [];
            confessions.reverse().forEach(c => {
                if (!oldIds.includes(c["confession_id"])) {
                    confessions_array.push({
                        id: c["fb_post_id"],
                        text: c["content"]
                    })

                    ids.push(c["confession_id"]);
                }
            });

            oldIds.push(...ids);
            fs.writeFileSync(config["databaseFile"], JSON.stringify(oldIds), { mode: 0775 });
            config["chatIds"].push(config["adminChatId"]);
            bot.sendMessage(config["adminChatId"], `${confessions_array.length} confessions to send to ${config["chatIds"].length} users.`);
            bot.sendMessage(config["adminChatId"], JSON.stringify(config["chatIds"], null, 2));
            _.eachLimit(confessions_array, 1, (conf, cb) => {
                let msg = `${(conf["text"])}\nhttps://fb.com/${conf["id"]}`;
                let msges = chunkSubstr2(msg, 4050);
                _.eachLimit(config["chatIds"], 1, (chatId, ccb) => {
                    if (msges.length > 1) {
                        msges.map(m => {
                            bot.sendMessage(chatId, m);
                        });
                    } else {
                        bot.sendMessage(chatId, msg);
                    }

                    setTimeout(() => {
                        return ccb();
                    }, 1500);
                }, function (error) {
                    if (error) bot.sendMessage(config["adminChatId"], error);
                    return cb();
                });
            }, function (error) {
                if (error) bot.sendMessage(config["adminChatId"], error);
                bot.sendMessage(config["adminChatId"], "Done sending to all");
            });
        }).catch(error => {
            console.log(`[!] Error: ${error}`);
            return bot.sendMessage(config["adminChatId"], error);
        })
}

bot.sendMessage(config["adminChatId"], "Bot is up and running.");
setInterval(() => {
    bot.sendMessage(config["adminChatId"], "Fetching new confessions..");
    return fetchAPI()
}, 15 * 60000);