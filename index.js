const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");
const fs = require("fs");

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

bot.onText(/\/add (.+)/, (msg, match) => {
    const chatId = String(msg.chat.id);
    const resp = String(match[1]); // the captured "whatever"
    if (chatId !== config["adminChatId"]) return;
    if (config["chatIds"].includes(resp)) return bot.sendMessage(chatId, "User already in list");
    bot.sendMessage(chatId, "User added to chat. Please confirm.");
    config["chatIds"].push(resp);
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
    setTimeout(() => {
        bot.sendMessage(resp, "Hi there! You will receive new NUSWhispers from now on!");
    }, 2000);
});

bot.onText(/\/remove (.+)/, (msg, match) => {
    const chatId = String(msg.chat.id);
    const resp = String(match[1]); // the captured "whatever"
    if (chatId !== config["adminChatId"]) return;
    if (!config["chatIds"].includes(resp)) return bot.sendMessage(chatId, "User is not in list");
    bot.sendMessage(chatId, "User removed from chat. Please confirm.");
    let i = config["chatIds"].findIndex(e => {
        return e === resp;
    });

    if (i < 0) return bot.sendMessage(chatId, "User not found in arraylist");
    config["chatIds"].splice(i, 1);
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
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
            for (let o = 0; o < config["chatIds"].length; o++) {
                const chatId = config["chatIds"][o];
                for (let i = 0; i < confessions_array.length; i++) {
                    setTimeout(function () {
                        let msg = `${(confessions_array[i]["text"])}\nhttps://fb.com/${confessions_array[i]["id"]}`;
                        let msges = chunkSubstr2(msg, 4050);
                        if (msges.length > 1) {
                            return msges.map(m => {
                                return bot.sendMessage(chatId, m);
                            });
                        }

                        return bot.sendMessage(chatId, msg);
                    }, 2000 * (i + 1));
                }
            }

            setTimeout(() => {
                process.exit(0);
            }, 60000)
        }).catch(error => {
            console.log(`[!] Error: ${error}`);
            bot.sendMessage(config["adminChatId"], error);
            process.exit(1);
        })
}

setInterval(() => {
    fetchAPI()
}, 15 * 60000);