const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");
const fs = require("fs");

const config = require("./config");
const bot = new TelegramBot(config["botToken"], { polling: true });

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
                    
                    ids.push( c["confession_id"]);
                }
            });

            oldIds.push(...ids);
            fs.writeFileSync(config["databaseFile"], JSON.stringify(oldIds), { mode: 0775 });
            for (let i = 0; i < confessions_array.length; i++) {
                setTimeout(function () {
                    let msg = `${(confessions_array[i]["text"]).substring(0, 4061)}\nhttps://fb.com/${confessions_array[i]["id"]}`;
                    bot.sendMessage(config["adminChatId"], msg);
                }, 2000 * (i + 1));
            }

            setTimeout(() => {
                process.exit(0);
            }, 60000)
        }).catch(error => {
            console.log(`[!] Error: ${error}`);
            process.exit(1);
        })
}

fetchAPI()